export interface ElectronAPI {
  getDisplays: () => Promise<Display[]>;
  getPrimaryDisplay: () => Promise<Display>;
  showMainWindow: () => void;
  hideMainWindow: () => void;
  minimizeMainWindow: () => void;
  closeScreenshotWindow: (imageDataUrl?: string) => void;
  openEditor: (imageDataUrl: string) => void;
  saveImage: (dataUrl: string) => void;
  saveVideo: (buffer: ArrayBuffer, filename: string) => void;
  getSources: () => Promise<Source[]>;
  onLoadImage: (callback: (data: string) => void) => void;
  onScreenshotCaptured: (callback: (dataUrl: string) => void) => void;
  onStartRecording: (callback: () => void) => void;
  onToggleRecording: (callback: () => void) => void;
  showRecordWindow: () => void;
  hideRecordWindow: () => void;
  closeEditorWindow: () => void;
  startAreaScreenshot: () => void;
}

export interface Display {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  size: { width: number; height: number };
  workAreaSize: { width: number; height: number };
  scaleFactor: number;
  rotation: number;
  touchSupport: 'available' | 'unavailable' | 'unknown';
  internal: boolean;
  monochrome: boolean;
  accelerometerSupport: 'available' | 'unavailable' | 'unknown';
  colorSpace: string;
  colorDepth: number;
  depthPerComponent: number;
  displayFrequency: number;
  nativeOrigin: { x: number; y: number };
  label: string;
}

export interface Source {
  id: string;
  name: string;
  thumbnail: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
