"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    getDisplays: () => electron_1.ipcRenderer.invoke('get-displays'),
    getPrimaryDisplay: () => electron_1.ipcRenderer.invoke('get-primary-display'),
    showMainWindow: () => electron_1.ipcRenderer.send('show-main-window'),
    hideMainWindow: () => electron_1.ipcRenderer.send('hide-main-window'),
    minimizeMainWindow: () => electron_1.ipcRenderer.send('minimize-main-window'),
    closeScreenshotWindow: (imageDataUrl) => electron_1.ipcRenderer.send('close-screenshot-window', imageDataUrl),
    openEditor: (imageDataUrl) => electron_1.ipcRenderer.send('open-editor', imageDataUrl),
    saveImage: (dataUrl) => electron_1.ipcRenderer.send('save-image', dataUrl),
    saveVideo: (buffer, filename) => electron_1.ipcRenderer.send('save-video', buffer, filename),
    showSaveVideoDialog: (defaultName) => electron_1.ipcRenderer.invoke('show-save-video-dialog', defaultName),
    saveVideoToPath: (buffer, filePath) => electron_1.ipcRenderer.send('save-video-to-path', buffer, filePath),
    getSources: () => electron_1.ipcRenderer.invoke('get-sources'),
    onLoadImage: (callback) => {
        electron_1.ipcRenderer.on('load-image', (_event, data) => callback(data));
    },
    onScreenshotCaptured: (callback) => {
        electron_1.ipcRenderer.on('screenshot-captured', (_event, dataUrl) => callback(dataUrl));
    },
    onStartRecording: (callback) => {
        electron_1.ipcRenderer.on('start-recording', callback);
    },
    onToggleRecording: (callback) => {
        const handler = (_event) => callback();
        electron_1.ipcRenderer.on('toggle-recording', handler);
        return () => electron_1.ipcRenderer.removeListener('toggle-recording', handler);
    },
    onForceStopRecording: (callback) => {
        const handler = (_event) => callback();
        electron_1.ipcRenderer.on('force-stop-recording', handler);
        return () => electron_1.ipcRenderer.removeListener('force-stop-recording', handler);
    },
    onPauseRecording: (callback) => {
        const handler = (_event) => callback();
        electron_1.ipcRenderer.on('pause-recording', handler);
        return () => electron_1.ipcRenderer.removeListener('pause-recording', handler);
    },
    onResumeRecording: (callback) => {
        const handler = (_event) => callback();
        electron_1.ipcRenderer.on('resume-recording', handler);
        return () => electron_1.ipcRenderer.removeListener('resume-recording', handler);
    },
    showRecordWindow: () => electron_1.ipcRenderer.send('show-record-window'),
    hideRecordWindow: () => electron_1.ipcRenderer.send('hide-record-window'),
    closeEditorWindow: () => electron_1.ipcRenderer.send('close-editor-window'),
    startAreaScreenshot: () => electron_1.ipcRenderer.send('start-area-screenshot'),
    stopRecording: () => electron_1.ipcRenderer.send('stop-recording'),
    pauseRecording: () => electron_1.ipcRenderer.send('pause-recording-from-ui'),
    resumeRecording: () => electron_1.ipcRenderer.send('resume-recording-from-ui'),
});
