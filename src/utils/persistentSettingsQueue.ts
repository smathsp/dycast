export type PersistentSettingsSection = 'app' | 'danmu' | 'audio';

type SettingsObject = Record<string, unknown>;

export interface PersistentSettingsSaveQueueOptions {
  persist: (section: PersistentSettingsSection, value: SettingsObject) => Promise<unknown>;
  maxAttempts?: number;
  retryDelayMs?: number;
  /** 失败后保留到下一次 enqueue/flush 再尝试的分区。 */
  retainFailedSections?: Iterable<PersistentSettingsSection>;
  wait?: (delayMs: number) => Promise<void>;
  onError?: (error: unknown, section: PersistentSettingsSection, attempts: number) => void;
}

type PersistentSettingsFlushHook = () => void | Promise<void>;

interface PendingWrite {
  value: SettingsObject;
  resolve: Array<(saved: boolean) => void>;
  superseded: SettingsObject;
}

const ALLOWED_SECTIONS = new Set<PersistentSettingsSection>(['app', 'danmu', 'audio']);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 80;

function isPlainObject(value: unknown): value is SettingsObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneSettingsObject(value: object): SettingsObject {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('设置必须是可序列化对象');
  const cloned = JSON.parse(serialized) as unknown;
  if (!isPlainObject(cloned)) throw new Error('设置必须是对象');
  return cloned;
}

/**
 * 合并同一分区尚未发送的修改。对象递归合并，数组和标量以后一次修改为准，
 * 因而新版本加入但旧版本不认识的字段不会被相邻的局部保存抹掉。
 */
export function mergePersistentSettingsValues(
  currentValue: SettingsObject,
  nextValue: SettingsObject
): SettingsObject {
  const entries = new Map(Object.entries(currentValue));
  for (const [key, value] of Object.entries(nextValue)) {
    const current = entries.get(key);
    entries.set(
      key,
      isPlainObject(current) && isPlainObject(value)
        ? mergePersistentSettingsValues(current, value)
        : value
    );
  }
  // Object.fromEntries 会把 __proto__ 等名称作为普通数据属性处理。
  return Object.fromEntries(entries);
}

/**
 * 只生成相对上一份快照真正变化的字段。跨窗口都提交字段补丁后，主进程可以
 * 在同一份权威文档上串行合并，不会再由后写入的旧整份快照回滚其它窗口的修改。
 */
export function diffPersistentSettingsValues(
  previousValue: SettingsObject,
  nextValue: SettingsObject
): SettingsObject {
  const patchEntries: Array<[string, unknown]> = [];
  for (const [key, next] of Object.entries(nextValue)) {
    const previous = previousValue[key];
    if (isPlainObject(previous) && isPlainObject(next)) {
      const nestedPatch = diffPersistentSettingsValues(previous, next);
      if (Object.keys(nestedPatch).length > 0) patchEntries.push([key, nestedPatch]);
      continue;
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
      if (JSON.stringify(previous) !== JSON.stringify(next)) patchEntries.push([key, next]);
      continue;
    }
    if (!Object.is(previous, next)) patchEntries.push([key, next]);
  }
  return Object.fromEntries(patchEntries);
}

/** 删除被一份较新权威补丁覆盖的叶字段，保留互不相关的本地修改。 */
export function removeSupersededPersistentSettingsValues(
  value: SettingsObject,
  supersedingPatch: SettingsObject
): SettingsObject {
  const entries: Array<[string, unknown]> = [];
  for (const [key, current] of Object.entries(value)) {
    if (!Object.prototype.hasOwnProperty.call(supersedingPatch, key)) {
      entries.push([key, current]);
      continue;
    }
    const superseding = supersedingPatch[key];
    if (isPlainObject(current) && isPlainObject(superseding)) {
      const remaining = removeSupersededPersistentSettingsValues(current, superseding);
      if (Object.keys(remaining).length > 0) entries.push([key, remaining]);
    }
    // 标量/数组/结构替换均由较新的权威值完整覆盖。
  }
  return Object.fromEntries(entries);
}

