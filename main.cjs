/**
 * Electron 主进程
 *  - 启动代理服务器（server.cjs）
 *  - 创建应用窗口
 */

const { app, BrowserWindow, shell, ipcMain, net, dialog, clipboard, nativeImage, safeStorage, screen, session } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  filterCurationCandidates,
  isAllowedAICurationEndpoint,
  normalizeAICurationEndpoint,
  parseCurationSelectedIds
} = require('./ai-curation.cjs');
const { buildExcelWorkbook, normalizeExcelFileName } = require('./xlsx.cjs');
const {
  createPersistentSettingsStore,
  consumeRemainingWinnerCount: consumeStoredRemainingWinnerCount,
  finalizeLotteryBatch: finalizeStoredLotteryBatch,
  reserveLotteryBatch: reserveStoredLotteryBatch,
  restoreRemainingWinnerCount: restoreStoredRemainingWinnerCount,
  setRemainingWinnerCount: setStoredRemainingWinnerCount
} = require('./persistent-settings.cjs');
const {
  calculateHighlightWindowBounds,
  calculateResizeBounds,
  fitAspectRatioBounds,
  fitWindowBoundsToWorkArea,
  normalizeWindowSize
} = require('./window-layout.cjs');
const { openSafeZip, writeSafeZipFile } = require('./safe-zip.cjs');
const { readResponseBuffer, readResponseText } = require('./response-body.cjs');
const { fetchAllowedRemoteImage } = require('./remote-image-url.cjs');
const { getTrustedRendererMode } = require('./trusted-renderer-url.cjs');
const { createRendererRecoveryPolicy } = require('./renderer-recovery-policy.cjs');

const PORT = 15173;
const APP_ORIGIN = `http://127.0.0.1:${PORT}`;
const LEGACY_APP_ORIGIN = `http://localhost:${PORT}`;
const LIVE_OVERLAY_WINDOW_TITLE = '直播顶部信息条（绿幕采集） - 抖音弹幕姬';
const LIVE_OVERLAY_ASPECT_RATIO = 5.4;
const LIVE_OVERLAY_MIN_HEIGHT = 120;
const LIVE_OVERLAY_MIN_WIDTH = Math.ceil(LIVE_OVERLAY_MIN_HEIGHT * LIVE_OVERLAY_ASPECT_RATIO);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
// 抽奖位于飘屏层；侧边栏在抽奖期间再升一级；从侧边栏点开的置顶弹幕最高。
const DANMU_WINDOW_LEVEL = 'pop-up-menu';
const SIDEBAR_WINDOW_LEVEL = 'screen-saver';
const SIDEBAR_WINDOW_RELATIVE_LEVEL = 1;
const HIGHLIGHT_WINDOW_LEVEL = 'screen-saver';
const HIGHLIGHT_WINDOW_RELATIVE_LEVEL = 2;
const HIGHLIGHT_WINDOW_MARGIN = 24;
const HIGHLIGHT_WINDOW_MIN_WIDTH = 680;
const HIGHLIGHT_WINDOW_MIN_HEIGHT = 520;
// Windows 会为可缩放的透明无边框窗口附加 WS_THICKFRAME，并在顶部绘制一条
// 系统边线。辅助窗口使用应用内移动/放大能力，关闭系统框可避免这条白边。
const TRANSPARENT_AUXILIARY_WINDOW_CHROME = process.platform === 'win32'
  ? {
      thickFrame: false,
      hasShadow: false,
      roundedCorners: false,
      accentColor: false,
      backgroundMaterial: 'none'
    }
  : { hasShadow: false };
let mainWindow = null;
let danmuWindow = null;
let displayWindow = null;
let liveOverlayWindow = null;
let liveOverlaySaveTimer = null;
let displayPinnedPreference = true;
let lotteryOverlayActive = false;
let highlightWindow = null;
let highlightRestoreBounds = null;
let highlightWindowReady = false;
let pendingHighlightPayload = null;
let lastHighlightPayload = null;
const auxiliaryResizeSessions = new Map();
const rendererRecoveryPolicy = createRendererRecoveryPolicy();
let serverInstance = null;
let isQuitting = !hasSingleInstanceLock;
let isStarting = hasSingleInstanceLock;
let shouldFocusMainOnReady = false;
let persistentSettingsStore = null;
let persistentStorageRoot = '';
let windowDisplayConfig = {
  danmuDisplayId: 'auto',
  sidebarDisplayId: 'auto',
  sidebarAlwaysOnTop: true,
  liveOverlayBounds: null
};

function getInternalWindowMode(rawUrl) {
  const mode = getTrustedRendererMode(rawUrl, APP_ORIGIN);
  return mode === 'danmu' || mode === 'display' || mode === 'live-info' ? mode : '';
}

function openExternalHttpUrl(rawUrl) {
  try {
    const target = new URL(rawUrl);
    if (target.protocol === 'http:' || target.protocol === 'https:') {
      void shell.openExternal(target.toString());
    }
  } catch {}
}

function guardAuxiliaryWindowNavigation(targetWindow, expectedMode) {
  targetWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).origin === APP_ORIGIN) return { action: 'deny' };
    } catch {}
    openExternalHttpUrl(url);
    return { action: 'deny' };
  });
  targetWindow.webContents.on('will-navigate', (event, url) => {
    if (getTrustedRendererMode(url, APP_ORIGIN) === expectedMode) return;
    event.preventDefault();
    try {
      if (new URL(url).origin !== APP_ORIGIN) openExternalHttpUrl(url);
    } catch {}
  });
}

/**
 * Chromium/GPU/解码异常不应让一个仍存在但已经失活的 BrowserWindow 永久卡住。
 * 同一个窗口角色在一分钟内最多自动恢复三次，避免真正的崩溃循环反复闪屏。
 */
const RENDERER_RECOVERY_LOAD_TIMEOUT_MS = 20_000;

function attachRendererRecovery(targetWindow, role, hooks = {}) {
  let recoveryPending = false;
  let recoveryStopped = false;
  let recoveryGeneration = 0;
  let recoveryTimer = null;
  let retryActiveRecovery = null;
  let unresponsiveTimer = null;

  const clearUnresponsiveTimer = () => {
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
    unresponsiveTimer = null;
  };
  const recover = reason => {
    if (recoveryStopped || isQuitting || targetWindow.isDestroyed()) return;
    if (recoveryPending) {
      // reload 已经开始后再次崩溃，必须结束这一轮并进入下一次有限重试；
      // 仍在退避计时阶段时保留原计划即可。
      retryActiveRecovery?.(reason);
      return;
    }
    recoveryPending = true;
    const attemptGeneration = ++recoveryGeneration;
    clearUnresponsiveTimer();
    const decision = rendererRecoveryPolicy.register(role);
    console.error(`[renderer] ${role}异常退出或失去响应: ${reason}`);
    if (!decision.allowed) {
      recoveryPending = false;
      recoveryStopped = true;
      dialog.showErrorBox(
        `${role}已停止自动恢复`,
        `${role}在短时间内连续异常。为避免反复闪屏，已停止自动恢复，请重新启动软件。`
      );
      return;
    }

    try {
      hooks.beforeReload?.();
    } catch (error) {
      console.error(`[renderer] ${role}恢复前处理失败:`, error);
    }
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      if (
        attemptGeneration !== recoveryGeneration || isQuitting || targetWindow.isDestroyed()
        || targetWindow.webContents.isDestroyed()
      ) {
        recoveryPending = false;
        return;
      }

      const webContents = targetWindow.webContents;
      let settled = false;
      let loadTimeout = null;
      let retryThisAttempt = null;
      const cleanupAttempt = () => {
        if (loadTimeout) clearTimeout(loadTimeout);
        loadTimeout = null;
        webContents.removeListener('did-finish-load', handleLoadSuccess);
        webContents.removeListener('did-fail-load', handleLoadFailure);
        if (retryActiveRecovery === retryThisAttempt) retryActiveRecovery = null;
      };
      const settleAttempt = (succeeded, failureReason = '') => {
        if (settled) return;
        settled = true;
        cleanupAttempt();
        if (attemptGeneration !== recoveryGeneration) return;
        recoveryPending = false;
        if (succeeded) {
          clearUnresponsiveTimer();
          try {
            hooks.afterReload?.();
          } catch (error) {
            console.error(`[renderer] ${role}恢复后处理失败:`, error);
          }
          return;
        }
        console.error(`[renderer] ${role}恢复加载失败: ${failureReason}`);
        try { webContents.stop(); } catch {}
        if (!isQuitting && !targetWindow.isDestroyed()) {
          setTimeout(() => {
            if (attemptGeneration === recoveryGeneration) {
              recover(failureReason || 'reload-failed');
            }
          }, 0);
        }
      };
      function handleLoadSuccess() {
        settleAttempt(true);
      }
      function handleLoadFailure(_event, errorCode, errorDescription, _validatedURL, isMainFrame) {
        // 子框架失败及 reload 取消旧导航的 ERR_ABORTED 不代表应用页加载失败。
        if (isMainFrame === false || errorCode === -3) return;
        settleAttempt(false, `did-fail-load ${errorCode}: ${errorDescription || 'unknown'}`);
      }

      webContents.on('did-finish-load', handleLoadSuccess);
      webContents.on('did-fail-load', handleLoadFailure);
      retryThisAttempt = nextReason => settleAttempt(false, nextReason || 'render-process-gone-during-reload');
      retryActiveRecovery = retryThisAttempt;
      loadTimeout = setTimeout(
        () => settleAttempt(false, 'reload-timeout'),
        RENDERER_RECOVERY_LOAD_TIMEOUT_MS
      );
      try {
        webContents.reloadIgnoringCache();
      } catch (error) {
        console.error(`[renderer] ${role}恢复失败:`, error);
        settleAttempt(false, 'reload-threw');
      }
    }, decision.delayMs);
  };

  targetWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details?.reason === 'clean-exit') return;
    recover(details?.reason || 'render-process-gone');
  });
  targetWindow.on('unresponsive', () => {
    clearUnresponsiveTimer();
    unresponsiveTimer = setTimeout(() => recover('unresponsive'), 15_000);
  });
  targetWindow.on('responsive', clearUnresponsiveTimer);
  targetWindow.on('closed', () => {
    clearUnresponsiveTimer();
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    retryActiveRecovery?.('window-closed');
    retryActiveRecovery = null;
    recoveryGeneration += 1;
    recoveryPending = false;
  });
}

const AUDIO_CATEGORIES = new Set(['charging', 'lottery', 'winner']);
const AUDIO_CATEGORY_DIRS = { charging: '充能', lottery: '揭晓', winner: 'Happy' };
const LEGACY_AUDIO_CATEGORY_DIRS = { lottery: '抽奖', winner: '中奖' };
const migratedAudioCategories = new Set();
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm']);
const MAX_AUDIO_FILE_SIZE = 100 * 1024 * 1024;
const MAX_AUDIO_PACK_SIZE = 1024 * 1024 * 1024;
const MAX_AUDIO_PACK_TRACKS = 300;
const MAX_AUDIO_PACK_ENTRIES = MAX_AUDIO_PACK_TRACKS + 16;
const MAX_AUDIO_PACK_MANIFEST_SIZE = 2 * 1024 * 1024;
const MAX_AUDIO_PACK_EXPANDED_SIZE = MAX_AUDIO_PACK_SIZE + MAX_AUDIO_PACK_MANIFEST_SIZE;
const MAX_AUDIO_PACK_ARCHIVE_SIZE = MAX_AUDIO_PACK_SIZE + 64 * 1024 * 1024;

