const fs = require('fs');
const path = require('path');

const SETTINGS_FILE_NAME = 'settings.json';
const SETTINGS_VERSION = 2;
const MAX_SECTION_BYTES = 128 * 1024;
const ALLOWED_SECTIONS = new Set(['app', 'danmu', 'audio', 'windows', 'lottery']);
const MAX_LOTTERY_RESERVATIONS = 512;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createEmptyDocument() {
  return {
    version: SETTINGS_VERSION,
    updatedAt: '',
    sections: {}
  };
}

function getDocumentVersion(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function cloneSection(section, value) {
  if (!ALLOWED_SECTIONS.has(section)) throw new Error(`不支持的设置分区: ${section}`);
  if (!isPlainObject(value)) throw new Error(`设置分区 ${section} 必须是对象`);
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SECTION_BYTES) {
    throw new Error(`设置分区 ${section} 超过大小限制`);
  }
  const cloned = JSON.parse(serialized);
  // API Key 只能交给 Electron safeStorage，禁止意外写入公共 JSON。
  if (section === 'app') delete cloned.aiCurationApiKey;
  return cloned;
}

function normalizeDocument(value, options = {}) {
  if (!isPlainObject(value) || !isPlainObject(value.sections)) return createEmptyDocument();
  // 先做一次 JSON 克隆，既保证写入值可序列化，也保留未来版本新增的
  // 顶层元数据。旧版程序不得因为不认识这些字段就把它们抹掉。
  const clonedDocument = JSON.parse(JSON.stringify(value));
  const sourceVersion = getDocumentVersion(clonedDocument.version);
  const sections = {};
  for (const [section, sectionValue] of Object.entries(clonedDocument.sections)) {
    if (!ALLOWED_SECTIONS.has(section)) {
      // 未知分区可能属于更新版本；可以原样保留，但渲染进程仍不能主动写入。
      sections[section] = sectionValue;
      continue;
    }
    try { sections[section] = cloneSection(section, sectionValue); } catch {}
  }
  clonedDocument.version = sourceVersion > SETTINGS_VERSION || (options.preserveSourceVersion && sourceVersion)
    ? sourceVersion
    : SETTINGS_VERSION;
  clonedDocument.updatedAt = typeof clonedDocument.updatedAt === 'string' ? clonedDocument.updatedAt : '';
  clonedDocument.sections = sections;
  return clonedDocument;
}

function mergeSectionValues(currentValue, nextValue) {
  if (!isPlainObject(currentValue) || !isPlainObject(nextValue)) return nextValue;
  const entries = new Map(Object.entries(currentValue));
  for (const [key, value] of Object.entries(nextValue)) {
    const current = entries.get(key);
    entries.set(
      key,
      isPlainObject(current) && isPlainObject(value)
        ? mergeSectionValues(current, value)
        : value
    );
  }
  // Object.fromEntries 将 __proto__ 等名称创建为普通数据属性，不会修改原型链。
  return Object.fromEntries(entries);
}

function normalizeWinnerCount(value, fallback = 10) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(9999, Math.max(0, Math.round(parsed)))
    : fallback;
}

function normalizeLotteryBatchId(value) {
  const batchId = String(value || '').trim().slice(0, 160);
  return /^[A-Za-z0-9._:-]+$/.test(batchId) ? batchId : '';
}

function normalizeLotteryReservations(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const reservations = [];
  for (const item of value.slice(-MAX_LOTTERY_RESERVATIONS * 2)) {
    if (!isPlainObject(item)) continue;
    const batchId = normalizeLotteryBatchId(item.batchId);
    if (!batchId || seen.has(batchId)) continue;
    seen.add(batchId);
    reservations.push({
      batchId,
      reserved: Math.min(24, normalizeWinnerCount(item.reserved, 0)),
      status: item.status === 'finalized' ? 'finalized' : 'active',
      restored: Math.min(24, normalizeWinnerCount(item.restored, 0)),
      createdAt: Math.max(0, Math.round(Number(item.createdAt) || 0)),
      finalizedAt: Math.max(0, Math.round(Number(item.finalizedAt) || 0))
    });
  }
  return reservations.slice(-MAX_LOTTERY_RESERVATIONS);
}

