"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let mainWindow = null;
let screenshotWindow = null;
let editorWindow = null;
let recordWindow = null;
let tray = null;
const isDev = process.env.NODE_ENV === 'development';
const INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const DEV_URL = 'http://localhost:5173';
function createTrayIcon() {
    const size = 22;
    const img = electron_1.nativeImage.createEmpty();
    const canvas = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="3" fill="#0ea5e9" stroke="#fff" stroke-width="1"/>
      <rect x="5" y="5" width="${size - 10}" height="${size - 10}" rx="1" fill="none" stroke="#fff" stroke-width="1.5"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="3" fill="#fff"/>
    </svg>`;
    const pngData = Buffer.from(canvas.replace(/[\s\n]/g, ''));
    try {
        return electron_1.nativeImage.createFromBuffer(pngData);
    }
    catch {
        return img.resize({ width: size, height: size });
    }
}
function createMainWindow() {
    if (mainWindow) {
        if (mainWindow.isMinimized())
            mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        return;
    }
    mainWindow = new electron_1.BrowserWindow({
        width: 320,
        height: 460,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        hasShadow: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    if (isDev) {
        mainWindow.loadURL(DEV_URL);
    }
    else {
        mainWindow.loadFile(INDEX_PATH);
    }
    mainWindow.on('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function createScreenshotWindow() {
    if (screenshotWindow) {
        screenshotWindow.focus();
        return;
    }
    const primaryDisplay = electron_1.screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;
    screenshotWindow = new electron_1.BrowserWindow({
        width,
        height,
        x: primaryDisplay.bounds.x,
        y: primaryDisplay.bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: false,
        fullscreen: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    const screenshotUrl = isDev
        ? `${DEV_URL}#/screenshot`
        : `file://${path.join(__dirname, '..', 'dist', 'index.html')}#/screenshot`;
    screenshotWindow.loadURL(screenshotUrl);
    screenshotWindow.on('closed', () => {
        screenshotWindow = null;
    });
}
function createEditorWindow(imageDataUrl) {
    if (editorWindow) {
        editorWindow.close();
    }
    editorWindow = new electron_1.BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 600,
        minHeight: 500,
        frame: true,
        title: '图像编辑器',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    const editorUrl = isDev
        ? `${DEV_URL}#/editor`
        : `file://${path.join(__dirname, '..', 'dist', 'index.html')}#/editor`;
    editorWindow.loadURL(editorUrl);
    if (imageDataUrl) {
        editorWindow.webContents.on('did-finish-load', () => {
            editorWindow?.webContents.send('load-image', imageDataUrl);
        });
    }
    editorWindow.on('closed', () => {
        editorWindow = null;
    });
}
function createRecordWindow() {
    if (recordWindow) {
        recordWindow.focus();
        return;
    }
    recordWindow = new electron_1.BrowserWindow({
        width: 220,
        height: 50,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    const recordUrl = isDev
        ? `${DEV_URL}#/recorder`
        : `file://${path.join(__dirname, '..', 'dist', 'index.html')}#/recorder`;
    recordWindow.loadURL(recordUrl);
    recordWindow.on('ready-to-show', () => {
        recordWindow?.show();
    });
    recordWindow.on('closed', () => {
        recordWindow = null;
    });
}
function createTray() {
    const icon = createTrayIcon();
    tray = new electron_1.Tray(icon);
    tray.setToolTip('屏幕截图与录屏工具');
    const contextMenu = electron_1.Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => {
                createMainWindow();
            },
        },
        { type: 'separator' },
        {
            label: '区域截图 (Ctrl+Shift+A)',
            click: () => {
                startScreenshot();
            },
        },
        {
            label: '全屏截图 (Ctrl+Shift+S)',
            click: () => {
                captureFullScreen();
            },
        },
        { type: 'separator' },
        {
            label: '开始录屏 (Ctrl+Shift+R)',
            click: () => {
                createMainWindow();
                if (mainWindow) {
                    mainWindow.webContents.send('toggle-recording');
                }
            },
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => {
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (mainWindow?.isVisible()) {
            mainWindow.hide();
        }
        else {
            createMainWindow();
        }
    });
}
function registerShortcuts() {
    electron_1.globalShortcut.register('CommandOrControl+Shift+A', () => {
        startScreenshot();
    });
    electron_1.globalShortcut.register('CommandOrControl+Shift+S', () => {
        captureFullScreen();
    });
    electron_1.globalShortcut.register('CommandOrControl+Shift+R', () => {
        if (mainWindow) {
            mainWindow.webContents.send('toggle-recording');
        }
        createMainWindow();
    });
    electron_1.globalShortcut.register('Escape', () => {
        if (screenshotWindow) {
            screenshotWindow.close();
        }
    });
}
function startScreenshot() {
    if (mainWindow) {
        mainWindow.hide();
    }
    setTimeout(() => {
        createScreenshotWindow();
    }, 300);
}
async function captureFullScreen() {
    if (mainWindow) {
        mainWindow.hide();
    }
    setTimeout(async () => {
        try {
            const primaryDisplay = electron_1.screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.bounds;
            const sources = await electron_1.desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width, height },
            });
            const primarySource = sources[0];
            if (primarySource) {
                const image = primarySource.thumbnail;
                const dataUrl = image.toDataURL();
                createEditorWindow(dataUrl);
            }
        }
        catch (error) {
            console.error('全屏截图失败:', error);
            electron_1.dialog.showErrorBox('截图失败', '无法捕获屏幕内容');
        }
    }, 300);
}
electron_1.app.whenReady().then(() => {
    createMainWindow();
    createTray();
    registerShortcuts();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});