function resolvePersistentStorageRoot() {
  if (persistentStorageRoot) return persistentStorageRoot;
  const candidates = [];
  if (process.platform === 'win32' && process.env.PUBLIC) {
    candidates.push(path.join(process.env.PUBLIC, 'Documents', 'DyCast'));
  }
  candidates.push(path.join(app.getPath('documents'), 'DyCast'));
  candidates.push(path.join(app.getPath('userData'), 'persistent'));

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK);
      persistentStorageRoot = path.resolve(candidate);
      return persistentStorageRoot;
    } catch {}
  }
  throw new Error('无法创建应用公共设置目录');
}

function getPersistentSettingsStore() {
  if (!persistentSettingsStore) {
    persistentSettingsStore = createPersistentSettingsStore(resolvePersistentStorageRoot());
  }
  return persistentSettingsStore;
}

function copyLegacyDataIfMissing(relativePath) {
  const legacyPath = path.join(app.getPath('userData'), relativePath);
  const targetPath = path.join(resolvePersistentStorageRoot(), relativePath);
  if (path.resolve(legacyPath) === path.resolve(targetPath)) return;
  if (!fs.existsSync(legacyPath)) return;
  try {
    const copyMissing = (source, target) => {
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const entry of fs.readdirSync(source)) {
          copyMissing(path.join(source, entry), path.join(target, entry));
        }
        return;
      }
      if (fs.existsSync(target)) return;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    };
    copyMissing(legacyPath, targetPath);
  } catch (error) {
    console.warn(`[settings] 迁移旧数据失败: ${relativePath}`, error);
  }
}

function initializePersistentStorage() {
  getPersistentSettingsStore();
  // 只复制，不删除旧文件，便于在迁移异常时回退。
  copyLegacyDataIfMissing('audio');
  console.info(`[settings] 公共配置目录: ${resolvePersistentStorageRoot()}`);
}

function getAudioRoot() {
  return path.join(resolvePersistentStorageRoot(), 'audio');
}

function getAudioCategoryDir(category) {
  if (!AUDIO_CATEGORIES.has(category)) throw new Error('无效的音频分类');
  const targetDirectory = path.join(getAudioRoot(), AUDIO_CATEGORY_DIRS[category]);
  if (!migratedAudioCategories.has(category)) {
    migratedAudioCategories.add(category);
    const legacyName = LEGACY_AUDIO_CATEGORY_DIRS[category];
    const legacyDirectory = legacyName ? path.join(getAudioRoot(), legacyName) : '';
    if (legacyDirectory && fs.existsSync(legacyDirectory) && legacyDirectory !== targetDirectory) {
      fs.mkdirSync(path.dirname(targetDirectory), { recursive: true });
      if (!fs.existsSync(targetDirectory)) {
        fs.renameSync(legacyDirectory, targetDirectory);
      } else {
        for (const entry of fs.readdirSync(legacyDirectory, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const sourcePath = path.join(legacyDirectory, entry.name);
          let targetPath = path.join(targetDirectory, entry.name);
          if (fs.existsSync(targetPath)) {
            targetPath = path.join(
              targetDirectory,
              `${Date.now()}-${Math.random().toString(36).slice(2, 8)}--${entry.name}`
            );
          }
          fs.renameSync(sourcePath, targetPath);
        }
        try { fs.rmdirSync(legacyDirectory); } catch {}
      }
    }
  }
  return targetDirectory;
}

function getAudioMime(fileName) {
  const mimeMap = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.webm': 'audio/webm'
  };
  return mimeMap[path.extname(fileName).toLowerCase()] || 'audio/mpeg';
}

