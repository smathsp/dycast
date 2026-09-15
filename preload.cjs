const { contextBridge, ipcRenderer, webUtils } = require('electron');

function sendSynchronousSettingsMutation(channel, value) {
  const response = ipcRenderer.sendSync(channel, value);
  if (!response?.ok) {
    throw new Error(String(response?.error || '更新公共设置失败'));
  }
  return response.result;
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getPersistentSettingsInfo: () => ipcRenderer.invoke('settings:get-storage-info'),
  savePersistentSettingsSection: (section, value) => ipcRenderer.invoke('settings:save-section', section, value),
  setRemainingWinnerCount: (value) => sendSynchronousSettingsMutation('settings:set-remaining-winners', value),
  consumeRemainingWinnerCount: (value) => sendSynchronousSettingsMutation('settings:consume-remaining-winners', value),
  restoreRemainingWinnerCount: (value) => sendSynchronousSettingsMutation('settings:restore-remaining-winners', value),
  reserveLotteryBatch: (request) => sendSynchronousSettingsMutation('lottery:reserve-batch', request),
  finalizeLotteryBatch: (request) => sendSynchronousSettingsMutation('lottery:finalize-batch', request),
  onPersistentSettingsSectionUpdated: (callback) => {
    const listener = (_event, section, value, canonicalPatch) => callback(section, value, canonicalPatch);
    ipcRenderer.on('settings:section-updated', listener);
    return () => ipcRenderer.removeListener('settings:section-updated', listener);
  },
  onPersistentSettingsFlushRequested: (callback) => {
    const listener = (_event, rawRequestId) => {
      const requestId = String(rawRequestId || '');
      if (!/^\d+-\d+-\d+$/.test(requestId)) return;
      Promise.resolve()
        .then(() => callback())
        .then(
          succeeded => ipcRenderer.send('settings:flush-ack', requestId, succeeded !== false),
          () => ipcRenderer.send('settings:flush-ack', requestId, false)
        );
    };
    ipcRenderer.on('settings:flush-request', listener);
    ipcRenderer.send('settings:flush-ready');
    return () => ipcRenderer.removeListener('settings:flush-request', listener);
  },
  openPersistentSettingsFolder: () => ipcRenderer.invoke('settings:open-folder'),
  listAudioFiles: () => ipcRenderer.invoke('audio:list'),
  importAudioFiles: (category) => ipcRenderer.invoke('audio:import', category),
  importAudioPaths: (category, paths) => ipcRenderer.invoke('audio:import-paths', category, paths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  exportAudioPack: (config) => ipcRenderer.invoke('audio:pack-export', config),
  importAudioPack: (filePath) => ipcRenderer.invoke('audio:pack-import', filePath),
  deleteAudioFile: (id) => ipcRenderer.invoke('audio:delete', id),
  openAudioFolder: () => ipcRenderer.invoke('audio:open-folder'),
  fetchImageDataUrl: (url) => ipcRenderer.invoke('image:fetch-data-url', url),
  copyImageToClipboard: (dataUrl) => ipcRenderer.invoke('clipboard:write-image', dataUrl),
  saveExcelWorkbook: (config) => ipcRenderer.invoke('excel:save-workbook', config),
  getAICredentialState: (endpoint) => ipcRenderer.invoke('ai:get-credential-state', endpoint),
  setAIApiKey: (apiKey, endpoint) => ipcRenderer.invoke('ai:set-api-key', apiKey, endpoint),
  curateDanmu: (config, messages) => ipcRenderer.invoke('ai:curate-danmu', config, messages),
  getWindowDisplayState: () => ipcRenderer.invoke('windows:get-display-state'),
  setWindowDisplayConfig: (config) => ipcRenderer.invoke('windows:set-display-config', config),
  onWindowDisplaysChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('windows:displays-changed', listener);
    return () => ipcRenderer.removeListener('windows:displays-changed', listener);
  },
  getDisplayAlwaysOnTop: () => ipcRenderer.invoke('display:get-always-on-top'),
  setDisplayAlwaysOnTop: (value) => ipcRenderer.invoke('display:set-always-on-top', value),
  closeDisplayWindow: () => ipcRenderer.send('display:close'),
  resizeCurrentWindow: (payload) => ipcRenderer.send('window:resize-current', payload),
  showCommentHighlight: (item, duration) => ipcRenderer.invoke('highlight:show', item, duration),
  toggleCommentHighlightMaximize: () => ipcRenderer.invoke('highlight:toggle-maximize'),
  closeCommentHighlight: () => ipcRenderer.send('highlight:close'),
  onCommentHighlight: (callback) => {
    const listener = (_event, item) => callback(item);
    ipcRenderer.on('highlight:show', listener);
    return () => ipcRenderer.removeListener('highlight:show', listener);
  },
  openDanmuPage: () => ipcRenderer.send('open-danmu-page'),
  setDanmuMousePassthrough: (ignore) => ipcRenderer.send('danmu:set-mouse-passthrough', ignore),
  getDanmuCursorPosition: () => ipcRenderer.invoke('danmu:get-cursor-position'),
  setLotteryOverlayActive: (active) => ipcRenderer.send('lottery:set-overlay-active', active),
  closeDanmuPage: () => ipcRenderer.send('danmu:close'),
  toggleLiveOverlayWindow: () => ipcRenderer.invoke('live-overlay:toggle'),
  getLiveOverlayWindowOpen: () => ipcRenderer.invoke('live-overlay:get-open'),
  onLiveOverlayWindowState: (callback) => {
    const listener = (_event, open) => callback(Boolean(open));
    ipcRenderer.on('live-overlay:state', listener);
    return () => ipcRenderer.removeListener('live-overlay:state', listener);
  },
  /** 主页→主进程：发送弹幕 */
  sendDanmu: (danmu) => ipcRenderer.send('danmu:send', danmu),
  /** 新直播连接开始：清空上一场的弹幕计数与转发缓存 */
  resetDanmuSession: (sessionId) => ipcRenderer.send('danmu:reset-session', sessionId),
  /** 主窗口请求唯一的弹幕状态窗口重置当前充能与奖池 */
  requestDanmuStateReset: () => ipcRenderer.invoke('danmu:reset-state'),
  /** owner 未确认时，主窗口完成同源 fallback 后回 ACK，供退出屏障安全等待。 */
  completeDanmuStateResetFallback: (requestId, succeeded) => {
    ipcRenderer.send('danmu:state-reset-fallback-ack', requestId, succeeded !== false);
  },
  /** 弹幕页←主进程：接收弹幕 */
  onDanmu: (callback) => {
    const listener = (_event, danmu) => callback(danmu);
    ipcRenderer.on('danmu:push', listener);
    return () => ipcRenderer.removeListener('danmu:push', listener);
  },
  onDanmuSessionReset: (callback) => {
    const listener = (_event, sessionId) => callback(sessionId);
    ipcRenderer.on('danmu:session-reset', listener);
    return () => ipcRenderer.removeListener('danmu:session-reset', listener);
  },
  onDanmuSessionBind: (callback) => {
    const listener = (_event, sessionId) => callback(sessionId);
    ipcRenderer.on('danmu:session-bind', listener);
    return () => ipcRenderer.removeListener('danmu:session-bind', listener);
  },
  onDanmuStateReset: (callback) => {
    const listener = (_event, rawRequestId) => {
      const requestId = String(rawRequestId || '');
      if (!/^\d+-\d+-\d+$/.test(requestId)) return;
      Promise.resolve()
        .then(() => callback())
        .then(
          succeeded => ipcRenderer.send('danmu:state-reset-ack', requestId, succeeded !== false),
          () => ipcRenderer.send('danmu:state-reset-ack', requestId, false)
        );
    };
    ipcRenderer.on('danmu:state-reset', listener);
    return () => ipcRenderer.removeListener('danmu:state-reset', listener);
  },
  /** 弹幕页→主进程：请求回放缓存弹幕 */
  requestBuffer: () => ipcRenderer.send('danmu:request-buffer')
});
