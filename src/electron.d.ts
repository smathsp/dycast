interface ElectronAPI {
  isElectron: true;
  getPersistentSettingsInfo: () => Promise<{
    directory: string;
    filePath: string;
    isPublicDirectory: boolean;
  }>;
  savePersistentSettingsSection: (
    section: 'app' | 'danmu' | 'audio',
    value: object
  ) => Promise<{
    directory: string;
    filePath: string;
    isPublicDirectory: boolean;
    section: 'app' | 'danmu' | 'audio';
    value: object;
  }>;
  setRemainingWinnerCount: (value: number) => {
    remainingWinnerCount: number;
    settings: object;
  };
  consumeRemainingWinnerCount: (value: number) => {
    consumed: number;
    remainingWinnerCount: number;
    settings: object;
  };
  restoreRemainingWinnerCount: (value: number) => {
    restored: number;
    remainingWinnerCount: number;
    settings: object;
  };
  reserveLotteryBatch: (request: {
    batchId: string;
    requested: number;
    legacyAlreadyReserved?: boolean;
  }) => {
    batchId: string;
    reserved: number;
    restored: number;
    status: 'active' | 'finalized' | 'missing';
    remainingWinnerCount: number;
    settings: object;
    alreadyExisted?: boolean;
  };
  finalizeLotteryBatch: (request: {
    batchId: string;
    unrevealed: number;
  }) => {
    batchId: string;
    reserved: number;
    restored: number;
    status: 'active' | 'finalized' | 'missing';
    remainingWinnerCount: number;
    settings: object;
    alreadyFinalized?: boolean;
  };
  onPersistentSettingsSectionUpdated: (
    callback: (
      section: 'app' | 'danmu' | 'audio',
      value: object,
      canonicalPatch?: object
    ) => void
  ) => () => void;
  onPersistentSettingsFlushRequested: (
    callback: () => boolean | Promise<boolean>
  ) => () => void;
  openPersistentSettingsFolder: () => Promise<string>;
  listAudioFiles: () => Promise<Array<{
    id: string;
    category: 'charging' | 'lottery' | 'winner';
    name: string;
    mimeType: string;
    size: number;
    url: string;
    createdAt: number;
  }>>;
  importAudioFiles: (category: 'charging' | 'lottery' | 'winner') => Promise<{
    canceled: boolean;
    files: string[];
  }>;
  importAudioPaths: (category: 'charging' | 'lottery' | 'winner', paths: string[]) => Promise<string[]>;
  getPathForFile: (file: File) => string;
  exportAudioPack: (config: unknown) => Promise<{ canceled: boolean; filePath: string; count?: number }>;
  importAudioPack: (filePath?: string) => Promise<{
    canceled: boolean;
    files: string[];
    count: number;
    settings?: {
      configs: Record<'charging' | 'lottery' | 'winner', {
        mode: 'random' | 'single' | 'list';
        selectedTrackId: string;
        disabledTrackIds: string[];
      }>;
      masterVolume: number;
      volumeNormalization: boolean;
    };
  }>;
  deleteAudioFile: (id: string) => Promise<boolean>;
  openAudioFolder: () => Promise<string>;
  fetchImageDataUrl: (url: string) => Promise<string>;
  copyImageToClipboard: (dataUrl: string) => Promise<boolean>;
  saveExcelWorkbook: (config: ExcelWorkbookConfig) => Promise<ExcelSaveResult>;
  getAICredentialState: (endpoint: string) => Promise<{ stored: boolean; encryptionAvailable: boolean; endpointMatches: boolean }>;
  setAIApiKey: (apiKey: string, endpoint: string) => Promise<{ stored: boolean; encryptionAvailable: boolean; endpointMatches: boolean }>;
  curateDanmu: (
    config: { endpoint: string; model: string },
    messages: Array<{ id: string; nickname: string; content: string }>
  ) => Promise<string[]>;
  getWindowDisplayState: () => Promise<WindowDisplayState>;
  setWindowDisplayConfig: (config: Partial<WindowDisplayConfig>) => Promise<WindowDisplayState>;
  onWindowDisplaysChanged: (callback: (state: WindowDisplayState) => void) => () => void;
  getDisplayAlwaysOnTop: () => Promise<boolean>;
  setDisplayAlwaysOnTop: (value: boolean) => Promise<boolean>;
  closeDisplayWindow: () => void;
  resizeCurrentWindow: (payload: {
    phase: 'start' | 'move' | 'end';
    screenX: number;
    screenY: number;
  }) => void;
  showCommentHighlight: (item: any, duration: number) => Promise<boolean>;
  toggleCommentHighlightMaximize: () => Promise<boolean>;
  closeCommentHighlight: () => void;
  onCommentHighlight: (callback: (item: any) => void) => () => void;
  openDanmuPage: () => void;
  setDanmuMousePassthrough: (ignore: boolean) => void;
  getDanmuCursorPosition: () => Promise<{ x: number; y: number; inside: boolean } | null>;
  setLotteryOverlayActive: (active: boolean) => void;
  closeDanmuPage: () => void;
  toggleLiveOverlayWindow: () => Promise<boolean>;
  getLiveOverlayWindowOpen: () => Promise<boolean>;
  onLiveOverlayWindowState: (callback: (open: boolean) => void) => () => void;
  sendDanmu: (danmu: any) => void;
  resetDanmuSession: (sessionId: string) => void;
  requestDanmuStateReset: () => Promise<boolean | { routed: boolean; requestId: string }>;
  completeDanmuStateResetFallback: (requestId: string, succeeded: boolean) => void;
  onDanmu: (callback: (danmu: any) => void) => () => void;
  onDanmuSessionReset: (callback: (sessionId: string) => void) => () => void;
  onDanmuSessionBind: (callback: (sessionId: string) => void) => () => void;
  onDanmuStateReset: (callback: () => boolean | void | Promise<boolean | void>) => () => void;
  requestBuffer: () => void;
}

interface ExcelWorkbookConfig {
  fileName: string;
  sheetName: string;
  dialogTitle?: string;
  columns: Array<{ header: string; width?: number }>;
  rows: Array<Array<string | number | boolean | null | undefined>>;
}

interface ExcelSaveResult {
  canceled: boolean;
  filePath: string;
  rowCount?: number;
}

interface WindowDisplayConfig {
  danmuDisplayId: string;
  sidebarDisplayId: string;
  sidebarAlwaysOnTop: boolean;
  sidebarSize?: { width: number; height: number };
  highlightSize?: { width: number; height: number };
}

interface WindowDisplayInfo {
  id: string;
  label: string;
  primary: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

interface WindowDisplayState {
  config: WindowDisplayConfig;
  displays: WindowDisplayInfo[];
}

interface Window {
  electronAPI?: ElectronAPI;
}