function sanitizeAudioFileName(fileName) {
  return path.basename(fileName).replace(/[<>:"/\\|?*]/g, '_');
}

function copyAudioPaths(category, sourcePaths) {
  const directory = getAudioCategoryDir(category);
  fs.mkdirSync(directory, { recursive: true });
  const copied = [];
  for (const sourcePath of sourcePaths) {
    const resolvedPath = path.resolve(String(sourcePath));
    const extension = path.extname(resolvedPath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) continue;
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile() || stat.size > MAX_AUDIO_FILE_SIZE) continue;
    const originalName = sanitizeAudioFileName(resolvedPath);
    const targetName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}--${originalName}`;
    fs.copyFileSync(resolvedPath, path.join(directory, targetName));
    copied.push({ name: originalName, id: `local:${category}:${targetName}` });
  }
  return copied;
}

function listLocalAudioFiles() {
  const result = [];
  for (const category of AUDIO_CATEGORIES) {
    const directory = getAudioCategoryDir(category);
    fs.mkdirSync(directory, { recursive: true });
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = fs.statSync(path.join(directory, entry.name));
      const separatorIndex = entry.name.indexOf('--');
      const storedName = separatorIndex >= 0 ? entry.name.slice(separatorIndex + 2) : entry.name;
      result.push({
        id: `local:${category}:${entry.name}`,
        category,
        name: path.basename(storedName, path.extname(storedName)),
        mimeType: getAudioMime(entry.name),
        size: stat.size,
        url: `/local-audio/${encodeURIComponent(category)}/${encodeURIComponent(entry.name)}`,
        createdAt: stat.birthtimeMs || stat.mtimeMs
      });
    }
  }
  return result;
}

ipcMain.handle('audio:list', (event) => {
  assertTrustedAppSender(event);
  return listLocalAudioFiles();
});

ipcMain.handle('audio:import', async (event, category) => {
  assertTrustedAppSender(event);
  const directory = getAudioCategoryDir(category);
  fs.mkdirSync(directory, { recursive: true });
  const options = {
    title: '选择音频文件',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm'] }
    ]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  if (result.canceled) return { canceled: true, files: [] };
  const copied = copyAudioPaths(category, result.filePaths);
  return { canceled: false, files: copied.map(file => file.name) };
});

ipcMain.handle('audio:import-paths', (event, category, sourcePaths) => {
  assertTrustedAppSender(event);
  if (!Array.isArray(sourcePaths)) throw new Error('无效的拖拽文件');
  return copyAudioPaths(category, sourcePaths.slice(0, MAX_AUDIO_PACK_TRACKS)).map(file => file.name);
});

ipcMain.handle('audio:delete', (event, id) => {
  assertTrustedAppSender(event);
  const match = /^local:(charging|lottery|winner):(.+)$/.exec(String(id));
  if (!match || path.basename(match[2]) !== match[2]) throw new Error('无效的音频文件');
  const filePath = path.join(getAudioCategoryDir(match[1]), match[2]);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return true;
});

ipcMain.handle('audio:open-folder', async (event) => {
  assertTrustedAppSender(event);
  const audioRoot = getAudioRoot();
  for (const category of AUDIO_CATEGORIES) fs.mkdirSync(getAudioCategoryDir(category), { recursive: true });
  return shell.openPath(audioRoot);
});

ipcMain.handle('audio:pack-export', async (event, config) => {
  assertTrustedAppSender(event);
  const options = {
    title: '分享音频包',
    defaultPath: `dycast-audio-pack-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [{ name: 'DyCast 音频包', extensions: ['zip'] }]
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { canceled: true, filePath: '' };

  const zipEntries = [];
  const tracks = [];
  const localTracks = listLocalAudioFiles();
  if (localTracks.length > MAX_AUDIO_PACK_TRACKS) throw new Error('音频包曲目过多');
  localTracks.forEach((track, index) => {
    const prefix = `local:${track.category}:`;
    const storedFileName = track.id.slice(prefix.length);
    const sourcePath = path.join(getAudioCategoryDir(track.category), storedFileName);
    const archivePath = `audio/${track.category}/${String(index + 1).padStart(3, '0')}-${sanitizeAudioFileName(storedFileName)}`;
    zipEntries.push({ archivePath, filePath: sourcePath });
    tracks.push({
      id: track.id,
      category: track.category,
      name: track.name,
      archivePath,
      mimeType: track.mimeType,
      size: track.size
    });
  });
  const manifest = {
    format: 'dycast-audio-pack',
    version: 1,
    createdAt: new Date().toISOString(),
    tracks,
    settings: config || {}
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
  if (manifestBytes.length > MAX_AUDIO_PACK_MANIFEST_SIZE) throw new Error('音频包配置过大');
  zipEntries.push({ archivePath: 'manifest.json', data: manifestBytes });
  await writeSafeZipFile(result.filePath, zipEntries, {
    maxEntries: MAX_AUDIO_PACK_ENTRIES,
    maxEntrySize: MAX_AUDIO_FILE_SIZE,
    maxTotalSize: MAX_AUDIO_PACK_EXPANDED_SIZE,
    maxArchiveSize: MAX_AUDIO_PACK_ARCHIVE_SIZE
  });
  return { canceled: false, filePath: result.filePath, count: tracks.length };
});

function remapImportedAudioConfig(settings, idMap) {
  const result = {};
  const modes = new Set(['random', 'single', 'list']);
  const rawVolume = Number(settings?.masterVolume);
  for (const category of AUDIO_CATEGORIES) {
    const source = settings?.configs?.[category] || {};
    const selected = String(source.selectedTrackId || '');
    const builtinId = `builtin:${category}`;
    result[category] = {
      mode: modes.has(source.mode) ? source.mode : 'single',
      selectedTrackId: selected === builtinId ? selected : (idMap.get(selected) || builtinId),
      disabledTrackIds: Array.isArray(source.disabledTrackIds)
        ? source.disabledTrackIds.map(id => String(id) === builtinId ? builtinId : idMap.get(String(id))).filter(Boolean)
        : []
    };
  }
  return {
    configs: result,
    masterVolume: Number.isFinite(rawVolume) ? Math.min(100, Math.max(0, Math.round(rawVolume))) : 70,
    volumeNormalization: settings?.volumeNormalization !== false
  };
}

ipcMain.handle('audio:pack-import', async (event, droppedPath) => {
  assertTrustedAppSender(event);
  let sourcePath = droppedPath ? path.resolve(String(droppedPath)) : '';
  if (!sourcePath) {
    const options = {
      title: '导入 DyCast 音频包',
      properties: ['openFile'],
      filters: [{ name: 'DyCast 音频包', extensions: ['zip'] }]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { canceled: true, files: [], count: 0 };
    sourcePath = path.resolve(result.filePaths[0]);
  }
  if (path.extname(sourcePath).toLowerCase() !== '.zip' || !fs.statSync(sourcePath).isFile()) {
    throw new Error('请选择正确的 ZIP 音频包');
  }

  const archive = await openSafeZip(sourcePath, {
    maxEntries: MAX_AUDIO_PACK_ENTRIES,
    maxEntrySize: MAX_AUDIO_FILE_SIZE,
    maxTotalSize: MAX_AUDIO_PACK_EXPANDED_SIZE,
    maxArchiveSize: MAX_AUDIO_PACK_ARCHIVE_SIZE
  });
  try {
    const manifestEntry = archive.getEntry('manifest.json');
    if (!manifestEntry || manifestEntry.isDirectory) throw new Error('音频包缺少 manifest.json');
    const manifestBytes = await archive.readBuffer('manifest.json', { maxSize: MAX_AUDIO_PACK_MANIFEST_SIZE });
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    if (manifest.format !== 'dycast-audio-pack' || manifest.version !== 1 || !Array.isArray(manifest.tracks)) {
      throw new Error('不支持的音频包格式');
    }
    if (manifest.tracks.length > MAX_AUDIO_PACK_TRACKS) throw new Error('音频包曲目过多');

    let totalSize = 0;
    const referencedPaths = new Set();
    const validated = manifest.tracks.map(track => {
      if (!AUDIO_CATEGORIES.has(track.category)) throw new Error('音频包包含无效分类');
      const archivePath = String(track.archivePath || '').replace(/\\/g, '/');
      if (!archivePath.startsWith(`audio/${track.category}/`) || archivePath.includes('../')) {
        throw new Error('音频包路径无效');
      }
      const entry = archive.getEntry(archivePath);
      if (!entry || entry.isDirectory) throw new Error(`音频包缺少文件：${archivePath}`);
      const canonicalPath = entry.archivePath.normalize('NFC').toLowerCase();
      if (referencedPaths.has(canonicalPath)) throw new Error(`音频包重复引用文件：${archivePath}`);
      referencedPaths.add(canonicalPath);
      const extension = path.extname(archivePath).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(extension)) throw new Error('音频包包含不支持的格式');
      const size = entry.uncompressedSize;
      if (!Number.isSafeInteger(size) || size > MAX_AUDIO_FILE_SIZE) throw new Error('音频包存在超大文件');
      totalSize += size;
      return { track, archivePath: entry.archivePath, extension };
    });
    if (!Number.isSafeInteger(totalSize) || totalSize > MAX_AUDIO_PACK_SIZE) {
      throw new Error('音频包总大小超过 1GB');
    }

    const createdFiles = [];
    const idMap = new Map();
    try {
      for (const { track, archivePath, extension } of validated) {
        const directory = getAudioCategoryDir(track.category);
        fs.mkdirSync(directory, { recursive: true });
        const baseName = sanitizeAudioFileName(`${track.name || '音频'}${extension}`);
        const targetName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}--${baseName}`;
        const targetPath = path.join(directory, targetName);
        await archive.extractToFile(archivePath, targetPath, { maxSize: MAX_AUDIO_FILE_SIZE });
        createdFiles.push(targetPath);
        idMap.set(String(track.id), `local:${track.category}:${targetName}`);
      }
    } catch (error) {
      createdFiles.forEach(filePath => { try { fs.unlinkSync(filePath); } catch {} });
      throw error;
    }

    return {
      canceled: false,
      files: validated.map(item => String(item.track.name || '音频')),
      count: validated.length,
      settings: remapImportedAudioConfig(manifest.settings, idMap)
    };
  } finally {
    archive.close();
  }
});

// 中奖名单导出：由主进程读取远程头像，避免 Canvas 跨域污染。
ipcMain.handle('image:fetch-data-url', async (event, rawUrl) => {
  assertTrustedAppSender(event);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // 只允许抖音图片 CDN，并逐跳校验重定向，避免导出头像被利用去读取本机服务。
    const response = await fetchAllowedRemoteImage(
      (url, options) => net.fetch(url, options),
      rawUrl,
      controller.signal
    );
    if (!response.ok) throw new Error(`头像读取失败：${response.status}`);
    const contentType = (response.headers.get('content-type') || 'image/png')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') {
      throw new Error('头像响应不是受支持的图片');
    }
    const bytes = await readResponseBuffer(response, 8 * 1024 * 1024, '头像文件');
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('头像读取超时');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
});

ipcMain.handle('clipboard:write-image', (event, dataUrl) => {
  assertTrustedAppSender(event);
  const image = nativeImage.createFromDataURL(String(dataUrl));
  if (image.isEmpty()) throw new Error('生成的 PNG 无效');
  clipboard.writeImage(image);
  return true;
});

ipcMain.handle('excel:save-workbook', async (event, config) => {
  assertTrustedAppSender(event);
  const options = {
    title: String(config?.dialogTitle || '导出 Excel 表格').slice(0, 80),
    defaultPath: normalizeExcelFileName(config?.fileName),
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  };
  const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { canceled: true, filePath: '' };
  const filePath = result.filePath.toLowerCase().endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`;
  const workbook = await buildExcelWorkbook(config);
  await fs.promises.writeFile(filePath, workbook);
  return { canceled: false, filePath, rowCount: Math.min(10000, Array.isArray(config?.rows) ? config.rows.length : 0) };
});

function isTrustedAppSender(event) {
  try {
    return Boolean(getTrustedRendererMode(event.sender.getURL(), APP_ORIGIN));
  } catch {
    return false;
  }
}

function assertTrustedAppSender(event) {
  if (!isTrustedAppSender(event)) {
    throw new Error('拒绝来自非应用页面的请求');
  }
}

const RENDERER_SETTING_SECTIONS = new Set(['app', 'danmu', 'audio']);
const SETTINGS_FLUSH_TIMEOUT_MS = 1500;
const settingsFlushReadySenderIds = new Set();
const pendingSettingsFlushRequests = new Map();
let nextSettingsFlushRequestId = 1;
let settingsShutdownFlushPromise = null;
let settingsShutdownFlushCompleted = false;

function getPersistentStorageInfo() {
  const store = getPersistentSettingsStore();
  const publicRoot = process.platform === 'win32' && process.env.PUBLIC
    ? path.resolve(path.join(process.env.PUBLIC, 'Documents', 'DyCast'))
    : '';
  return {
    directory: store.rootDirectory,
    filePath: store.filePath,
    isPublicDirectory: Boolean(
      publicRoot && store.rootDirectory.toLowerCase() === publicRoot.toLowerCase()
    )
  };
}

function broadcastPersistentSettingsSection(section, value, canonicalPatch = null) {
  for (const targetWindow of BrowserWindow.getAllWindows()) {
    if (targetWindow.isDestroyed() || targetWindow.webContents.isDestroyed()) continue;
    if (!getTrustedRendererMode(targetWindow.webContents.getURL(), APP_ORIGIN)) continue;
    try {
      targetWindow.webContents.send('settings:section-updated', section, value, canonicalPatch);
    } catch {}
  }
}

function settleSettingsFlushRequest(requestId, succeeded) {
  const pending = pendingSettingsFlushRequests.get(requestId);
  if (!pending) return;
  pendingSettingsFlushRequests.delete(requestId);
  clearTimeout(pending.timeout);
  try { pending.webContents.removeListener('destroyed', pending.onDestroyed); } catch {}
  pending.resolve(Boolean(succeeded));
}

function requestRendererSettingsFlush(webContents) {
  return new Promise(resolve => {
    if (!webContents || webContents.isDestroyed()) {
      resolve(false);
      return;
    }
    const requestId = `${process.pid}-${Date.now()}-${nextSettingsFlushRequestId++}`;
    const onDestroyed = () => settleSettingsFlushRequest(requestId, false);
    const timeout = setTimeout(() => settleSettingsFlushRequest(requestId, false), SETTINGS_FLUSH_TIMEOUT_MS);
    pendingSettingsFlushRequests.set(requestId, {
      senderId: webContents.id,
      webContents,
      onDestroyed,
      timeout,
      resolve
    });
    webContents.once('destroyed', onDestroyed);
    try {
      webContents.send('settings:flush-request', requestId);
    } catch {
      settleSettingsFlushRequest(requestId, false);
    }
  });
}

async function flushTrustedRendererSettingsBeforeQuit() {
  // 先冻结并完成已经发起的弹幕重置（包括主窗口 fallback），再要求各 renderer
  // 刷新设置队列；否则 1.5 秒的设置握手可能早于 5 秒 reset 超时而直接退出。
  await waitForPendingDanmuStateResetRequests();
  const candidates = BrowserWindow.getAllWindows()
    .map(targetWindow => targetWindow.webContents)
    .filter(webContents => (
      !webContents.isDestroyed()
      && settingsFlushReadySenderIds.has(webContents.id)
      && Boolean(getTrustedRendererMode(webContents.getURL(), APP_ORIGIN))
    ));
  const results = await Promise.all(candidates.map(requestRendererSettingsFlush));
  if (results.some(result => !result)) {
    console.warn('[settings] 部分窗口未在退出超时内确认设置落盘，已继续退出');
  }
}

ipcMain.on('settings:flush-ready', event => {
  if (!isTrustedAppSender(event)) return;
  const senderId = event.sender.id;
  if (settingsFlushReadySenderIds.has(senderId)) return;
  settingsFlushReadySenderIds.add(senderId);
  event.sender.once('destroyed', () => settingsFlushReadySenderIds.delete(senderId));
});

ipcMain.on('settings:flush-ack', (event, rawRequestId, succeeded) => {
  if (!isTrustedAppSender(event)) return;
  const requestId = String(rawRequestId || '');
  const pending = pendingSettingsFlushRequests.get(requestId);
  if (!pending || pending.senderId !== event.sender.id) return;
  settleSettingsFlushRequest(requestId, Boolean(succeeded));
});

ipcMain.handle('settings:get-storage-info', (event) => {
  assertTrustedAppSender(event);
  return getPersistentStorageInfo();
});

ipcMain.handle('settings:save-section', (event, section, value) => {
  assertTrustedAppSender(event);
  if (!RENDERER_SETTING_SECTIONS.has(section)) throw new Error('不允许写入该设置分区');
  // 剩余名额只能经下面的同步原子操作修改，普通设置补丁不得覆盖一次已完成的开奖扣减。
  const safeValue = section === 'app' && value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'remainingWinnerCount'))
    : value;
  const updated = getPersistentSettingsStore().updateSection(section, safeValue);
  const canonicalValue = updated.sections[section];
  broadcastPersistentSettingsSection(section, canonicalValue, safeValue);
  return { ...getPersistentStorageInfo(), section, value: canonicalValue };
});

function handleSynchronousWinnerCountMutation(event, mutation) {
  try {
    assertTrustedAppSender(event);
    const result = mutation(getPersistentSettingsStore());
    broadcastPersistentSettingsSection('app', result.settings, {
      remainingWinnerCount: result.remainingWinnerCount
    });
    event.returnValue = { ok: true, result };
  } catch (error) {
    event.returnValue = {
      ok: false,
      error: String(error?.message || error || '更新剩余中奖名额失败').slice(0, 500)
    };
  }
}

ipcMain.on('settings:set-remaining-winners', (event, value) => {
  handleSynchronousWinnerCountMutation(event, store => setStoredRemainingWinnerCount(store, value));
});

ipcMain.on('settings:consume-remaining-winners', (event, value) => {
  handleSynchronousWinnerCountMutation(event, store => consumeStoredRemainingWinnerCount(store, value));
});

ipcMain.on('settings:restore-remaining-winners', (event, value) => {
  handleSynchronousWinnerCountMutation(event, store => restoreStoredRemainingWinnerCount(store, value));
});

function handleSynchronousLotteryBatchMutation(event, mutation) {
  try {
    const isDanmuOwner = Boolean(
      danmuWindow && !danmuWindow.isDestroyed() && !danmuWindow.webContents.isDestroyed()
      && event.sender.id === danmuWindow.webContents.id
    );
    // owner 关闭、启动未就绪或明确处理失败后，设置页会在主窗口用同源 pending
    // 执行同一个幂等批次操作；账本 batchId 保证它不会重复扣减或返还。
    const isMainFallback = Boolean(
      mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()
      && event.sender.id === mainWindow.webContents.id
    );
    if (!isDanmuOwner && !isMainFallback) {
      throw new Error('只有弹幕状态窗口或主设置窗口可以修改抽奖批次账本');
    }
    const result = mutation(getPersistentSettingsStore());
    broadcastPersistentSettingsSection('app', result.settings, {
      remainingWinnerCount: result.remainingWinnerCount
    });
    event.returnValue = { ok: true, result };
  } catch (error) {
    event.returnValue = {
      ok: false,
      error: String(error?.message || error || '更新抽奖批次账本失败').slice(0, 500)
    };
  }
}

ipcMain.on('lottery:reserve-batch', (event, request) => {
  handleSynchronousLotteryBatchMutation(event, store => reserveStoredLotteryBatch(store, request));
});

ipcMain.on('lottery:finalize-batch', (event, request) => {
  handleSynchronousLotteryBatchMutation(event, store => finalizeStoredLotteryBatch(store, request));
});

ipcMain.handle('settings:open-folder', async (event) => {
  assertTrustedAppSender(event);
  fs.mkdirSync(resolvePersistentStorageRoot(), { recursive: true });
  return shell.openPath(resolvePersistentStorageRoot());
});

function getAICredentialPath() {
  // 普通设置放公共目录以便免安装新版本继承；API Key 属于当前 Windows 用户的
  // 加密凭据，不能让其它本机账户覆盖或删除。
  return path.join(app.getPath('userData'), 'ai-credentials.json');
}

function migrateLegacyAICredential() {
  const legacyPath = path.join(resolvePersistentStorageRoot(), 'ai-credentials.json');
  const credentialPath = getAICredentialPath();
  if (!fs.existsSync(legacyPath) || !safeStorage.isEncryptionAvailable()) return;
  try {
    const serialized = fs.readFileSync(legacyPath, 'utf8');
    const stored = JSON.parse(serialized);
    if (stored?.version !== 2 || typeof stored.encrypted !== 'string') return;
    // 只有当前用户能成功解密时才迁移，避免搬走其它账户不可用的凭据。
    safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'));

    let destinationIsValid = false;
    if (fs.existsSync(credentialPath)) {
      try {
        const current = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
        if (current?.version === 2 && typeof current.encrypted === 'string') {
          safeStorage.decryptString(Buffer.from(current.encrypted, 'base64'));
          destinationIsValid = true;
        }
      } catch {}
    }
    if (!destinationIsValid) {
      fs.mkdirSync(path.dirname(credentialPath), { recursive: true });
      const temporaryPath = `${credentialPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.migrating`;
      fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' });
      if (fs.existsSync(credentialPath)) {
        fs.renameSync(credentialPath, `${credentialPath}.invalid-${Date.now()}`);
      }
      fs.renameSync(temporaryPath, credentialPath);
    }
    // 当前用户目录已有可读副本后，清掉公共目录里的敏感副本。
    fs.unlinkSync(legacyPath);
  } catch (error) {
    console.warn('[ai] 旧版 API Key 迁移失败，将保留原文件:', error.message);
  }
}

function readAICredential() {
  const credentialPath = getAICredentialPath();
  if (!fs.existsSync(credentialPath)) return { apiKey: '', endpointOrigin: '' };
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统暂不支持安全读取 API Key');
  }

  const stored = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  if (stored?.version !== 2 || typeof stored?.encrypted !== 'string') {
    throw new Error('API Key 存储格式无效，请在设置中重新保存');
  }
  const decrypted = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'));
  const credential = JSON.parse(decrypted);
  if (typeof credential?.apiKey !== 'string' || typeof credential?.endpointOrigin !== 'string') {
    throw new Error('API Key 存储内容无效，请在设置中重新保存');
  }
  return credential;
}