export function createPersistentSettingsSaveQueue(options: PersistentSettingsSaveQueueOptions) {
  const maxAttempts = Number.isFinite(options.maxAttempts)
    ? Math.min(5, Math.max(1, Math.trunc(options.maxAttempts!)))
    : DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs = Number.isFinite(options.retryDelayMs)
    ? Math.min(5000, Math.max(0, Math.trunc(options.retryDelayMs!)))
    : DEFAULT_RETRY_DELAY_MS;
  const wait = options.wait || ((delayMs: number) => new Promise<void>(resolve => {
    setTimeout(resolve, delayMs);
  }));
  const retainFailedSections = new Set(options.retainFailedSections || []);
  const pendingBySection = new Map<PersistentSettingsSection, PendingWrite>();
  const failedBySection = new Map<PersistentSettingsSection, PendingWrite>();
  const activeBySection = new Map<PersistentSettingsSection, PendingWrite>();
  const sectionOrder: PersistentSettingsSection[] = [];
  let drainPromise: Promise<void> | null = null;
  let failureVersion = 0;

  function reportError(error: unknown, section: PersistentSettingsSection, attempts: number): void {
    try { options.onError?.(error, section, attempts); } catch {}
  }

  function applySupersedingPatch(pending: PendingWrite): void {
    if (Object.keys(pending.superseded).length === 0) return;
    pending.value = removeSupersededPersistentSettingsValues(
      pending.value,
      pending.superseded
    );
    pending.superseded = {};
  }

  async function persistWithRetry(
    section: PersistentSettingsSection,
    pending: PendingWrite
  ): Promise<boolean> {
    let lastError: unknown = new Error('保存公共设置失败');
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      applySupersedingPatch(pending);
      // 同字段已由更晚的主进程权威广播落盘，无需再用旧补丁覆盖。
      if (Object.keys(pending.value).length === 0) return true;
      try {
        // 必须等主进程 ACK 后才能发送下一项，避免后发写入先落盘。
        await options.persist(section, pending.value);
        return true;
      } catch (error) {
        lastError = error;
        applySupersedingPatch(pending);
        if (Object.keys(pending.value).length === 0) return true;
        if (attempt < maxAttempts) {
          await wait(retryDelayMs * (2 ** (attempt - 1)));
        }
      }
    }
    reportError(lastError, section, maxAttempts);
    return false;
  }

  async function drain(): Promise<void> {
    while (sectionOrder.length > 0) {
      const section = sectionOrder.shift()!;
      const pending = pendingBySection.get(section);
      if (!pending) continue;
      pendingBySection.delete(section);
      const retainedBeforeWrite = failedBySection.get(section);
      if (retainedBeforeWrite) {
        failedBySection.delete(section);
        // 失败项更旧；同字段以随后排队的新值为准。
        pending.value = mergePersistentSettingsValues(retainedBeforeWrite.value, pending.value);
        pending.superseded = mergePersistentSettingsValues(
          retainedBeforeWrite.superseded,
          pending.superseded
        );
      }
      activeBySection.set(section, pending);
      const saved = await persistWithRetry(section, pending);
      activeBySection.delete(section);
      if (!saved) failureVersion++;
      if (!saved && retainFailedSections.has(section) && Object.keys(pending.value).length > 0) {
        const retained = failedBySection.get(section);
        failedBySection.set(section, retained
          ? {
              value: mergePersistentSettingsValues(retained.value, pending.value),
              resolve: [],
              superseded: mergePersistentSettingsValues(retained.superseded, pending.superseded)
            }
          : { value: pending.value, resolve: [], superseded: pending.superseded });
      }
      pending.resolve.forEach(resolve => resolve(saved));
    }
  }

  function startDrain(): void {
    if (drainPromise) return;
    // 延迟到微任务再开始，让同一轮表单更新先按 section 合并。
    drainPromise = Promise.resolve()
      .then(drain)
      .finally(() => {
        drainPromise = null;
        if (sectionOrder.length > 0) startDrain();
      });
  }

  function enqueue(section: PersistentSettingsSection, value: object): Promise<boolean> {
    if (!ALLOWED_SECTIONS.has(section)) {
      const error = new Error(`不支持的设置分区: ${String(section)}`);
      reportError(error, section, 0);
      return Promise.resolve(false);
    }

    let snapshot: SettingsObject;
    try {
      snapshot = cloneSettingsObject(value);
    } catch (error) {
      reportError(error, section, 0);
      return Promise.resolve(false);
    }

    return new Promise<boolean>(resolve => {
      const failed = failedBySection.get(section);
      if (failed) failedBySection.delete(section);
      const pending = pendingBySection.get(section);
      if (pending) {
        pending.value = mergePersistentSettingsValues(
          failed ? mergePersistentSettingsValues(failed.value, pending.value) : pending.value,
          snapshot
        );
        if (failed) {
          pending.superseded = mergePersistentSettingsValues(failed.superseded, pending.superseded);
        }
        pending.resolve.push(resolve);
      } else {
        pendingBySection.set(section, {
          value: failed ? mergePersistentSettingsValues(failed.value, snapshot) : snapshot,
          resolve: [resolve],
          superseded: failed?.superseded || {}
        });
        sectionOrder.push(section);
      }
      startDrain();
    });
  }

  function markCanonicalPatch(section: PersistentSettingsSection, patch: object): void {
    if (!ALLOWED_SECTIONS.has(section)) return;
    let snapshot: SettingsObject;
    try {
      snapshot = cloneSettingsObject(patch);
    } catch {
      return;
    }
    if (Object.keys(snapshot).length === 0) return;

    const active = activeBySection.get(section);
    if (active) {
      active.superseded = mergePersistentSettingsValues(active.superseded, snapshot);
    }
    // 尚未发送的补丁可能比当前广播更新（典型情况：A 已在写入、B 随后排队，
    // 此时收到 A 的成功广播）。因此这里只裁剪真正失败后会重试的 active/failed，
    // 不能把排队中的 B 当成旧值删除。
    const failed = failedBySection.get(section);
    if (failed) {
      failed.value = removeSupersededPersistentSettingsValues(failed.value, snapshot);
      if (Object.keys(failed.value).length === 0) failedBySection.delete(section);
    }
  }

  function getRetainedValue(section: PersistentSettingsSection): SettingsObject {
    const failed = failedBySection.get(section);
    return failed ? cloneSettingsObject(failed.value) : {};
  }

  function promoteRetainedFailures(): void {
    for (const [section, failed] of failedBySection) {
      failedBySection.delete(section);
      const pending = pendingBySection.get(section);
      if (pending) {
        pending.value = mergePersistentSettingsValues(failed.value, pending.value);
        pending.superseded = mergePersistentSettingsValues(failed.superseded, pending.superseded);
      } else {
        pendingBySection.set(section, failed);
        sectionOrder.push(section);
      }
    }
  }

  async function flush(): Promise<boolean> {
    const startingFailureVersion = failureVersion;
    promoteRetainedFailures();
    while (drainPromise || sectionOrder.length > 0) {
      if (!drainPromise) startDrain();
      await drainPromise;
    }
    return failureVersion === startingFailureVersion && failedBySection.size === 0;
  }

  return {
    enqueue,
    flush,
    getRetainedValue,
    markCanonicalPatch,
    hasPending: () => Boolean(drainPromise || sectionOrder.length > 0 || failedBySection.size > 0)
  };
}

