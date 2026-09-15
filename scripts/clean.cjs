const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const removeAll = process.argv.includes('--all');
const generatedDirectories = new Set(['build', 'dist', 'dist-ssr', 'release']);
const extendedDirectories = new Set(['coverage', 'test-artifacts']);
const disposableLogPattern = /^(?:\.tmp-|\.vite-).+\.log$/i;

function resolveProjectTarget(name) {
  const target = path.resolve(projectRoot, name);
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`拒绝清理仓库之外的路径：${target}`);
  }
  return target;
}

const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
const targets = entries.filter((entry) => {
  if (entry.isDirectory()) {
    return generatedDirectories.has(entry.name) ||
      (removeAll && extendedDirectories.has(entry.name));
  }
  return removeAll && disposableLogPattern.test(entry.name);
});

for (const entry of targets) {
  const target = resolveProjectTarget(entry.name);
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  console.log(`[clean] removed ${entry.name}`);
}

if (!targets.length) console.log('[clean] nothing to remove');