function getAICredentialState(rawEndpoint) {
  const stored = fs.existsSync(getAICredentialPath());
  const encryptionAvailable = safeStorage.isEncryptionAvailable();
  let endpointMatches = !stored;

  if (stored && encryptionAvailable && rawEndpoint) {
    try {
      const endpoint = normalizeAICurationEndpoint(rawEndpoint);
      const credential = readAICredential();
      endpointMatches = !credential.endpointOrigin || credential.endpointOrigin === endpoint.origin;
    } catch {
      endpointMatches = false;
    }
  }

  return { stored, encryptionAvailable, endpointMatches };
}

function writeAIApiKey(rawApiKey, rawEndpoint) {
  const apiKey = String(rawApiKey || '').trim().slice(0, 4096);
  const credentialPath = getAICredentialPath();

  if (!apiKey) {
    if (fs.existsSync(credentialPath)) fs.unlinkSync(credentialPath);
    return getAICredentialState(rawEndpoint);
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('当前系统不支持安全存储 API Key');
  }

  const endpoint = normalizeAICurationEndpoint(rawEndpoint);
  if (!isAllowedAICurationEndpoint(endpoint)) {
    throw new Error('AI 接口必须使用 HTTPS，本机接口可使用 HTTP');
  }
  const encrypted = safeStorage.encryptString(JSON.stringify({
    apiKey,
    endpointOrigin: endpoint.origin
  })).toString('base64');
  fs.mkdirSync(path.dirname(credentialPath), { recursive: true });
  fs.writeFileSync(credentialPath, JSON.stringify({ version: 2, encrypted }), 'utf8');
  return getAICredentialState(rawEndpoint);
}

ipcMain.handle('ai:get-credential-state', (event, endpoint) => {
  assertTrustedAppSender(event);
  return getAICredentialState(endpoint);
});

ipcMain.handle('ai:set-api-key', (event, apiKey, endpoint) => {
  assertTrustedAppSender(event);
  return writeAIApiKey(apiKey, endpoint);
});

ipcMain.handle('ai:curate-danmu', async (event, rawConfig, rawMessages) => {
  assertTrustedAppSender(event);
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const messages = Array.isArray(rawMessages) ? rawMessages.slice(0, 60) : [];
  if (!messages.length) return [];

  const endpoint = normalizeAICurationEndpoint(config.endpoint);
  if (!isAllowedAICurationEndpoint(endpoint)) {
    throw new Error('AI 接口必须使用 HTTPS，本机接口可使用 HTTP');
  }
  const model = String(config.model || '').trim().slice(0, 120);
  if (!model) throw new Error('请填写 AI 模型名称');

  // 明显的敏感、辱骂、广告和无价值刷屏先在本机排除，不把这些内容交给模型碰运气。
  const candidates = filterCurationCandidates(messages);
  if (!candidates.length) return [];

  const isDeepSeek = endpoint.hostname === 'api.deepseek.com' && /^deepseek-/i.test(model);
  const requestBody = {
    model,
    temperature: 0.1,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    ...(isDeepSeek ? { thinking: { type: 'disabled' } } : {}),
    messages: [
      {
        role: 'system',
        content: [
          '你是直播弹幕的安全精选编辑，执行白名单选择，不要从候选中强行凑数。',
          '只有主播能够现场具体回答，并且能给多数观众带来实际信息价值的明确问题或建设性建议才可入选。',
          '必须排除单纯夸赞、感叹、问候、玩笑、普通陈述、无明确问题的短句、刷屏、广告引流、',
          '政治及敏感公共事件、辱骂攻击、嘲讽挑衅、黑粉喷子、带节奏、歧视、色情和违法内容。',
          '宁缺毋滥；没有明确合格内容时返回空数组。最多选择3条，绝不能超过3条。',
          '不要改写弹幕，不要生成新内容。只返回 JSON：{"selectedIds":["候选id"]}。'
        ].join('')
      },
      {
        role: 'user',
        content: JSON.stringify(candidates)
      }
    ]
  };

  const credential = readAICredential();
  if (credential.apiKey && credential.endpointOrigin && credential.endpointOrigin !== endpoint.origin) {
    throw new Error('当前 API Key 与此接口地址不匹配，请在设置中重新保存');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await net.fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(credential.apiKey ? { authorization: `Bearer ${credential.apiKey}` } : {})
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const responseText = await readResponseText(response, 100000, 'AI 接口返回内容');
    if (!response.ok) {
      throw new Error(`AI 接口返回 ${response.status}：${responseText.slice(0, 180)}`);
    }
    const payload = JSON.parse(responseText);
    return parseCurationSelectedIds(
      payload?.choices?.[0]?.message?.content,
      candidates.map(item => item.id),
      3
    );
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI 接口请求超时，请稍后重试');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
});

function applyDisplayWindowLayer() {
  if (!displayWindow || displayWindow.isDestroyed()) return;
  const enabled = lotteryOverlayActive || displayPinnedPreference;
  displayWindow.setAlwaysOnTop(
    enabled,
    enabled ? SIDEBAR_WINDOW_LEVEL : 'normal',
    enabled ? SIDEBAR_WINDOW_RELATIVE_LEVEL : 0
  );
  displayWindow.setVisibleOnAllWorkspaces(enabled, { visibleOnFullScreen: enabled });
  if (lotteryOverlayActive && displayWindow.isVisible()) displayWindow.moveTop();
  raiseHighlightWindow();
}

function getLegacyWindowDisplayConfigPath() {
  return path.join(app.getPath('userData'), 'window-displays.json');
}

function normalizeDisplayPreference(value) {
  const preference = String(value || 'auto');
  if (preference === 'auto') return 'auto';
  return screen.getAllDisplays().some(display => String(display.id) === preference)
    ? preference
    : 'auto';
}

function normalizeLiveOverlayBounds(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Math.round(Number(value.x));
  const y = Math.round(Number(value.y));
  const width = Math.round(Number(value.width));
  const height = Math.round(Number(value.height));
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width < 640 || height < 120) return null;
  return { x, y, width, height };
}

function loadWindowDisplayConfig() {
  try {
    let saved = getPersistentSettingsStore().read().sections.windows;
    if (!saved && fs.existsSync(getLegacyWindowDisplayConfigPath())) {
      saved = JSON.parse(fs.readFileSync(getLegacyWindowDisplayConfigPath(), 'utf8'));
      getPersistentSettingsStore().updateSection('windows', saved);
    }
    const sidebarSize = normalizeWindowSize(saved?.sidebarSize, 380, 620);
    const highlightSize = normalizeWindowSize(saved?.highlightSize, 680, 520);
    const liveOverlayBounds = normalizeLiveOverlayBounds(saved?.liveOverlayBounds);
    const needsDefaultMigration = !saved || !Object.prototype.hasOwnProperty.call(saved, 'sidebarAlwaysOnTop');
    windowDisplayConfig = {
      danmuDisplayId: normalizeDisplayPreference(saved?.danmuDisplayId),
      sidebarDisplayId: normalizeDisplayPreference(saved?.sidebarDisplayId),
      sidebarAlwaysOnTop: saved?.sidebarAlwaysOnTop !== false,
      ...(sidebarSize ? { sidebarSize } : {}),
      ...(highlightSize ? { highlightSize } : {}),
      ...(liveOverlayBounds ? { liveOverlayBounds } : {})
    };
    displayPinnedPreference = windowDisplayConfig.sidebarAlwaysOnTop;
    if (needsDefaultMigration) saveWindowDisplayConfig();
  } catch {
    windowDisplayConfig = { danmuDisplayId: 'auto', sidebarDisplayId: 'auto', sidebarAlwaysOnTop: true, liveOverlayBounds: null };
    displayPinnedPreference = true;
  }
}

function saveWindowDisplayConfig() {
  try {
    getPersistentSettingsStore().updateSection('windows', windowDisplayConfig);
  } catch (error) {
    console.warn('保存窗口屏幕设置失败:', error);
  }
}

function getDisplayById(displayId) {
  if (!displayId || displayId === 'auto') return null;
  return screen.getAllDisplays().find(display => String(display.id) === String(displayId)) || null;
}

function getMainWindowDisplay() {
  return mainWindow && !mainWindow.isDestroyed()
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
}

function getDanmuTargetDisplay() {
  return getDisplayById(windowDisplayConfig.danmuDisplayId) || getMainWindowDisplay();
}

function getSidebarTargetDisplay() {
  const selected = getDisplayById(windowDisplayConfig.sidebarDisplayId);
  if (selected) return selected;
  if (danmuWindow && !danmuWindow.isDestroyed()) return getDanmuTargetDisplay();
  return getMainWindowDisplay();
}

function getHighlightTargetDisplay() {
  if (displayWindow && !displayWindow.isDestroyed()) {
    return screen.getDisplayMatching(displayWindow.getBounds());
  }
  return getSidebarTargetDisplay();
}

function getWindowDisplayState() {
  const primaryId = String(screen.getPrimaryDisplay().id);
  return {
    config: { ...windowDisplayConfig },
    displays: screen.getAllDisplays().map((display, index) => ({
      id: String(display.id),
      label: display.label || `显示器 ${index + 1}`,
      primary: String(display.id) === primaryId,
      bounds: { ...display.bounds },
      workArea: { ...display.workArea },
      scaleFactor: display.scaleFactor
    }))
  };
}

