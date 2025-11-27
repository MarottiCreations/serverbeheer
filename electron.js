const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Workaround potential GPU-related crashes on some macOS configs
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = Number(process.env.PORT) || 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
let creatingWindow = false;

function waitForServer(maxRetries = 50, delayMs = 200) {
  console.log(`[electron] waitForServer: checking ${SERVER_URL} (maxRetries=${maxRetries}, delayMs=${delayMs})`);
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryOnce = () => {
      const req = http.get(SERVER_URL, res => {
        res.resume();
        console.log('[electron] backend reachable');
        resolve(true);
      });
      req.on('error', () => {
        attempts += 1;
        if (attempts >= maxRetries) {
          console.error('[electron] backend not reachable after retries');
          reject(new Error('Server not reachable'));
        } else {
          setTimeout(tryOnce, delayMs);
        }
      });
    };
    tryOnce();
  });
}

async function ensureServerRunning() {
  try {
    // Quick check: if server already responds, don't spawn a new one
    await waitForServer(1, 0);
    return; // already up
  } catch (_) {
    // not running, spawn below
  }

  const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production', PORT: String(SERVER_PORT) };

  let serverScriptPath;
  if (app.isPackaged) {
    serverScriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js');
  } else {
    serverScriptPath = path.join(__dirname, 'server.js');
  }

  if (serverProcess && !serverProcess.killed) {
    console.log('[electron] backend process already running');
    return;
  }

  // Choose a Node runtime:
  // - In dev: prefer npm's node if available
  // - In packaged: reuse Electron's binary but force Node mode
  const nodeBinary = app.isPackaged
    ? process.execPath
    : (process.env.npm_node_execpath || process.execPath);

  const childEnv = { ...env };
  if (nodeBinary === process.execPath) {
    // When using Electron binary, switch it to Node mode
    childEnv.ELECTRON_RUN_AS_NODE = '1';
  }

  console.log(`[electron] spawning backend: ${nodeBinary} ${serverScriptPath}`);
  serverProcess = spawn(nodeBinary, [serverScriptPath], {
    cwd: app.isPackaged ? process.resourcesPath : __dirname,
    env: childEnv,
    stdio: 'inherit'
  });

  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      dialog.showErrorBox('Server gestopt', `Server exited with code ${code}`);
    }
    console.log(`[electron] backend process exited with code ${code}`);
  });

  await waitForServer(50, 200).catch(() => {});
}

function createWindow() {
  if (creatingWindow) return;
  creatingWindow = true;
  console.log('[electron] creating BrowserWindow');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Serverbeheer',
    backgroundColor: '#ffffff',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  console.log('[electron] BrowserWindow constructed');

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[electron] window finished load');
  });

  mainWindow.on('ready-to-show', () => {
    console.log('[electron] window ready-to-show');
    mainWindow.show();
  });

  mainWindow.loadURL(SERVER_URL).catch(() => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Serverbeheer</title><style>body{font-family:-apple-system,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f7f7f7;color:#333} .card{background:#fff;padding:24px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,0.1);max-width:640px} h1{margin:0 0 12px} code{background:#eee;padding:2px 6px;border-radius:6px}</style></head><body><div class="card"><h1>Kan de server niet bereiken</h1><p>De backend op <code>${SERVER_URL}</code> lijkt niet te draaien.</p><ol><li>Wacht enkele seconden; de backend wordt opgestart.</li><li>Of start handmatig in terminal:<br><code>cd ${__dirname}<br/>node server.js</code></li></ol><p>Als het probleem blijft, stuur de foutmelding door.</p></div></body></html>`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  // Keep polling in background until backend comes up, then reload
  (async () => {
    try {
      await waitForServer(300, 300);
      if (mainWindow) {
        mainWindow.loadURL(SERVER_URL);
      }
    } catch (err) {
      // give up quietly
    }
  })();

  mainWindow.on('closed', () => {
    mainWindow = null;
    creatingWindow = false;
  });
}

// Single instance lock early
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

app.whenReady().then(async () => {
  console.log('[electron] app ready');
  await ensureServerRunning();
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
  console.log('[electron] before-quit');
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGINT');
  }
});

app.on('render-process-gone', (event, webContents, details) => {
  console.error('[electron] render-process-gone:', details);
});

app.on('child-process-gone', (event, details) => {
  console.error('[electron] child-process-gone:', details);
});

app.on('gpu-process-crashed', (event, killed) => {
  console.error('[electron] gpu-process-crashed. killed=', killed);
});
