import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getPrimaryDisplay: () => ipcRenderer.invoke('get-primary-display'),
  showMainWindow: () => ipcRenderer.send('show-main-window'),
  hideMainWindow: () => ipcRenderer.send('hide-main-window'),
  minimizeMainWindow: () => ipcRenderer.send('minimize-main-window'),
  closeScreenshotWindow: (imageDataUrl?: string) =>
    ipcRenderer.send('close-screenshot-window', imageDataUrl),
  openEditor: (imageDataUrl: string) => ipcRenderer.send('open-editor', imageDataUrl),
  saveImage: (dataUrl: string) => ipcRenderer.send('save-image', dataUrl),
  saveVideo: (buffer: ArrayBuffer, filename: string) =>
    ipcRenderer.send('save-video', buffer, filename),
  getSources: () => ipcRenderer.invoke('get-sources'),
  onLoadImage: (callback: (data: string) => void) => {
    ipcRenderer.on('load-image', (_event, data) => callback(data));
  },
  onScreenshotCaptured: (callback: (dataUrl: string) => void) => {
    ipcRenderer.on('screenshot-captured', (_event, dataUrl) => callback(dataUrl));
  },
  onStartRecording: (callback: () => void) => {
    ipcRenderer.on('start-recording', callback);
  },
  onToggleRecording: (callback: () => void) => {
    const handler = (_event: unknown) => callback();
    ipcRenderer.on('toggle-recording', handler);
    return () => ipcRenderer.removeListener('toggle-recording', handler);
  },
  onForceStopRecording: (callback: () => void) => {
    const handler = (_event: unknown) => callback();
    ipcRenderer.on('force-stop-recording', handler);
    return () => ipcRenderer.removeListener('force-stop-recording', handler);
  },
  showRecordWindow: () => ipcRenderer.send('show-record-window'),
  hideRecordWindow: () => ipcRenderer.send('hide-record-window'),
  closeEditorWindow: () => ipcRenderer.send('close-editor-window'),
  startAreaScreenshot: () => ipcRenderer.send('start-area-screenshot'),
  stopRecording: () => ipcRenderer.send('stop-recording'),
});