function getSidebarBounds(display, currentBounds) {
  const workArea = display.workArea;
  const margin = Math.max(0, Math.min(12, Math.floor(Math.min(workArea.width, workArea.height) / 20)));
  const availableWidth = Math.max(1, workArea.width - margin * 2);
  const availableHeight = Math.max(1, workArea.height - margin * 2);
  const preferredBounds = currentBounds || windowDisplayConfig.sidebarSize;
  const width = Math.min(availableWidth, Math.max(Math.min(380, availableWidth), preferredBounds?.width || 470));
  const height = Math.min(availableHeight, Math.max(Math.min(620, availableHeight), preferredBounds?.height || 920));
  return {
    x: workArea.x + workArea.width - width - margin,
    y: workArea.y + margin,
    width,
    height
  };
}

function moveSidebarWindowToConfiguredDisplay() {
  if (!displayWindow || displayWindow.isDestroyed()) return;
  const bounds = getSidebarBounds(getSidebarTargetDisplay(), displayWindow.getBounds());
  displayWindow.setMinimumSize(Math.min(380, bounds.width), Math.min(620, bounds.height));
  displayWindow.setBounds(bounds);
}

function applyHighlightWindowBounds(targetWindow, bounds) {
  if (!targetWindow || targetWindow.isDestroyed() || !bounds) return false;
  targetWindow.setMinimumSize(
    Math.min(HIGHLIGHT_WINDOW_MIN_WIDTH, bounds.width),
    Math.min(HIGHLIGHT_WINDOW_MIN_HEIGHT, bounds.height)
  );
  if (!areWindowBoundsEqual(targetWindow.getBounds(), bounds)) {
    targetWindow.setBounds(bounds);
  }
  return true;
}

function moveHighlightWindowToConfiguredDisplay() {
  if (!highlightWindow || highlightWindow.isDestroyed()) return;
  const workArea = getHighlightTargetDisplay().workArea;
  const bounds = fitWindowBoundsToWorkArea({
    bounds: highlightWindow.getBounds(),
    workArea,
    margin: HIGHLIGHT_WINDOW_MARGIN,
    minimumWidth: HIGHLIGHT_WINDOW_MIN_WIDTH,
    minimumHeight: HIGHLIGHT_WINDOW_MIN_HEIGHT,
    center: true
  });
  highlightRestoreBounds = null;
  applyHighlightWindowBounds(highlightWindow, bounds);
}

function notifyWindowDisplayStateChanged() {
  const state = getWindowDisplayState();
  for (const targetWindow of BrowserWindow.getAllWindows()) {
    if (!targetWindow.isDestroyed()) targetWindow.webContents.send('windows:displays-changed', state);
  }
}

function repositionAuxiliaryWindows() {
  moveSidebarWindowToConfiguredDisplay();
  moveDanmuWindowToConfiguredDisplay();
  moveHighlightWindowToConfiguredDisplay();
  moveLiveOverlayWindowIntoVisibleWorkArea();
}

function handleDisplayTopologyChange() {
  // Pointer coordinates and BrowserWindow bounds may use a different scale
  // after a display/DPI change. Drop in-flight resize snapshots before moving
  // windows so a stale pointer-up cannot put them back outside the work area.
  auxiliaryResizeSessions.clear();
  const normalized = {
    danmuDisplayId: normalizeDisplayPreference(windowDisplayConfig.danmuDisplayId),
    sidebarDisplayId: normalizeDisplayPreference(windowDisplayConfig.sidebarDisplayId),
    sidebarAlwaysOnTop: windowDisplayConfig.sidebarAlwaysOnTop !== false,
    ...(windowDisplayConfig.sidebarSize ? { sidebarSize: windowDisplayConfig.sidebarSize } : {}),
    ...(windowDisplayConfig.highlightSize ? { highlightSize: windowDisplayConfig.highlightSize } : {}),
    ...(windowDisplayConfig.liveOverlayBounds ? { liveOverlayBounds: windowDisplayConfig.liveOverlayBounds } : {})
  };
  const changed = normalized.danmuDisplayId !== windowDisplayConfig.danmuDisplayId ||
    normalized.sidebarDisplayId !== windowDisplayConfig.sidebarDisplayId;
  windowDisplayConfig = normalized;
  if (changed) saveWindowDisplayConfig();
  repositionAuxiliaryWindows();
  notifyWindowDisplayStateChanged();
}

function moveDanmuWindowToConfiguredDisplay() {
  if (!danmuWindow || danmuWindow.isDestroyed()) return;
  // The lottery is rendered inside the danmu window. Keep that window on the
  // selected display's complete work area in every phase so starting a draw
  // never makes the overlay jump, shrink, or look like a separate window.
  danmuWindow.setBounds({ ...getDanmuTargetDisplay().workArea });
}

ipcMain.handle('windows:get-display-state', (event) => {
  assertTrustedAppSender(event);
  return getWindowDisplayState();
});

ipcMain.handle('windows:set-display-config', (event, patch) => {
  assertTrustedAppSender(event);
  if (patch && typeof patch === 'object') {
    if (Object.prototype.hasOwnProperty.call(patch, 'danmuDisplayId')) {
      windowDisplayConfig.danmuDisplayId = normalizeDisplayPreference(patch.danmuDisplayId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'sidebarDisplayId')) {
      windowDisplayConfig.sidebarDisplayId = normalizeDisplayPreference(patch.sidebarDisplayId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'sidebarAlwaysOnTop')) {
      windowDisplayConfig.sidebarAlwaysOnTop = Boolean(patch.sidebarAlwaysOnTop);
      displayPinnedPreference = windowDisplayConfig.sidebarAlwaysOnTop;
      applyDisplayWindowLayer();
    }
    saveWindowDisplayConfig();
    repositionAuxiliaryWindows();
    notifyWindowDisplayStateChanged();
  }
  return getWindowDisplayState();
});

ipcMain.handle('display:get-always-on-top', (event) => {
  if (!displayWindow || event.sender.id !== displayWindow.webContents.id) return false;
  return displayPinnedPreference;
});

ipcMain.handle('display:set-always-on-top', (event, value) => {
  if (!displayWindow || event.sender.id !== displayWindow.webContents.id) return false;
  displayPinnedPreference = Boolean(value);
  windowDisplayConfig.sidebarAlwaysOnTop = displayPinnedPreference;
  saveWindowDisplayConfig();
  applyDisplayWindowLayer();
  notifyWindowDisplayStateChanged();
  return displayPinnedPreference;
});

ipcMain.on('display:close', (event) => {
  if (displayWindow && event.sender.id === displayWindow.webContents.id) {
    displayWindow.close();
  }
});

function getResizableAuxiliaryWindow(event) {
  if (displayWindow && !displayWindow.isDestroyed() && event.sender.id === displayWindow.webContents.id) {
    return { window: displayWindow, kind: 'sidebar', edge: 'bottom-left' };
  }
  if (highlightWindow && !highlightWindow.isDestroyed() && event.sender.id === highlightWindow.webContents.id) {
    return { window: highlightWindow, kind: 'highlight', edge: 'bottom-right' };
  }
  if (liveOverlayWindow && !liveOverlayWindow.isDestroyed() && event.sender.id === liveOverlayWindow.webContents.id) {
    return {
      window: liveOverlayWindow,
      kind: 'live-overlay',
      edge: 'bottom-right',
      aspectRatio: LIVE_OVERLAY_ASPECT_RATIO
    };
  }
  return null;
}

function saveAuxiliaryWindowSize(kind, bounds) {
  if (kind === 'live-overlay') {
    saveLiveOverlayBounds();
    return;
  }
  const key = kind === 'sidebar' ? 'sidebarSize' : 'highlightSize';
  windowDisplayConfig[key] = { width: bounds.width, height: bounds.height };
  saveWindowDisplayConfig();
}

ipcMain.on('window:resize-current', (event, payload) => {
  const target = getResizableAuxiliaryWindow(event);
  if (!target || !payload || typeof payload !== 'object') return;
  const phase = String(payload.phase || '');
  const screenX = Number(payload.screenX);
  const screenY = Number(payload.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return;

  const senderId = event.sender.id;
  if (phase === 'start') {
    if (target.kind === 'highlight') highlightRestoreBounds = null;
    auxiliaryResizeSessions.set(senderId, {
      bounds: target.window.getBounds(),
      screenX,
      screenY,
      ...target
    });
    return;
  }

  const session = auxiliaryResizeSessions.get(senderId);
  if (!session || session.window !== target.window || (phase !== 'move' && phase !== 'end')) return;
  const [minimumWidth, minimumHeight] = target.window.getMinimumSize();
  const workArea = screen.getDisplayMatching(session.bounds).workArea;
  const deltaX = screenX - session.screenX;
  const deltaY = screenY - session.screenY;
  const bounds = calculateResizeBounds({
    bounds: session.bounds,
    workArea,
    minimumWidth,
    minimumHeight,
    edge: session.edge,
    deltaX,
    deltaY,
    aspectRatio: session.aspectRatio
  });
  target.window.setBounds(bounds);

  if (phase === 'end') {
    auxiliaryResizeSessions.delete(senderId);
    // Persist what Electron actually applied. On Windows and mixed-DPI setups
    // native constraints can differ slightly from the requested geometry.
    saveAuxiliaryWindowSize(session.kind, target.window.getBounds());
  }
});

ipcMain.on('lottery:set-overlay-active', (event, value) => {
  if (!danmuWindow || danmuWindow.isDestroyed() || event.sender.id !== danmuWindow.webContents.id) return;
  lotteryOverlayActive = Boolean(value);
  applyDisplayWindowLayer();
});

function hideHighlightWindow() {
  if (highlightWindow && !highlightWindow.isDestroyed()) {
    highlightWindow.hide();
  }
  highlightRestoreBounds = null;
  pendingHighlightPayload = null;
}

function closeHighlightWindow() {
  const targetWindow = highlightWindow;
  highlightWindow = null;
  highlightWindowReady = false;
  pendingHighlightPayload = null;
  lastHighlightPayload = null;
  highlightRestoreBounds = null;
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.close();
  }
}

function getHighlightPayload(rawItem) {
  const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
  return {
    id: String(item.id || ''),
    avatar: /^https?:\/\//i.test(String(item.avatar || '')) ? String(item.avatar) : '',
    nickname: String(item.nickname || '匿名观众').slice(0, 80),
    content: String(item.content || '').slice(0, 500),
    emojiUrl: /^https?:\/\//i.test(String(item.emojiUrl || '')) ? String(item.emojiUrl) : '',
    timestamp: Number(item.timestamp) || Date.now(),
    badgeLevel: Math.min(99, Math.max(0, Math.round(Number(item.badgeLevel) || 0)))
  };
}

function getDefaultHighlightBounds(rawItem) {
  const payload = getHighlightPayload(rawItem);
  const workArea = getHighlightTargetDisplay().workArea;
  return calculateHighlightWindowBounds({
    workArea,
    preferredSize: windowDisplayConfig.highlightSize,
    content: payload.content,
    margin: HIGHLIGHT_WINDOW_MARGIN,
    minimumWidth: HIGHLIGHT_WINDOW_MIN_WIDTH,
    minimumHeight: HIGHLIGHT_WINDOW_MIN_HEIGHT
  });
}

function raiseHighlightWindow(targetWindow = highlightWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.setAlwaysOnTop(true, HIGHLIGHT_WINDOW_LEVEL, HIGHLIGHT_WINDOW_RELATIVE_LEVEL);
  targetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (targetWindow.isVisible()) targetWindow.moveTop();
}

