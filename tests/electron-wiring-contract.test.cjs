const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8');
const lotteryAnimationSource = fs.readFileSync(
  path.join(root, 'src/components/danmu/LotteryAnimation.vue'),
  'utf8'
);
const danmuStoreSource = fs.readFileSync(path.join(root, 'src/danmu/store.ts'), 'utf8');

test('repeated close attempts cannot bypass the settings flush gate', () => {
  assert.match(mainSource, /mainWindow\.on\('close',[\s\S]*?if \(settingsShutdownFlushCompleted\) return;\s*event\.preventDefault\(\);\s*if \(isQuitting\) return;/);
});

test('buffer replay binds the current live session even when the buffer is empty', () => {
  const handler = mainSource.match(/ipcMain\.on\('danmu:request-buffer',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.ok(handler.includes("event.sender.send('danmu:session-bind', currentDanmuSessionId)"));
  assert.ok(handler.indexOf("'danmu:session-bind'") < handler.indexOf('for (let index = 0'));
  assert.ok(preloadSource.includes("ipcRenderer.on('danmu:session-bind', listener)"));
});

test('a cancelled lottery invalidates both the animation and late reveal callbacks', () => {
  assert.match(lotteryAnimationSource, /if \(active\) startLotteryAnimation\(\);\s*else cancelLotteryAnimationView\(\);/);
  assert.match(lotteryAnimationSource, /if \(token !== animationToken \|\| !state\.isLotteryActive\) return;/);
  assert.ok(lotteryAnimationSource.includes('releaseBodyScroll?.();'));
});

test('the main settings window routes state reset to the unique danmu owner', () => {
  const handler = mainSource.match(/ipcMain\.handle\('danmu:reset-state',[\s\S]*?\n\}\);/)?.[0] || '';
  assert.ok(handler.includes('deliverDanmuStateResetRequest'));
  assert.ok(mainSource.includes("ipcMain.on('danmu:state-reset-ack'"));
  assert.ok(preloadSource.includes("ipcRenderer.on('danmu:state-reset', listener)"));
  assert.ok(preloadSource.includes("ipcRenderer.send('danmu:state-reset-ack', requestId, succeeded !== false)"));
  assert.ok(mainSource.includes('const isMainFallback = Boolean('));
  assert.match(mainSource, /const timeout = setTimeout\(\(\) => \{[\s\S]*?settleDanmuStateResetRequest\(requestId, false\);/);
});

test('quit drains an owner reset and its main-window fallback before settings flush', () => {
  const flushHandler = mainSource.match(
    /async function flushTrustedRendererSettingsBeforeQuit\(\) \{[\s\S]*?\n\}/
  )?.[0] || '';
  const resetHandler = mainSource.match(/ipcMain\.handle\('danmu:reset-state',[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(flushHandler, /await waitForPendingDanmuStateResetRequests\(\);[\s\S]*?Promise\.all/);
  assert.ok(resetHandler.indexOf('if (isQuitting)') < resetHandler.indexOf('pendingDanmuStateResetRequests.set'));
  assert.ok(mainSource.includes("ipcMain.on('danmu:state-reset-fallback-ack'"));
  assert.ok(preloadSource.includes("ipcRenderer.send('danmu:state-reset-fallback-ack'"));
  assert.ok(danmuStoreSource.includes('completeDanmuStateResetFallback?.(requestId, succeeded)'));
  assert.match(mainSource, /pending\.phase = 'fallback';[\s\S]*?pending\.resolve\(\{ routed: false, requestId \}\);/);
});

test('renderer recovery retries failed reloads without leaving its pending lock stuck', () => {
  const recoverySource = mainSource.match(
    /const RENDERER_RECOVERY_LOAD_TIMEOUT_MS[\s\S]*?\n\}\n\nconst AUDIO_CATEGORIES/
  )?.[0] || '';

  assert.ok(recoverySource.includes("webContents.on('did-fail-load', handleLoadFailure)"));
  assert.ok(recoverySource.includes("errorCode === -3"));
  assert.ok(recoverySource.includes('RENDERER_RECOVERY_LOAD_TIMEOUT_MS'));
  assert.ok(recoverySource.includes('let recoveryGeneration = 0'));
  assert.match(recoverySource, /if \(recoveryPending\) \{[\s\S]*?retryActiveRecovery\?\.\(reason\);/);
  assert.match(recoverySource, /attemptGeneration === recoveryGeneration[\s\S]*?recover\(failureReason \|\| 'reload-failed'\)/);
  assert.ok(recoverySource.includes("webContents.removeListener('did-finish-load', handleLoadSuccess)"));
  assert.ok(recoverySource.includes("webContents.removeListener('did-fail-load', handleLoadFailure)"));
});

test('lottery batches use owner-only idempotent reservation and finalization IPC', () => {
  assert.ok(mainSource.includes("ipcMain.on('lottery:reserve-batch'"));
  assert.ok(mainSource.includes("ipcMain.on('lottery:finalize-batch'"));
  assert.ok(preloadSource.includes("sendSynchronousSettingsMutation('lottery:reserve-batch'"));
  assert.ok(preloadSource.includes("sendSynchronousSettingsMutation('lottery:finalize-batch'"));
});

test('closing the danmu window never dereferences its destroyed BrowserWindow', () => {
  const createDanmuWindowSource = mainSource.match(
    /function createDanmuWindow\(\) \{[\s\S]*?\n\}/
  )?.[0] || '';
  const closedHandler = createDanmuWindowSource.match(
    /danmuWindow\.on\('closed', \(\) => \{[\s\S]*?\n  \}\);/
  )?.[0] || '';

  assert.match(createDanmuWindowSource, /const danmuWindowSenderId = danmuWindow\.webContents\.id;/);
  assert.match(closedHandler, /settleDanmuStateResetRequestsForSender\(danmuWindowSenderId\);/);
  assert.doesNotMatch(closedHandler, /danmuWindow(?:\?\.)?\.webContents/);
});
