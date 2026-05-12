const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { fork } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'OSS Services Helper',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Basitlik için (production'da güvenliği artırmak gerekebilir)
        },
    });

    // React uygulamasını yükle
    // Dev modda localhost'tan, Prod modda yerel dosyadan
    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    mainWindow.on('closed', () => (mainWindow = null));
}

function startServer() {
    // Sunucu dosyasının yolu
    // Production'da kaynaklar paketlendiği için yol değişebilir, ona göre ayarlıyoruz.
    const serverPath = isDev
        ? path.join(__dirname, '../../server/index.js')
        : path.join(process.resourcesPath, 'server/index.js'); // Paketlenmiş uygulamadaki yol

    // Server'ı ayrı bir process olarak başlat
    serverProcess = fork(serverPath, [], {
        // Environment variables passing if needed
        env: { 
            ...process.env, 
            PORT: 5000, 
            ELECTRON_RUN: true,
            USER_DATA_PATH: app.getPath('userData')
        }
    });

    console.log('Server process started with PID:', serverProcess.pid);
}

app.on('ready', () => {
    startServer();
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});