function presentHighlightPayload(targetWindow, payload) {
  if (!targetWindow || targetWindow.isDestroyed() || highlightWindow !== targetWindow) return;
  lastHighlightPayload = payload;
  if (!highlightWindowReady) {
    pendingHighlightPayload = payload;
    return;
  }
  pendingHighlightPayload = null;
  targetWindow.webContents.send('highlight:show', payload);
  targetWindow.show();
  raiseHighlightWindow(targetWindow);
  targetWindow.focus();
}

function prepareHighlightWindow() {
  if (highlightWindow && !highlightWindow.isDestroyed()) return highlightWindow;
  const bounds = getDefaultHighlightBounds({ content: '' });
  const targetWindow = new BrowserWindow({
      ...bounds,
      ...TRANSPARENT_AUXILIARY_WINDOW_CHROME,
      minWidth: Math.min(HIGHLIGHT_WINDOW_MIN_WIDTH, bounds.width),
      minHeight: Math.min(HIGHLIGHT_WINDOW_MIN_HEIGHT, bounds.height),
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      show: false,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'preload.cjs')
      }
  });
  highlightWindow = targetWindow;
  guardAuxiliaryWindowNavigation(targetWindow, 'highlight');
  attachRendererRecovery(targetWindow, '精选弹幕窗口', {
    beforeReload: () => {
      highlightWindowReady = false;
      if (targetWindow.isVisible() && lastHighlightPayload) pendingHighlightPayload = lastHighlightPayload;
    },
    afterReload: () => {
      if (highlightWindow !== targetWindow || targetWindow.isDestroyed()) return;
      highlightWindowReady = true;
      if (pendingHighlightPayload) presentHighlightPayload(targetWindow, pendingHighlightPayload);
    }
  });
  highlightWindowReady = false;
  raiseHighlightWindow(targetWindow);
  targetWindow.loadURL(`${APP_ORIGIN}/?highlight`);
  targetWindow.webContents.once('did-finish-load', () => {
    if (highlightWindow !== targetWindow || targetWindow.isDestroyed()) return;
    highlightWindowReady = true;
    if (pendingHighlightPayload) {
      presentHighlightPayload(targetWindow, pendingHighlightPayload);
    }
  });
  targetWindow.on('closed', () => {
    if (highlightWindow === targetWindow) {
      highlightWindow = null;
      highlightWindowReady = false;
      pendingHighlightPayload = null;
      lastHighlightPayload = null;
      highlightRestoreBounds = null;
    }
  });
  return targetWindow;
}

function showHighlightWindow(rawItem) {
  const payload = getHighlightPayload(rawItem);
  if (!payload.content) return false;
  const bounds = getDefaultHighlightBounds(payload);
  const targetWindow = prepareHighlightWindow();
  highlightRestoreBounds = null;
  applyHighlightWindowBounds(targetWindow, bounds);
  presentHighlightPayload(targetWindow, payload);

  return true;
}

ipcMain.handle('highlight:show', (event, item) => {
  assertTrustedAppSender(event);
  return showHighlightWindow(item);
});
ipcMain.on('highlight:close', (event) => {
  if (highlightWindow && event.sender.id === highlightWindow.webContents.id) {
    hideHighlightWindow();
  }
});
ipcMain.handle('highlight:toggle-maximize', (event) => {
  if (!highlightWindow || highlightWindow.isDestroyed()) return false;
  if (event.sender.id !== highlightWindow.webContents.id) return false;

  if (highlightRestoreBounds) {
    const restoreBounds = highlightRestoreBounds;
    const workArea = screen.getDisplayMatching(restoreBounds).workArea;
    const fittedRestoreBounds = fitWindowBoundsToWorkArea({
      bounds: restoreBounds,
      workArea,
      margin: HIGHLIGHT_WINDOW_MARGIN,
      minimumWidth: HIGHLIGHT_WINDOW_MIN_WIDTH,
      minimumHeight: HIGHLIGHT_WINDOW_MIN_HEIGHT
    });
    highlightRestoreBounds = null;
    applyHighlightWindowBounds(highlightWindow, fittedRestoreBounds);
    return false;
  }

  const currentBounds = highlightWindow.getBounds();
  const workArea = screen.getDisplayMatching(currentBounds).workArea;
  highlightRestoreBounds = fitWindowBoundsToWorkArea({
    bounds: currentBounds,
    workArea,
    margin: HIGHLIGHT_WINDOW_MARGIN,
    minimumWidth: HIGHLIGHT_WINDOW_MIN_WIDTH,
    minimumHeight: HIGHLIGHT_WINDOW_MIN_HEIGHT
  });
  applyHighlightWindowBounds(highlightWindow, { ...workArea });
  return true;
});

// 获取统一的前端构建目录
function getRendererPath() {
  return path.join(app.getAppPath(), 'build', 'renderer');
}

// 启动代理服务器。直接等待实际监听结果，不能用“同端口返回 200”来猜测启动成功；
// 否则端口被别的软件占用时会误把对方页面当成 DyCast。
async function startServer() {
  const serverCjsPath = path.join(app.getAppPath(), 'server.cjs');
  process.env.DYCAST_RENDERER = getRendererPath();
  process.env.DYCAST_PORT = String(PORT);
  process.env.DYCAST_AUDIO_DIR = getAudioRoot();
  serverInstance = require(serverCjsPath);
  serverInstance.setElectronNet?.(net);
  if (!serverInstance.startup || typeof serverInstance.startup.then !== 'function') {
    throw new Error('本地服务未返回可验证的启动状态');
  }
  await serverInstance.startup;
}

function shutdownLocalServer() {
  if (!serverInstance) return;
  const currentServer = serverInstance;
  serverInstance = null;
  try {
    if (typeof currentServer.shutdown === 'function') currentServer.shutdown();
    else currentServer.close?.();
  } catch (error) {
    console.warn('[main] 关闭本地服务失败:', error);
  }
}

function focusExistingWindow(window) {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return true;
}

async function readDycastStorage(origin) {
  const migrationWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  try {
    await migrationWindow.loadURL(new URL('/storage.html', origin).toString());
    return await migrationWindow.webContents.executeJavaScript(`
      Object.fromEntries(
        Object.keys(localStorage)
          .filter(key => key.startsWith('dycast_'))
          .map(key => [key, localStorage.getItem(key)])
      )
    `, true);
  } finally {
    if (!migrationWindow.isDestroyed()) migrationWindow.destroy();
  }
}

async function migrateLegacyLocalStorage() {
  const markerKey = 'dycast_localhost_migration_v1';
  const destinationWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  try {
    await destinationWindow.loadURL(`${APP_ORIGIN}/storage.html`);
    const migrated = await destinationWindow.webContents.executeJavaScript(
      `localStorage.getItem(${JSON.stringify(markerKey)}) === 'done'`,
      true
    );
    if (migrated) return;

    let legacyValues = {};
    try {
      legacyValues = await readDycastStorage(LEGACY_APP_ORIGIN);
    } catch (error) {
      console.warn('[main] 读取旧版 localhost 数据失败:', error);
    }
    await destinationWindow.webContents.executeJavaScript(`
      (() => {
        const values = ${JSON.stringify(legacyValues)};
        for (const [key, value] of Object.entries(values)) {
          if (value !== null && localStorage.getItem(key) === null) localStorage.setItem(key, value);
        }
        localStorage.setItem(${JSON.stringify(markerKey)}, 'done');
      })()
    `, true);
  } finally {
    if (!destinationWindow.isDestroyed()) destinationWindow.destroy();
  }
}

function parseStoredJson(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getLegacySettingsSections(values) {
  const sections = {};
  const appSettings = parseStoredJson(values.dycast_settings);
  const danmuSettings = parseStoredJson(values.dycast_danmu_settings);
  const audioConfigs = parseStoredJson(values.dycast_audio_settings);
  if (appSettings) sections.app = appSettings;
  if (danmuSettings) sections.danmu = danmuSettings;
  if (audioConfigs || values.dycast_audio_master_volume !== undefined || values.dycast_audio_volume_normalization !== undefined) {
    const savedVolume = Number(values.dycast_audio_master_volume);
    sections.audio = {
      configs: audioConfigs || {},
      masterVolume: Number.isFinite(savedVolume) ? Math.min(100, Math.max(0, Math.round(savedVolume))) : 70,
      volumeNormalization: values.dycast_audio_volume_normalization !== 'false'
    };
  }
  return sections;
}

async function synchronizePublicSettingsToLocalStorage() {
  const legacyValues = await readDycastStorage(APP_ORIGIN);
  const store = getPersistentSettingsStore();
  const snapshot = store.seedMissingSections(getLegacySettingsSections(legacyValues));
  const values = {};
  if (snapshot.sections.app) values.dycast_settings = JSON.stringify(snapshot.sections.app);
  if (snapshot.sections.danmu) values.dycast_danmu_settings = JSON.stringify(snapshot.sections.danmu);
  if (snapshot.sections.audio) {
    values.dycast_audio_settings = JSON.stringify(snapshot.sections.audio.configs || {});
    values.dycast_audio_master_volume = String(snapshot.sections.audio.masterVolume ?? 70);
    values.dycast_audio_volume_normalization = String(snapshot.sections.audio.volumeNormalization !== false);
  }

  const storageWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  try {
    await storageWindow.loadURL(`${APP_ORIGIN}/storage.html`);
    await storageWindow.webContents.executeJavaScript(`
      (() => {
        const values = ${JSON.stringify(values)};
        for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
        localStorage.setItem('dycast_public_settings_v1', 'done');
      })()
    `, true);
  } finally {
    if (!storageWindow.isDestroyed()) storageWindow.destroy();
  }
}

const DANMU_BUFFER_MAX = 500;
// 固定容量环形缓存，避免弹幕高峰时每条消息都 splice 整个数组。
const danmuBuffer = new Array(DANMU_BUFFER_MAX);
let danmuBufferStart = 0;
let danmuBufferCount = 0;
let currentDanmuSessionId = '';
const DANMU_STATE_RESET_TIMEOUT_MS = 5000;
const DANMU_STATE_RESET_FALLBACK_TIMEOUT_MS = 3000;
const pendingDanmuStateResetRequests = new Map();
const danmuStateResetDrainWaiters = new Set();
let nextDanmuStateResetRequestId = 1;
let danmuOwnerReadySenderId = null;

function notifyDanmuStateResetDrainWaiters() {
  if (pendingDanmuStateResetRequests.size > 0) return;
  for (const resolve of danmuStateResetDrainWaiters) resolve();
  danmuStateResetDrainWaiters.clear();
}

function waitForPendingDanmuStateResetRequests() {
  if (pendingDanmuStateResetRequests.size === 0) return Promise.resolve();
  return new Promise(resolve => danmuStateResetDrainWaiters.add(resolve));
}

function completeDanmuStateResetFallback(requestId, succeeded) {
  const pending = pendingDanmuStateResetRequests.get(requestId);
  if (!pending || pending.phase !== 'fallback') return;
  pendingDanmuStateResetRequests.delete(requestId);
  clearTimeout(pending.timeout);
  if (!succeeded) console.warn('[danmu] 主窗口未能完成退出前的弹幕状态回退清理');
  notifyDanmuStateResetDrainWaiters();
}

function settleDanmuStateResetRequest(requestId, succeeded) {
  const pending = pendingDanmuStateResetRequests.get(requestId);
  if (!pending || pending.phase !== 'owner') return;
  clearTimeout(pending.timeout);
  if (succeeded) {
    pendingDanmuStateResetRequests.delete(requestId);
    pending.resolve({ routed: true, requestId: '' });
    notifyDanmuStateResetDrainWaiters();
    return;
  }

  // owner 未确认时让发起请求的主窗口用同一份 pending 做幂等回退，并等待它明确
  // 回 ACK；退出流程会先 drain 此 Map，避免 invoke 刚返回 false 就销毁 renderer。
  pending.phase = 'fallback';
  pending.timeout = setTimeout(
    () => completeDanmuStateResetFallback(requestId, false),
    DANMU_STATE_RESET_FALLBACK_TIMEOUT_MS
  );
  pending.resolve({ routed: false, requestId });
}

function deliverDanmuStateResetRequest(requestId, pending) {
  if (
    !pending || pending.phase !== 'owner'
    || !danmuWindow || danmuWindow.isDestroyed() || danmuWindow.webContents.isDestroyed()
    || danmuOwnerReadySenderId !== danmuWindow.webContents.id
    || pending.senderId !== danmuWindow.webContents.id
  ) return false;
  try {
    danmuWindow.webContents.send('danmu:state-reset', requestId);
    pending.delivered = true;
    return true;
  } catch {
    return false;
  }
}

function deliverPendingDanmuStateResetRequests() {
  for (const [requestId, pending] of pendingDanmuStateResetRequests) {
    deliverDanmuStateResetRequest(requestId, pending);
  }
}

function settleDanmuStateResetRequestsForSender(senderId) {
  for (const [requestId, pending] of pendingDanmuStateResetRequests) {
    if (pending.phase === 'owner' && pending.senderId === senderId) {
      // webContents.send 成功不等于 renderer 已执行；批次结算和本地清零都已幂等，
      // 关窗时回退到主窗口更安全，迟到的 owner 回调也不会重复返还。
      settleDanmuStateResetRequest(requestId, false);
    }
  }
}

function clearDanmuBuffer() {
  danmuBufferStart = 0;
  danmuBufferCount = 0;
}

function appendDanmuBuffer(danmu) {
  if (danmuBufferCount < DANMU_BUFFER_MAX) {
    danmuBuffer[(danmuBufferStart + danmuBufferCount) % DANMU_BUFFER_MAX] = danmu;
    danmuBufferCount += 1;
    return;
  }
  danmuBuffer[danmuBufferStart] = danmu;
  danmuBufferStart = (danmuBufferStart + 1) % DANMU_BUFFER_MAX;
}

ipcMain.on('danmu:reset-session', (event, sessionId) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) return;
  const normalizedSessionId = String(sessionId || '').trim().slice(0, 256);
  if (!normalizedSessionId) return;
  currentDanmuSessionId = normalizedSessionId;
  clearDanmuBuffer();
  if (danmuWindow && !danmuWindow.isDestroyed()) {
    danmuWindow.webContents.send('danmu:session-reset', normalizedSessionId);
  }
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.webContents.send('danmu:session-reset', normalizedSessionId);
  }
});

