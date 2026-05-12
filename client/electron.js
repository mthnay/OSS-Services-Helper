const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

// isPackaged kontrolü daha güvenilirdir
const isDev = !app.isPackaged;

let mainWindow;
let serverProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        title: 'OSS Services Helper',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false // Yerel dosyalara erişim için gerekebilir
        },
    });

    // React uygulamasını yükle
    // Dev modda localhost'tan, Prod modda dist/index.html'den
    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, 'dist', 'index.html')}`;

    console.log('Loading URL:', startUrl);

    mainWindow.loadURL(startUrl).catch(err => {
        console.error('Failed to load URL:', err);
    });

    // Sayfa yüklenemezse (Beyaz ekran durumunda hata mesajı ver)
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Page failed to load:', errorCode, errorDescription);
        if (!isDev) {
            // Hata detaylarını gösteren küçük bir alert veya devtools açılabilir
            // mainWindow.webContents.openDevTools();
        }
    });

    mainWindow.on('closed', () => (mainWindow = null));
}

function startServer() {
    let serverPath;

    if (isDev) {
        serverPath = path.join(__dirname, '../server/index.js');
    } else {
        // ASAR paketi içindeyken process.resourcesPath app.asar'ın yanındaki Resources klasörüdür
        serverPath = path.join(process.resourcesPath, 'server', 'index.js');
    }

    const logPath = path.join(app.getPath('userData'), 'server.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    console.log('Server Path:', serverPath);
    logStream.write(`\n--- Server starting at ${new Date().toISOString()} ---\n`);
    logStream.write(`Server Path: ${serverPath}\n`);

    if (!fs.existsSync(serverPath)) {
        const errorMsg = 'SERVER FILE NOT FOUND at ' + serverPath;
        console.error(errorMsg);
        logStream.write(errorMsg + '\n');
        return;
    }

    try {
        serverProcess = fork(serverPath, [], {
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            env: {
                ...process.env,
                PORT: 5000,
                ELECTRON_RUN: true,
                USER_DATA_PATH: app.getPath('userData')
            }
        });

        serverProcess.stdout.on('data', (data) => {
            logStream.write(data);
            if (isDev) console.log(`Server: ${data}`);
        });

        serverProcess.stderr.on('data', (data) => {
            logStream.write(`ERROR: ${data}`);
            if (isDev) console.error(`Server Error: ${data}`);
        });

        serverProcess.on('error', (err) => {
            logStream.write(`Process Error: ${err.message}\n`);
        });

        serverProcess.on('exit', (code) => {
            logStream.write(`Server process exited with code ${code}\n`);
        });

        console.log('Server process started with PID:', serverProcess.pid);
    } catch (err) {
        logStream.write(`Failed to fork server: ${err.message}\n`);
    }
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
        try {
            serverProcess.kill();
        } catch (e) {
            console.error('Error killing server process:', e);
        }
    }
});