function getLotteryMutationState(store) {
  if (!store || typeof store.read !== 'function' || typeof store.updateSections !== 'function') {
    throw new Error('无效的公共设置存储');
  }
  const document = store.read();
  const settings = isPlainObject(document.sections?.app) ? document.sections.app : {};
  const lottery = isPlainObject(document.sections?.lottery) ? document.sections.lottery : {};
  return {
    document,
    settings,
    reservations: normalizeLotteryReservations(lottery.reservations)
  };
}

function getLotteryMutationResult(document, reservation, overrides = {}) {
  const settings = isPlainObject(document.sections?.app) ? document.sections.app : {};
  return {
    batchId: reservation?.batchId || '',
    reserved: reservation?.reserved || 0,
    restored: reservation?.restored || 0,
    status: reservation?.status || 'missing',
    remainingWinnerCount: normalizeWinnerCount(settings.remainingWinnerCount),
    settings,
    ...overrides
  };
}

/**
 * 按稳定批次号预留中奖名额。相同批次重复调用只返回第一次的结果，因此即使
 * renderer 在落盘边界崩溃并重试，也不会重复扣减。legacyAlreadyReserved 仅用于
 * 接管旧版本已经扣过名额、但还没有主进程账本的待揭晓批次。
 */
function reserveLotteryBatch(store, rawRequest) {
  const batchId = normalizeLotteryBatchId(rawRequest?.batchId);
  if (!batchId) throw new Error('抽奖批次号无效');
  const requested = Math.min(24, normalizeWinnerCount(rawRequest?.requested, 0));
  const legacyAlreadyReserved = rawRequest?.legacyAlreadyReserved === true;
  const { document, settings, reservations } = getLotteryMutationState(store);
  const existing = reservations.find(item => item.batchId === batchId);
  if (existing) {
    return getLotteryMutationResult(document, existing, {
      reserved: existing.status === 'active' ? existing.reserved : 0,
      alreadyExisted: true
    });
  }

  const current = normalizeWinnerCount(settings.remainingWinnerCount);
  const reserved = legacyAlreadyReserved ? requested : Math.min(current, requested);
  const now = Date.now();
  const reservation = {
    batchId,
    reserved,
    status: reserved > 0 ? 'active' : 'finalized',
    restored: 0,
    createdAt: now,
    finalizedAt: reserved > 0 ? 0 : now
  };
  reservations.push(reservation);
  const nextReservations = reservations.slice(-MAX_LOTTERY_RESERVATIONS);
  const appPatch = legacyAlreadyReserved
    ? {}
    : { remainingWinnerCount: current - reserved };
  const updated = store.updateSections({
    app: appPatch,
    lottery: { reservations: nextReservations }
  });
  return getLotteryMutationResult(updated, reservation, { alreadyExisted: false });
}

/**
 * 完成或取消一个批次。unrevealed 是尚未真正揭晓的人数；第一次调用会返还，
 * 后续同批次调用只返回已完成状态，保证跨崩溃恢复也不会重复增加名额。
 */
function finalizeLotteryBatch(store, rawRequest) {
  const batchId = normalizeLotteryBatchId(rawRequest?.batchId);
  if (!batchId) throw new Error('抽奖批次号无效');
  const requestedRestore = Math.min(24, normalizeWinnerCount(rawRequest?.unrevealed, 0));
  const { document, settings, reservations } = getLotteryMutationState(store);
  const reservation = reservations.find(item => item.batchId === batchId);
  if (!reservation) return getLotteryMutationResult(document, null, { batchId });
  if (reservation.status === 'finalized') {
    return getLotteryMutationResult(document, reservation, {
      restored: 0,
      alreadyFinalized: true
    });
  }

  const current = normalizeWinnerCount(settings.remainingWinnerCount);
  const restored = Math.min(reservation.reserved, requestedRestore, 9999 - current);
  reservation.status = 'finalized';
  reservation.restored = restored;
  reservation.finalizedAt = Date.now();
  const updated = store.updateSections({
    app: { remainingWinnerCount: current + restored },
    lottery: { reservations }
  });
  return getLotteryMutationResult(updated, reservation, {
    restored,
    alreadyFinalized: false
  });
}