electron_1.app.on('window-all-closed', (e) => {
    e.preventDefault();
});
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
});
electron_1.ipcMain.handle('get-displays', () => {
    return electron_1.screen.getAllDisplays();
});
electron_1.ipcMain.handle('get-primary-display', () => {
    return electron_1.screen.getPrimaryDisplay();
});
electron_1.ipcMain.on('show-main-window', () => {
    createMainWindow();
});
electron_1.ipcMain.on('hide-main-window', () => {
    mainWindow?.hide();
});
electron_1.ipcMain.on('minimize-main-window', () => {
    mainWindow?.minimize();
});
electron_1.ipcMain.on('close-screenshot-window', (_event, imageDataUrl) => {
    if (screenshotWindow) {
        screenshotWindow.close();
    }
    if (imageDataUrl) {
        createEditorWindow(imageDataUrl);
    }
    createMainWindow();
});
electron_1.ipcMain.on('open-editor', (_event, imageDataUrl) => {
    createEditorWindow(imageDataUrl);
});
electron_1.ipcMain.on('save-image', async (_event, dataUrl) => {
    const result = await electron_1.dialog.showSaveDialog({
        title: '保存图片',
        defaultPath: `screenshot-${Date.now()}.png`,
        filters: [
            { name: 'PNG 图片', extensions: ['png'] },
            { name: 'JPEG 图片', extensions: ['jpg'] },
        ],
    });
    if (!result.canceled && result.filePath) {
        const data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(result.filePath, data, 'base64');
    }
});
electron_1.ipcMain.on('save-video', async (_event, buffer, filename) => {
    const result = await electron_1.dialog.showSaveDialog({
        title: '保存视频',
        defaultPath: filename || `recording-${Date.now()}.webm`,
        filters: [{ name: 'WebM 视频', extensions: ['webm'] }],
    });
    if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, Buffer.from(buffer));
    }
});
electron_1.ipcMain.handle('get-sources', async () => {
    const sources = await electron_1.desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 240 },
    });
    return sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
    }));
});
electron_1.ipcMain.on('show-record-window', () => {
    createRecordWindow();
});
electron_1.ipcMain.on('hide-record-window', () => {
    recordWindow?.close();
});
electron_1.ipcMain.on('close-editor-window', () => {
    editorWindow?.close();
});