// 设置页只发出请求；真正的充能、候选池和抽奖批次始终由唯一的弹幕窗口清理。
// 请求会等到弹幕 renderer 注册完监听并回 ACK；崩溃恢复期间不会把一次性指令发丢。
ipcMain.handle('danmu:reset-state', event => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('只有主窗口可以重置弹幕状态');
  }
  // before-quit 已经开始 drain 后不再创建新事务，保证退出屏障观察的是稳定集合。
  if (isQuitting) return { routed: true, requestId: '' };
  const requestId = `${process.pid}-${Date.now()}-${nextDanmuStateResetRequestId++}`;
  if (!danmuWindow || danmuWindow.isDestroyed() || danmuWindow.webContents.isDestroyed()) {
    const pending = {
      phase: 'fallback',
      senderId: null,
      requesterSenderId: event.sender.id,
      delivered: false,
      resolve: null,
      timeout: null
    };
    pending.timeout = setTimeout(
      () => completeDanmuStateResetFallback(requestId, false),
      DANMU_STATE_RESET_FALLBACK_TIMEOUT_MS
    );
    pendingDanmuStateResetRequests.set(requestId, pending);
    return { routed: false, requestId };
  }
  return new Promise(resolve => {
    const senderId = danmuWindow.webContents.id;
    const timeout = setTimeout(() => {
      // 仅 ACK 能证明 renderer 已执行。卡死窗口可能接受 send 却永远不运行回调；
      // 超时统一交给主窗口以同一 batchId 幂等补做。
      settleDanmuStateResetRequest(requestId, false);
    }, DANMU_STATE_RESET_TIMEOUT_MS);
    const pending = {
      phase: 'owner',
      senderId,
      requesterSenderId: event.sender.id,
      delivered: false,
      timeout,
      resolve
    };
    pendingDanmuStateResetRequests.set(requestId, pending);
    deliverDanmuStateResetRequest(requestId, pending);
  });
});

ipcMain.on('danmu:state-reset-ack', (event, rawRequestId, succeeded) => {
  const requestId = String(rawRequestId || '');
  const pending = pendingDanmuStateResetRequests.get(requestId);
  if (!pending || pending.phase !== 'owner' || pending.senderId !== event.sender.id) return;
  settleDanmuStateResetRequest(requestId, Boolean(succeeded));
});

ipcMain.on('danmu:state-reset-fallback-ack', (event, rawRequestId, succeeded) => {
  const requestId = String(rawRequestId || '');
  const pending = pendingDanmuStateResetRequests.get(requestId);
  if (
    !pending || pending.phase !== 'fallback'
    || !mainWindow || mainWindow.isDestroyed()
    || event.sender.id !== mainWindow.webContents.id
    || pending.requesterSenderId !== event.sender.id
  ) return;
  completeDanmuStateResetFallback(requestId, Boolean(succeeded));
});

// IPC：主页发送弹幕 → 转发给弹幕窗口
ipcMain.on('danmu:send', (event, danmu) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) return;
  if (!currentDanmuSessionId) {
    currentDanmuSessionId = String(danmu?.liveSessionId || '').trim().slice(0, 256);
  }
  appendDanmuBuffer(danmu);
  if (danmuWindow && !danmuWindow.isDestroyed()) {
    danmuWindow.webContents.send('danmu:push', danmu);
  }
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.webContents.send('danmu:push', danmu);
  }
});

// IPC：弹幕窗口请求回放缓存的弹幕
ipcMain.on('danmu:request-buffer', (event) => {
  const isDanmuSender = danmuWindow && !danmuWindow.isDestroyed() &&
    event.sender.id === danmuWindow.webContents.id;
  const isDisplaySender = displayWindow && !displayWindow.isDestroyed() &&
    event.sender.id === displayWindow.webContents.id;
  if (!isDanmuSender && !isDisplaySender) return;
  if (isDanmuSender) {
    danmuOwnerReadySenderId = event.sender.id;
    deliverPendingDanmuStateResetRequests();
  }
  // 即使缓存暂时为空，也先告诉晚打开或刚恢复的窗口“当前是哪一场”。bind 不会
  // 重置同一场的充能和待揭晓结果，真正的新连接由 reset-session 明确清理。
  if (currentDanmuSessionId) event.sender.send('danmu:session-bind', currentDanmuSessionId);
  for (let index = 0; index < danmuBufferCount; index += 1) {
    const danmu = danmuBuffer[(danmuBufferStart + index) % DANMU_BUFFER_MAX];
    if (danmu) event.sender.send('danmu:push', danmu);
  }
});

// 透明弹幕窗口只在弹幕和控件上接收鼠标，其他区域交给下层应用。
ipcMain.on('danmu:set-mouse-passthrough', (event, ignore) => {
  if (!danmuWindow || danmuWindow.isDestroyed()) return;
  if (event.sender.id !== danmuWindow.webContents.id) return;
  danmuWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
});

ipcMain.handle('danmu:get-cursor-position', (event) => {
  if (!danmuWindow || danmuWindow.isDestroyed()) return null;
  if (event.sender.id !== danmuWindow.webContents.id) return null;
  const cursor = screen.getCursorScreenPoint();
  const bounds = danmuWindow.getBounds();
  return {
    x: cursor.x - bounds.x,
    y: cursor.y - bounds.y,
    inside: cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width &&
      cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height
  };
});

ipcMain.on('danmu:close', (event) => {
  if (danmuWindow && !danmuWindow.isDestroyed() && event.sender.id === danmuWindow.webContents.id) {
    danmuWindow.close();
  }
});

// 创建弹幕充能窗口
function createDanmuWindow() {
  if (danmuWindow) {
    danmuWindow.focus();
    return;
  }

  const targetDisplay = getDanmuTargetDisplay();
  const workArea = targetDisplay.workArea;

  danmuWindow = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    ...TRANSPARENT_AUXILIARY_WINDOW_CHROME,
    title: '弹幕展示',
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // 直播伴侣通常让该透明窗口长期处于非焦点或被遮挡状态；保持动画和回收计时器运行。
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  // `closed` fires after Electron has destroyed the native BrowserWindow. Reading
  // `danmuWindow.webContents` inside that callback can therefore throw
  // "Object has been destroyed". Capture the immutable sender id while the
  // window is alive and use it for all post-close bookkeeping.
  const danmuWindowSenderId = danmuWindow.webContents.id;

  guardAuxiliaryWindowNavigation(danmuWindow, 'danmu');
  danmuOwnerReadySenderId = null;
  attachRendererRecovery(danmuWindow, '弹幕充能大屏', {
    beforeReload: () => {
      danmuOwnerReadySenderId = null;
    },
    afterReload: () => {
      if (!danmuWindow || danmuWindow.isDestroyed()) return;
      moveDanmuWindowToConfiguredDisplay();
      danmuWindow.setAlwaysOnTop(true, DANMU_WINDOW_LEVEL);
      danmuWindow.show();
    }
  });
  danmuWindow.loadURL(`${APP_ORIGIN}/?danmu`);
  danmuWindow.once('ready-to-show', () => {
    danmuWindow?.setBounds(workArea);
    danmuWindow?.setAlwaysOnTop(true, DANMU_WINDOW_LEVEL);
    danmuWindow?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    danmuWindow?.show();
    raiseHighlightWindow();
  });

  danmuWindow.on('closed', () => {
    settleDanmuStateResetRequestsForSender(danmuWindowSenderId);
    if (danmuOwnerReadySenderId === danmuWindowSenderId) danmuOwnerReadySenderId = null;
    danmuWindow = null;
    lotteryOverlayActive = false;
    applyDisplayWindowLayer();
  });
}

// The main renderer uses an explicit IPC entry so opening the charging page does
// not depend on window.open policy or Chromium popup behavior.
ipcMain.on('open-danmu-page', (event) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (event.sender.id !== mainWindow.webContents.id) return;
  createDanmuWindow();
});