/**
 * 在主进程的单一权威文档上完成读-改-写，防止两个窗口同时从同一个旧值
 * 计算剩余名额后互相覆盖。此函数保持同步，调用期间不会穿插其它 IPC 写入。
 */
function consumeRemainingWinnerCount(store, requestedValue) {
  if (!store || typeof store.read !== 'function' || typeof store.updateSection !== 'function') {
    throw new Error('无效的公共设置存储');
  }
  const requested = normalizeWinnerCount(requestedValue, 0);
  const document = store.read();
  const currentSettings = isPlainObject(document.sections?.app) ? document.sections.app : {};
  const current = normalizeWinnerCount(currentSettings.remainingWinnerCount);
  const consumed = Math.min(current, requested);
  const remainingWinnerCount = current - consumed;
  const updated = consumed > 0
    ? store.updateSection('app', { remainingWinnerCount })
    : document;
  return {
    consumed,
    remainingWinnerCount,
    settings: isPlainObject(updated.sections?.app)
      ? updated.sections.app
      : { remainingWinnerCount }
  };
}

/** 由主进程直接设置剩余名额，和扣减/返还共用同一份同步权威文档。 */
function setRemainingWinnerCount(store, nextValue) {
  if (!store || typeof store.updateSection !== 'function') {
    throw new Error('无效的公共设置存储');
  }
  const remainingWinnerCount = normalizeWinnerCount(nextValue);
  const updated = store.updateSection('app', { remainingWinnerCount });
  return {
    remainingWinnerCount,
    settings: isPlainObject(updated.sections?.app)
      ? updated.sections.app
      : { remainingWinnerCount }
  };
}

/** 取消尚未揭晓的一批结果时原子返还已经预留的名额。 */
function restoreRemainingWinnerCount(store, requestedValue) {
  if (!store || typeof store.read !== 'function' || typeof store.updateSection !== 'function') {
    throw new Error('无效的公共设置存储');
  }
  const requested = normalizeWinnerCount(requestedValue, 0);
  const document = store.read();
  const currentSettings = isPlainObject(document.sections?.app) ? document.sections.app : {};
  const current = normalizeWinnerCount(currentSettings.remainingWinnerCount);
  const restored = Math.min(9999 - current, requested);
  const remainingWinnerCount = current + restored;
  const updated = restored > 0
    ? store.updateSection('app', { remainingWinnerCount })
    : document;
  return {
    restored,
    remainingWinnerCount,
    settings: isPlainObject(updated.sections?.app)
      ? updated.sections.app
      : { remainingWinnerCount }
  };
}

