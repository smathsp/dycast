/**
 * Electron 主进程
 *  - 启动代理服务器（server.cjs）
 *  - 创建应用窗口
 */

const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 15173;
let mainWindow = null;
let danmuWindow = null;
let serverInstance = null;

// 获取正确的资源路径
function getDistPath() {
  return path.join(app.getAppPath(), 'dist');
}

// 启动代理服务器
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const serverCjsPath = path.join(app.getAppPath(), 'dist', 'server.cjs');
      process.env.DYCAST_DIST = getDistPath();
      process.env.DYCAST_PORT = String(PORT);
      serverInstance = require(serverCjsPath);

      let retries = 0;
      const check = () => {
        http.get(`http://localhost:${PORT}/`, (res) => {
          if (res.statusCode === 200) resolve();
          else retry();
        }).on('error', retry);
      };

      const retry = () => {
        retries++;
        if (retries > 50) {
          reject(new Error('服务器启动超时'));
          return;
        }
        setTimeout(check, 200);
      };

      setTimeout(check, 500);
    } catch (err) {
      reject(err);
    }
  });
}

// 缓存最近的弹幕，供弹幕窗口打开时回放
const danmuBuffer = [];
const DANMU_BUFFER_MAX = 200;

// IPC：主页发送弹幕 → 转发给弹幕窗口
ipcMain.on('danmu:send', (event, danmu) => {
  danmuBuffer.push(danmu);
  if (danmuBuffer.length > DANMU_BUFFER_MAX) {
    danmuBuffer.splice(0, danmuBuffer.length - DANMU_BUFFER_MAX);
  }
  if (danmuWindow && !danmuWindow.isDestroyed()) {
    danmuWindow.webContents.send('danmu:push', danmu);
  }
});

// IPC：弹幕窗口请求回放缓存的弹幕
ipcMain.on('danmu:request-buffer', (event) => {
  for (const d of danmuBuffer) {
    event.sender.send('danmu:push', d);
  }
});

// 创建弹幕充能窗口
function createDanmuWindow() {
  if (danmuWindow) {
    danmuWindow.focus();
    return;
  }

  danmuWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '弹幕充能',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  danmuWindow.loadURL(`http://localhost:${PORT}/?danmu`);

  danmuWindow.on('closed', () => {
    danmuWindow = null;
  });
}

// 创建主窗口
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: '抖音弹幕姬',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}/`);

  // 拦截 window.open：如果是弹幕页面就在应用内打开，否则用浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('?danmu')) {
      createDanmuWindow();
      return { action: 'deny' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 拦截导航：如果是弹幕页面就在应用内打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('?danmu')) {
      event.preventDefault();
      createDanmuWindow();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (danmuWindow) {
      danmuWindow.close();
      danmuWindow = null;
    }
  });
}

// 应用启动
app.whenReady().then(async () => {
  try {
    await startServer();
    createMainWindow();
  } catch (err) {
    console.error('启动失败:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverInstance) {
    try { serverInstance.close(); } catch {}
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