function createDisplayWindow() {
  if (displayWindow) {
    displayWindow.focus();
    return;
  }

  const initialBounds = getSidebarBounds(getSidebarTargetDisplay());
  displayWindow = new BrowserWindow({
    ...initialBounds,
    ...TRANSPARENT_AUXILIARY_WINDOW_CHROME,
    minWidth: Math.min(380, initialBounds.width),
    minHeight: Math.min(620, initialBounds.height),
    title: '直播弹幕互动',
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    resizable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // 右侧展示通常不处于焦点，禁用后台节流以保持弹幕滚动帧率稳定。
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  guardAuxiliaryWindowNavigation(displayWindow, 'display');
  attachRendererRecovery(displayWindow, '侧边栏弹幕', {
    afterReload: () => {
      if (!displayWindow || displayWindow.isDestroyed()) return;
      applyDisplayWindowLayer();
      displayWindow.show();
    }
  });
  displayWindow.loadURL(`${APP_ORIGIN}/?display`);
  // 提前加载高亮窗口，避免第一次点击弹幕时才启动新的渲染进程。
  prepareHighlightWindow();
  displayWindow.once('ready-to-show', () => {
    displayWindow?.show();
    applyDisplayWindowLayer();
  });
  displayWindow.on('closed', () => {
    displayWindow = null;
    closeHighlightWindow();
  });
}

function getLiveOverlayBounds() {
  const savedBounds = normalizeLiveOverlayBounds(windowDisplayConfig.liveOverlayBounds);
  const targetDisplay = savedBounds ? screen.getDisplayMatching(savedBounds) : getMainWindowDisplay();
  const workArea = targetDisplay.workArea;
  // 旧版曾保存 16:9 绿幕尺寸；新版是放进竖屏顶部黑边的横向信息条，
  // 检测到旧比例时自动迁移，避免升级后仍打开一个铺满画面的大窗口。
  const hasStripRatio = Boolean(savedBounds && savedBounds.width / savedBounds.height >= 3.6);
  const preferredWidth = hasStripRatio ? savedBounds.width : Math.min(1080, workArea.width);
  const fitted = fitAspectRatioBounds({
    bounds: {
      x: savedBounds?.x ?? workArea.x,
      y: savedBounds?.y ?? workArea.y,
      width: preferredWidth,
      height: Math.round(preferredWidth / LIVE_OVERLAY_ASPECT_RATIO)
    },
    workArea,
    aspectRatio: LIVE_OVERLAY_ASPECT_RATIO,
    minimumWidth: LIVE_OVERLAY_MIN_WIDTH,
    minimumHeight: LIVE_OVERLAY_MIN_HEIGHT
  });
  if (savedBounds) return fitted;
  return {
    ...fitted,
    x: Math.round(workArea.x + (workArea.width - fitted.width) / 2),
    // 第一次打开直接贴在直播画面顶部；用户移动后的坐标仍会正常保存。
    y: workArea.y
  };
}

function areWindowBoundsEqual(left, right) {
  return Boolean(left && right &&
    left.x === right.x && left.y === right.y &&
    left.width === right.width && left.height === right.height);
}

function persistLiveOverlayBounds(bounds) {
  if (!bounds || areWindowBoundsEqual(windowDisplayConfig.liveOverlayBounds, bounds)) return false;
  windowDisplayConfig.liveOverlayBounds = { ...bounds };
  saveWindowDisplayConfig();
  return true;
}

function moveLiveOverlayWindowIntoVisibleWorkArea() {
  if (!liveOverlayWindow || liveOverlayWindow.isDestroyed()) return false;
  const current = liveOverlayWindow.getBounds();
  const targetDisplay = screen.getDisplayMatching(current);
  const bounds = fitAspectRatioBounds({
    bounds: current,
    workArea: targetDisplay.workArea,
    aspectRatio: LIVE_OVERLAY_ASPECT_RATIO,
    minimumWidth: LIVE_OVERLAY_MIN_WIDTH,
    minimumHeight: LIVE_OVERLAY_MIN_HEIGHT
  });
  liveOverlayWindow.setMinimumSize(
    Math.min(LIVE_OVERLAY_MIN_WIDTH, bounds.width),
    Math.min(LIVE_OVERLAY_MIN_HEIGHT, bounds.height)
  );
  if (!areWindowBoundsEqual(current, bounds)) liveOverlayWindow.setBounds(bounds);
  persistLiveOverlayBounds(bounds);
  return true;
}

function saveLiveOverlayBounds() {
  if (liveOverlaySaveTimer) {
    clearTimeout(liveOverlaySaveTimer);
    liveOverlaySaveTimer = null;
  }
  if (!liveOverlayWindow || liveOverlayWindow.isDestroyed()) return;
  persistLiveOverlayBounds(liveOverlayWindow.getBounds());
}

function scheduleLiveOverlayBoundsSave() {
  if (liveOverlaySaveTimer) clearTimeout(liveOverlaySaveTimer);
  liveOverlaySaveTimer = setTimeout(saveLiveOverlayBounds, 300);
}

function notifyLiveOverlayWindowState(open) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-overlay:state', Boolean(open));
  }
}

function createLiveOverlayWindow() {
  if (liveOverlayWindow && !liveOverlayWindow.isDestroyed()) {
    liveOverlayWindow.show();
    liveOverlayWindow.focus();
    return liveOverlayWindow;
  }

  const bounds = getLiveOverlayBounds();
  persistLiveOverlayBounds(bounds);
  liveOverlayWindow = new BrowserWindow({
    ...bounds,
    ...TRANSPARENT_AUXILIARY_WINDOW_CHROME,
    minWidth: Math.min(LIVE_OVERLAY_MIN_WIDTH, bounds.width),
    minHeight: Math.min(LIVE_OVERLAY_MIN_HEIGHT, bounds.height),
    title: LIVE_OVERLAY_WINDOW_TITLE,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#00ff00',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  const liveOverlaySenderId = liveOverlayWindow.webContents.id;

  liveOverlayWindow.setAspectRatio(LIVE_OVERLAY_ASPECT_RATIO);
  liveOverlayWindow.on('page-title-updated', event => {
    event.preventDefault();
    liveOverlayWindow?.setTitle(LIVE_OVERLAY_WINDOW_TITLE);
  });

  guardAuxiliaryWindowNavigation(liveOverlayWindow, 'live-info');
  attachRendererRecovery(liveOverlayWindow, '直播顶部信息条', {
    afterReload: () => {
      if (!liveOverlayWindow || liveOverlayWindow.isDestroyed()) return;
      liveOverlayWindow.setTitle(LIVE_OVERLAY_WINDOW_TITLE);
      liveOverlayWindow.setAlwaysOnTop(true, 'floating');
      liveOverlayWindow.show();
      liveOverlayWindow.moveTop();
    }
  });
  liveOverlayWindow.loadURL(`${APP_ORIGIN}/?live-info`);
  liveOverlayWindow.once('ready-to-show', () => {
    liveOverlayWindow?.setAlwaysOnTop(true, 'floating');
    liveOverlayWindow?.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    liveOverlayWindow?.show();
    liveOverlayWindow?.focus();
    liveOverlayWindow?.moveTop();
    notifyLiveOverlayWindowState(true);
  });
  liveOverlayWindow.on('move', scheduleLiveOverlayBoundsSave);
  liveOverlayWindow.on('resize', scheduleLiveOverlayBoundsSave);
  liveOverlayWindow.on('close', saveLiveOverlayBounds);
  liveOverlayWindow.on('closed', () => {
    auxiliaryResizeSessions.delete(liveOverlaySenderId);
    if (liveOverlaySaveTimer) clearTimeout(liveOverlaySaveTimer);
    liveOverlaySaveTimer = null;
    liveOverlayWindow = null;
    notifyLiveOverlayWindowState(false);
  });
  return liveOverlayWindow;
}

ipcMain.handle('live-overlay:get-open', (event) => {
  assertTrustedAppSender(event);
  return Boolean(liveOverlayWindow && !liveOverlayWindow.isDestroyed());
});

ipcMain.handle('live-overlay:toggle', (event) => {
  assertTrustedAppSender(event);
  if (!mainWindow || mainWindow.isDestroyed() || event.sender.id !== mainWindow.webContents.id) return false;
  if (liveOverlayWindow && !liveOverlayWindow.isDestroyed()) {
    liveOverlayWindow.close();
    return false;
  }
  createLiveOverlayWindow();
  return true;
});

// 创建主窗口
function createMainWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const width = Math.min(1440, workArea.width);
  const height = Math.min(900, workArea.height);
  mainWindow = new BrowserWindow({
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
    minWidth: Math.min(1080, width),
    minHeight: Math.min(700, height),
    title: '抖音弹幕姬',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f6f5',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f7f6f5',
      symbolColor: '#59676e',
      height: 40
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  attachRendererRecovery(mainWindow, '主控制台', {
    afterReload: () => mainWindow?.show()
  });

  mainWindow.loadURL(`${APP_ORIGIN}/`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // 拦截 window.open：如果是弹幕页面就在应用内打开，否则用浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const mode = getInternalWindowMode(url);
    if (mode === 'live-info') {
      createLiveOverlayWindow();
      return { action: 'deny' };
    }
    if (mode === 'display') {
      createDisplayWindow();
      return { action: 'deny' };
    }
    if (mode === 'danmu') {
      createDanmuWindow();
      return { action: 'deny' };
    }
    try {
      if (new URL(url).origin !== APP_ORIGIN) openExternalHttpUrl(url);
    } catch {}
    return { action: 'deny' };
  });

  // 内部功能页使用独立窗口；外部导航只允许交给系统浏览器打开。
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const mode = getInternalWindowMode(url);
    if (mode === 'live-info') {
      event.preventDefault();
      createLiveOverlayWindow();
      return;
    }
    if (mode === 'display') {
      event.preventDefault();
      createDisplayWindow();
      return;
    }
    if (mode === 'danmu') {
      event.preventDefault();
      createDanmuWindow();
      return;
    }
    if (getTrustedRendererMode(url, APP_ORIGIN) === 'main') return;
    event.preventDefault();
    try {
      if (new URL(url).origin !== APP_ORIGIN) openExternalHttpUrl(url);
    } catch {}
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (danmuWindow) {
      danmuWindow.close();
      danmuWindow = null;
    }
    if (displayWindow) {
      displayWindow.close();
      displayWindow = null;
    }
    if (liveOverlayWindow) {
      liveOverlayWindow.close();
      liveOverlayWindow = null;
    }
    closeHighlightWindow();
  });

  mainWindow.on('close', (event) => {
    // 退出前的设置握手完成之前，连续点击关闭也不能提前销毁 renderer。
    if (settingsShutdownFlushCompleted) return;
    event.preventDefault();
    if (isQuitting) return;
    isQuitting = true;
    app.quit();
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!focusExistingWindow(mainWindow) && !isQuitting) shouldFocusMainOnReady = true;
  });

  // 应用启动
  app.whenReady().then(async () => {
  try {
    // 本应用不需要摄像头、麦克风、定位、USB 等浏览器权限；统一拒绝可缩小
    // 渲染页或第三方内容意外请求权限时的攻击面。
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setDevicePermissionHandler(() => false);
    initializePersistentStorage();
    migrateLegacyAICredential();
    loadWindowDisplayConfig();
    screen.on('display-added', handleDisplayTopologyChange);
    screen.on('display-removed', handleDisplayTopologyChange);
    screen.on('display-metrics-changed', handleDisplayTopologyChange);
    await startServer();
    await migrateLegacyLocalStorage();
    await synchronizePublicSettingsToLocalStorage();
    createMainWindow();
    isStarting = false;
    if (shouldFocusMainOnReady) {
      shouldFocusMainOnReady = false;
      focusExistingWindow(mainWindow);
    }
    // 应用空闲时完成高亮页初始化，弹幕点击后无需等待页面加载。
    prepareHighlightWindow();
  } catch (err) {
    isStarting = false;
    console.error('启动失败:', err);
    const message = err?.code === 'EADDRINUSE'
      ? `本机端口 ${PORT} 已被其他程序占用。请关闭占用该端口的程序后重新打开抖音弹幕姬。`
      : `程序启动时遇到问题：${String(err?.message || err || '未知错误')}`;
    dialog.showErrorBox('抖音弹幕姬启动失败', message);
    app.quit();
  }
  });
}

app.on('before-quit', event => {
  isQuitting = true;
  if (!settingsShutdownFlushCompleted) {
    event.preventDefault();
    if (!settingsShutdownFlushPromise) {
      settingsShutdownFlushPromise = flushTrustedRendererSettingsBeforeQuit()
        .catch(error => console.warn('[settings] 退出前刷新设置失败:', error))
        .finally(() => {
          settingsShutdownFlushCompleted = true;
          settingsShutdownFlushPromise = null;
          shutdownLocalServer();
          app.quit();
        });
    }
    return;
  }
  shutdownLocalServer();
});

app.on('window-all-closed', () => {
  if (isStarting) return;
  shutdownLocalServer();
  app.quit();
});

app.on('activate', () => {
  if (hasSingleInstanceLock && mainWindow === null && !isQuitting) {
    createMainWindow();
  }
});