function createPersistentSettingsStore(rootDirectory) {
  const resolvedRoot = path.resolve(rootDirectory);
  const filePath = path.join(resolvedRoot, SETTINGS_FILE_NAME);
  const previousPath = path.join(resolvedRoot, 'settings.previous.json');

  function createTemporaryPath(label) {
    return path.join(
      resolvedRoot,
      `.${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
    );
  }

  function writeTemporaryFile(temporaryPath, contents) {
    const descriptor = fs.openSync(temporaryPath, 'wx');
    try {
      fs.writeFileSync(descriptor, contents, 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }

  function replaceWithTemporary(temporaryPath, targetPath) {
    if (process.platform !== 'win32' || !fs.existsSync(targetPath)) {
      fs.renameSync(temporaryPath, targetPath);
      return;
    }

    // Windows 不能可靠地用 rename 覆盖现有文件，因此先把旧文件移到一个
    // 独立交换路径。settings.previous.json 始终只承担有效备份职责。
    const displacedPath = createTemporaryPath('settings-displaced');
    fs.renameSync(targetPath, displacedPath);
    try {
      fs.renameSync(temporaryPath, targetPath);
    } catch (error) {
      if (!fs.existsSync(targetPath) && fs.existsSync(displacedPath)) {
        try { fs.renameSync(displacedPath, targetPath); } catch {}
      }
      throw error;
    }
    try { fs.unlinkSync(displacedPath); } catch {}
  }

  function parseStoredDocument(targetPath) {
    const contents = fs.readFileSync(targetPath, 'utf8');
    const parsed = JSON.parse(contents);
    if (!isPlainObject(parsed) || !isPlainObject(parsed.sections)) {
      throw new Error('设置文件结构无效');
    }
    return {
      contents,
      sourceVersion: getDocumentVersion(parsed.version),
      normalized: normalizeDocument(parsed)
    };
  }

  function restoreFromPrevious() {
    if (!fs.existsSync(previousPath)) return null;
    try {
      const previous = parseStoredDocument(previousPath);
      const temporaryPath = createTemporaryPath('settings-restore');
      try {
        writeTemporaryFile(temporaryPath, previous.contents);
        replaceWithTemporary(temporaryPath, filePath);
      } finally {
        try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch {}
      }
      return previous;
    } catch (error) {
      console.warn('[settings] 最近设置备份也无法读取:', error.message);
      return null;
    }
  }

  function preserveCorruptFile() {
    const backupPath = path.join(
      resolvedRoot,
      `settings.corrupt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    );
    try {
      fs.mkdirSync(resolvedRoot, { recursive: true });
      fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
    } catch {}
  }

  function finishRead(stored) {
    // 未来版本只读取当前程序认识的内容，绝不自动降级或改写原文件。
    if (stored.sourceVersion > SETTINGS_VERSION) return stored.normalized;
    return stored.sourceVersion === SETTINGS_VERSION
      ? stored.normalized
      : write(stored.normalized);
  }

  function read() {
    fs.mkdirSync(resolvedRoot, { recursive: true });
    if (!fs.existsSync(filePath)) {
      const restored = restoreFromPrevious();
      return restored ? finishRead(restored) : createEmptyDocument();
    }
    try {
      return finishRead(parseStoredDocument(filePath));
    } catch (error) {
      preserveCorruptFile();
      console.warn('[settings] 公共设置文件损坏，已保留备份:', error.message);
      const restored = restoreFromPrevious();
      return restored ? finishRead(restored) : createEmptyDocument();
    }
  }

  function write(document) {
    const normalized = normalizeDocument(document);
    normalized.updatedAt = new Date().toISOString();
    fs.mkdirSync(resolvedRoot, { recursive: true });
    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    const temporaryPath = createTemporaryPath('settings');
    const backupTemporaryPath = createTemporaryPath('settings-backup');

    // 正常更新时 previous 保存更新前的有效文档；首次写入或当前文档损坏时，
    // 用即将写入的新文档初始化备份，确保任何时刻都有一份可恢复内容。
    let backupDocument = serialized;
    if (fs.existsSync(filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (isPlainObject(parsed) && isPlainObject(parsed.sections)) {
          backupDocument = `${JSON.stringify(
            normalizeDocument(parsed, { preserveSourceVersion: true }),
            null,
            2
          )}\n`;
        }
      } catch {}
    }

    try {
      writeTemporaryFile(temporaryPath, serialized);
      writeTemporaryFile(backupTemporaryPath, backupDocument);
      replaceWithTemporary(backupTemporaryPath, previousPath);
      replaceWithTemporary(temporaryPath, filePath);
    } finally {
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      } catch {}
      try {
        if (fs.existsSync(backupTemporaryPath)) fs.unlinkSync(backupTemporaryPath);
      } catch {}
    }
    return normalized;
  }

  function updateSections(patch, options = {}) {
    if (!isPlainObject(patch)) throw new Error('设置更新必须是对象');
    const document = read();
    let changed = false;
    for (const [section, value] of Object.entries(patch)) {
      if (options.onlyMissing && Object.prototype.hasOwnProperty.call(document.sections, section)) continue;
      const merged = mergeSectionValues(document.sections[section], value);
      document.sections[section] = cloneSection(section, merged);
      changed = true;
    }
    return changed ? write(document) : document;
  }

  return {
    rootDirectory: resolvedRoot,
    filePath,
    previousPath,
    read,
    updateSection(section, value) {
      return updateSections({ [section]: value });
    },
    updateSections,
    seedMissingSections(sections) {
      return updateSections(sections, { onlyMissing: true });
    }
  };
}

module.exports = {
  SETTINGS_FILE_NAME,
  SETTINGS_VERSION,
  createPersistentSettingsStore,
  consumeRemainingWinnerCount,
  finalizeLotteryBatch,
  reserveLotteryBatch,
  restoreRemainingWinnerCount,
  setRemainingWinnerCount
};
