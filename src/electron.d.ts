interface ElectronAPI {
  openDanmuPage: () => void;
  sendDanmu: (danmu: any) => void;
  onDanmu: (callback: (danmu: any) => void) => void;
  requestBuffer: () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
