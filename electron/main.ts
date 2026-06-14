import { app, BrowserWindow, Tray, Menu, globalShortcut, screen, ipcMain, dialog, nativeImage, desktopCapturer, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

function getSaveDir(): string {
  const saveDir = path.join(app.getPath('videos'), 'ScreenRecordings');
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  return saveDir;
}

let mainWindow: BrowserWindow | null = null;
let screenshotWindow: BrowserWindow | null = null;
let editorWindow: BrowserWindow | null = null;
let recordWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingScreenshotData: string | null = null;

const isDev = process.env.NODE_ENV === 'development';
const INDEX_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const DEV_URL = 'http://localhost:5173';

function createTrayIcon() {
  const size = 22;
  const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="4" fill="#0ea5e9"/><rect x="6" y="6" width="${size - 12}" height="${size - 12}" rx="1" fill="none" stroke="#ffffff" stroke-width="1.5"/><circle cx="${size / 2}" cy="${size / 2}" r="2.8" fill="#ffffff"/></svg>`;
  try {
    const img = nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(canvas).toString('base64'));
    if (!img.isEmpty()) return img.resize({ width: size, height: size });
  } catch {}
  return nativeImage.createEmpty();
}

function createMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 380,
    minHeight: 520,
    frame: false,
    transparent: true,
    resizable: true,
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
  } else {
    mainWindow.loadFile(INDEX_PATH);
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createScreenshotWindow(imageDataUrl: string) {
  if (screenshotWindow) {
    screenshotWindow.close();
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;

  screenshotWindow = new BrowserWindow({
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
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const screenshotUrl = isDev
    ? `${DEV_URL}#/screenshot`
    : `file://${INDEX_PATH}#/screenshot`;

  screenshotWindow.loadURL(screenshotUrl);

  screenshotWindow.webContents.on('did-finish-load', () => {
    screenshotWindow?.webContents.send('screenshot-captured', imageDataUrl);
    screenshotWindow?.show();
  });

  screenshotWindow.on('closed', () => {
    screenshotWindow = null;
  });
}

function createEditorWindow(imageDataUrl?: string) {
  if (editorWindow) {
    editorWindow.close();
  }

  editorWindow = new BrowserWindow({
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
    : `file://${INDEX_PATH}#/editor`;

  editorWindow.loadURL(editorUrl);

  if (imageDataUrl) {
    editorWindow.webContents.on('did-finish-load', () => {
      editorWindow?.webContents.send('load-image', imageDataUrl);
    });
  }

  editorWindow.on('closed', () => {
    editorWindow = null;
    createMainWindow();
  });
}

function createRecordWindow() {
  if (recordWindow) {
    recordWindow.focus();
    return;
  }

  recordWindow = new BrowserWindow({
    width: 240,
    height: 56,
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
    : `file://${INDEX_PATH}#/recorder`;

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
  tray = new Tray(icon);
  tray.setToolTip('屏幕截图与录屏工具');

  const contextMenu = Menu.buildFromTemplate([
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
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      createMainWindow();
    }
  });
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    startScreenshot();
  });

  globalShortcut.register('CommandOrControl+Shift+S', () => {
    captureFullScreen();
  });

  globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) {
      mainWindow.webContents.send('toggle-recording');
    }
    createMainWindow();
  });

  globalShortcut.register('Escape', () => {
    if (screenshotWindow) {
      screenshotWindow.close();
      createMainWindow();
    }
  });
}

async function startScreenshot() {
  BrowserWindow.getAllWindows().forEach((w) => {
    try { w.hide(); } catch {}
  });

  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    const primarySource = sources[0];
    if (primarySource) {
      const dataUrl = primarySource.thumbnail.toDataURL();
      createScreenshotWindow(dataUrl);
    } else {
      dialog.showErrorBox('截图失败', '无法捕获屏幕内容');
      createMainWindow();
    }
  } catch (error) {
    console.error('截图失败:', error);
    dialog.showErrorBox('截图失败', '无法捕获屏幕内容');
    createMainWindow();
  }
}

async function captureFullScreen() {
  BrowserWindow.getAllWindows().forEach((w) => {
    try { w.hide(); } catch {}
  });

  await new Promise((resolve) => setTimeout(resolve, 300));

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });

    const primarySource = sources[0];
    if (primarySource) {
      const dataUrl = primarySource.thumbnail.toDataURL();
      createEditorWindow(dataUrl);
    } else {
      dialog.showErrorBox('截图失败', '无法捕获屏幕内容');
      createMainWindow();
    }
  } catch (error) {
    console.error('全屏截图失败:', error);
    dialog.showErrorBox('截图失败', '无法捕获屏幕内容');
    createMainWindow();
  }
}

app.whenReady().then(() => {
  createMainWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays();
});

ipcMain.handle('get-primary-display', () => {
  return screen.getPrimaryDisplay();
});

ipcMain.on('show-main-window', () => {
  createMainWindow();
});

ipcMain.on('hide-main-window', () => {
  mainWindow?.hide();
});

ipcMain.on('minimize-main-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('close-screenshot-window', (_event, imageDataUrl: string | undefined) => {
  if (screenshotWindow) {
    screenshotWindow.close();
  }
  if (imageDataUrl) {
    createEditorWindow(imageDataUrl);
  } else {
    createMainWindow();
  }
});

ipcMain.on('open-editor', (_event, imageDataUrl: string) => {
  createEditorWindow(imageDataUrl);
});

ipcMain.on('save-image', async (_event, dataUrl: string) => {
  const result = await dialog.showSaveDialog({
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

ipcMain.on('save-video', (_event, buffer: ArrayBuffer, filename: string) => {
  const saveDir = getSaveDir();
  const filePath = path.join(saveDir, filename || `recording-${Date.now()}.webm`);
  fs.writeFileSync(filePath, Buffer.from(buffer));

  dialog.showMessageBox({
    type: 'info',
    title: '录制完成',
    message: '视频已保存',
    detail: filePath,
    buttons: ['在访达中显示', '确定'],
    defaultId: 0,
  }).then((result) => {
    if (result.response === 0) {
      shell.showItemInFolder(filePath);
    }
  });
});

ipcMain.handle('get-sources', async () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: primaryDisplay.bounds.width, height: primaryDisplay.bounds.height },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

ipcMain.on('show-record-window', () => {
  createRecordWindow();
});

ipcMain.on('hide-record-window', () => {
  recordWindow?.close();
});

ipcMain.on('start-area-screenshot', () => {
  startScreenshot();
});

ipcMain.on('stop-recording', () => {
  if (mainWindow) {
    mainWindow.webContents.send('force-stop-recording');
  }
  if (recordWindow) {
    recordWindow.close();
  }
  createMainWindow();
});

ipcMain.on('close-editor-window', () => {
  editorWindow?.close();
});
