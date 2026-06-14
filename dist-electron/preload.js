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
    getSources: () => electron_1.ipcRenderer.invoke('get-sources'),
    onLoadImage: (callback) => {
        electron_1.ipcRenderer.on('load-image', (_event, data) => callback(data));
    },
    onStartRecording: (callback) => {
        electron_1.ipcRenderer.on('start-recording', callback);
    },
    onToggleRecording: (callback) => {
        electron_1.ipcRenderer.on('toggle-recording', callback);
    },
    showRecordWindow: () => electron_1.ipcRenderer.send('show-record-window'),
    hideRecordWindow: () => electron_1.ipcRenderer.send('hide-record-window'),
    closeEditorWindow: () => electron_1.ipcRenderer.send('close-editor-window'),
    startAreaScreenshot: () => electron_1.ipcRenderer.send('start-area-screenshot'),
});