/** 在 storage 事件同步响应式状态时，阻止监听器把同一份值写回来源窗口。 */
export function createStorageEventWriteGuard() {
  let suppressDepth = 0;
  return {
    runWithoutWrite<T>(operation: () => T): T {
      suppressDepth++;
      try {
        return operation();
      } finally {
        suppressDepth--;
      }
    },
    shouldWrite(): boolean {
      return suppressDepth === 0;
    }
  };
}

const rendererSettingsQueue = createPersistentSettingsSaveQueue({
  retainFailedSections: ['app', 'danmu', 'audio'],
  async persist(section, value) {
    if (typeof window === 'undefined') return;
    const save = window.electronAPI?.savePersistentSettingsSection;
    if (save) await save(section, value);
  },
  onError(error, section, attempts) {
    console.warn(
      `[settings] 保存公共 ${section} 设置失败${attempts ? `（已尝试 ${attempts} 次）` : ''}:`,
      error
    );
  }
});

const persistentSettingsFlushHooks = new Set<PersistentSettingsFlushHook>();

/** 注册必须在队列落盘前执行的同步/异步动作，例如提交表单防抖中的最后一批字段。 */
export function registerPersistentSettingsFlushHook(hook: PersistentSettingsFlushHook): () => void {
  persistentSettingsFlushHooks.add(hook);
  return () => persistentSettingsFlushHooks.delete(hook);
}

export function enqueuePersistentSettingsSection(
  section: PersistentSettingsSection,
  value: object
): Promise<boolean> {
  return rendererSettingsQueue.enqueue(section, value);
}

/** 告知队列哪些字段已经被主进程更晚的权威值覆盖，停止旧值重试。 */
export function markPersistentSettingsCanonicalPatch(
  section: PersistentSettingsSection,
  patch: object
): void {
  rendererSettingsQueue.markCanonicalPatch(section, patch);
}

/** 读取仍待重试的失败补丁；返回副本，供权威广播与本地未提交值重新合成。 */
export function getRetainedPersistentSettingsSection(
  section: PersistentSettingsSection
): Record<string, unknown> {
  return rendererSettingsQueue.getRetainedValue(section);
}

export async function flushPersistentSettingsSaves(): Promise<boolean> {
  let hooksSucceeded = true;
  for (const hook of [...persistentSettingsFlushHooks]) {
    try {
      await hook();
    } catch (error) {
      hooksSucceeded = false;
      console.warn('[settings] 退出前提交设置失败:', error);
    }
  }
  return (await rendererSettingsQueue.flush()) && hooksSucceeded;
}

if (typeof window !== 'undefined') {
  // pagehide 无法阻止页面销毁，只能尽早发起；真正退出应用时主进程会通过
  // 下方握手等待 ACK，并设置硬超时保证损坏/不可信页面不能卡住退出。
  window.addEventListener('pagehide', () => {
    void flushPersistentSettingsSaves();
  });
  window.electronAPI?.onPersistentSettingsFlushRequested?.(
    () => flushPersistentSettingsSaves()
  );
}
