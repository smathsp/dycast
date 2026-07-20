const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openDanmuPage: () => ipcRenderer.send('open-danmu-page'),
  /** 主页→主进程：发送弹幕 */
  sendDanmu: (danmu) => ipcRenderer.send('danmu:send', danmu),
  /** 弹幕页←主进程：接收弹幕 */
  onDanmu: (callback) => ipcRenderer.on('danmu:push', (_event, danmu) => callback(danmu)),
  /** 弹幕页→主进程：请求回放缓存弹幕 */
  requestBuffer: () => ipcRenderer.send('danmu:request-buffer')
});
