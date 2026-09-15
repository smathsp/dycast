type SettingsPatch = Record<string, unknown>;

function isPlainObject(value: unknown): value is SettingsPatch {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function encodePath(path: string[]): string {
  return JSON.stringify(path);
}

function walkLeafPaths(value: SettingsPatch, visit: (path: string[]) => void, prefix: string[] = []): void {
  for (const [key, child] of Object.entries(value)) {
    const path = [...prefix, key];
    if (isPlainObject(child) && Object.keys(child).length > 0) walkLeafPaths(child, visit, path);
    else visit(path);
  }
}

function pathsOverlap(left: string[], right: string[]): boolean {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * 记录每个设置叶字段最后一次本地修改的版本。旧补丁保存失败时，只重试期间
 * 没有被更新修改覆盖的字段，防止一次迟到的失败把较新的成功设置回滚。
 */
export function createSettingsPatchVersionTracker() {
  let currentVersion = 0;
  const latestLeafVersions = new Map<string, { path: string[]; version: number }>();

  function record(patch: SettingsPatch): number {
    const version = ++currentVersion;
    walkLeafPaths(patch, path => {
      latestLeafVersions.set(encodePath(path), { path, version });
    });
    return version;
  }

  function hasNewerOverlappingPath(path: string[], version: number): boolean {
    for (const entry of latestLeafVersions.values()) {
      if (entry.version > version && pathsOverlap(path, entry.path)) return true;
    }
    return false;
  }

  function filterForRetry(patch: SettingsPatch, version: number, prefix: string[] = []): SettingsPatch {
    const entries: Array<[string, unknown]> = [];
    for (const [key, value] of Object.entries(patch)) {
      const path = [...prefix, key];
      if (isPlainObject(value) && Object.keys(value).length > 0) {
        const filtered = filterForRetry(value, version, path);
        if (Object.keys(filtered).length > 0) entries.push([key, filtered]);
      } else if (!hasNewerOverlappingPath(path, version)) {
        entries.push([key, value]);
      }
    }
    return Object.fromEntries(entries);
  }

  return { record, filterForRetry };
}
