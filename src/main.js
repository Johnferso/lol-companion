const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");

// ââ Paths para persistÃªncia ââââââââââââââââââââââââââââââââââââââââ
const userDataPath = app.getPath("userData");
const settingsPath = path.join(userDataPath, "settings.json");
const historyPath = path.join(userDataPath, "match-history.json");

function ensureUserDataDir() {
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch (e) {
    console.error("Erro a carregar settings:", e);
  }
  return getDefaultSettings();
}

function saveSettings(settings) {
  try {
    ensureUserDataDir();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Erro a guardar settings:", e);
    return false;
  }
}

function getDefaultSettings() {
  return {
    theme: "dark",
    opacity: 0.92,
    miniMode: false,
    position: { x: 0, y: 100 },
    size: { width: 420, height: 750 },
    miniSize: { width: 240, height: 180 },
    keybinds: {
      toggleHide: "Ctrl+Shift+H",
      toggleClickThrough: "Ctrl+Shift+T",
      opacityUp: "Ctrl+Shift+Up",
      opacityDown: "Ctrl+Shift+Down",
      toggleMini: "Ctrl+Shift+M",
      // Spell activation hotkeys (F1-F10 â enemy idx 0-4, spell 0-1)
      spell_0_0: "F1",
      spell_0_1: "F2",
      spell_1_0: "F3",
      spell_1_1: "F4",
      spell_2_0: "F5",
      spell_2_1: "F6",
      spell_3_0: "F7",
      spell_3_1: "F8",
      spell_4_0: "F9",
      spell_4_1: "F10",
    },
    soundVolume: 0.5,
    cosmicInsightPerEnemy: [false, false, false, false, false],
    minimizeToTray: true,
  };
}

function loadHistory() {
  try {
    if (fs.existsSync(historyPath)) {
      return JSON.parse(fs.readFileSync(historyPath, "utf8"));
    }
  } catch (e) {
    console.error("Erro a carregar histÃ³rico:", e);
  }
  return [];
}

function saveMatch(match) {
  try {
    ensureUserDataDir();
    const history = loadHistory();
    history.unshift({ ...match, savedAt: new Date().toISOString() });
    // Manter sÃ³ as Ãºltimas 50 partidas
    const trimmed = history.slice(0, 50);
    fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Erro a guardar match:", e);
    return false;
  }
}

// ââ Riot Live Client Data API helper ââââââââââââââââââââââââââââââ
function riotGet(endpoint) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "127.0.0.1",
      port: 2999,
      path: endpoint,
      method: "GET",
      rejectUnauthorized: false,
      timeout: 2000,
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

// ââ State ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
let mainWindow = null;
let tray = null;
let pollInterval = null;
let settings = loadSettings();
let clickThrough = false;
let quittingForReal = false;

// ââ Tray icon (fallback se nÃ£o houver ficheiro de Ã­cone) âââââââââââ
function createTrayIcon() {
  // Cria um Ã­cone simples programaticamente (16x16 pixel art de "C" amarelo)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const yellow = [200, 155, 60, 255];
  const dark = [0, 0, 0, 0];
  // Desenha um "C" simples
  const pattern = [
    "................",
    "................",
    "....XXXXXXXX....",
    "...XXXXXXXXXX...",
    "..XXX........X..",
    "..XX............",
    "..XX............",
    "..XX............",
    "..XX............",
    "..XX............",
    "..XX............",
    "..XXX........X..",
    "...XXXXXXXXXX...",
    "....XXXXXXXX....",
    "................",
    "................",
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const c = pattern[y][x] === "X" ? yellow : dark;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = c[3];
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function setupTray() {
  if (tray) return;
  try {
    const icon = createTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip("LoL Companion Overlay");
    updateTrayMenu();
    tray.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
        updateTrayMenu();
      }
    });
  } catch (e) {
    console.error("Tray nÃ£o pÃ´de ser criado:", e);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const isVisible = mainWindow && mainWindow.isVisible();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? "Esconder overlay" : "Mostrar overlay",
      click: () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else mainWindow.show();
        updateTrayMenu();
      },
    },
    {
      label: settings.miniMode ? "Sair do mini mode" : "Mini mode",
      click: () => toggleMiniMode(),
    },
    { type: "separator" },
    {
      label: "Click-through",
      type: "checkbox",
      checked: clickThrough,
      click: () => toggleClickThrough(),
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        quittingForReal = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

// ââ Janela principal âââââââââââââââââââââââââââââââââââââââââââââââ
function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  // Validar posiÃ§Ã£o (evita janela off-screen se o monitor mudou)
  let x = settings.position.x;
  let y = settings.position.y;
  if (x < 0 || x > sw - 50) x = 0;
  if (y < 0 || y > sh - 50) y = 100;

  const dims = settings.miniMode ? settings.miniSize : settings.size;

  mainWindow = new BrowserWindow({
    width: dims.width,
    height: dims.height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setOpacity(settings.opacity);

  // Save position/size quando muda
  const saveWindowState = () => {
    if (!mainWindow) return;
    const [wx, wy] = mainWindow.getPosition();
    const [ww, wh] = mainWindow.getSize();
    settings.position = { x: wx, y: wy };
    if (settings.miniMode) {
      settings.miniSize = { width: ww, height: wh };
    } else {
      settings.size = { width: ww, height: wh };
    }
    saveSettings(settings);
  };
  mainWindow.on("moved", saveWindowState);
  mainWindow.on("resized", saveWindowState);

  // Interceptar close para minimizar para tray
  mainWindow.on("close", (e) => {
    if (!quittingForReal && settings.minimizeToTray) {
      e.preventDefault();
      mainWindow.hide();
      updateTrayMenu();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Enviar settings iniciais assim que o renderer estiver pronto
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("settings-loaded", settings);
  });
}

// ââ AÃ§Ãµes ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
function toggleClickThrough() {
  if (!mainWindow) return;
  clickThrough = !clickThrough;
  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  mainWindow.webContents.send("click-through", clickThrough);
  updateTrayMenu();
}

function toggleMiniMode() {
  if (!mainWindow) return;
  settings.miniMode = !settings.miniMode;
  saveSettings(settings);
  const dims = settings.miniMode ? settings.miniSize : settings.size;
  mainWindow.setSize(dims.width, dims.height);
  mainWindow.webContents.send("mini-mode", settings.miniMode);
  updateTrayMenu();
}

function adjustOpacity(delta) {
  if (!mainWindow) return;
  const next = Math.max(0.2, Math.min(1, mainWindow.getOpacity() + delta));
  mainWindow.setOpacity(next);
  settings.opacity = next;
  saveSettings(settings);
  mainWindow.webContents.send("opacity-changed", next);
}

// ââ Registo de hotkeys (dinÃ¢mico, reage a settings) ââââââââââââââââ
function registerAllHotkeys() {
  globalShortcut.unregisterAll();
  const kb = settings.keybinds;

  const safeRegister = (accel, cb) => {
    if (!accel) return;
    try {
      globalShortcut.register(accel, cb);
    } catch (e) {
      console.warn(`Hotkey invÃ¡lida: ${accel}`);
    }
  };

  safeRegister(kb.toggleHide, () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
    updateTrayMenu();
  });
  safeRegister(kb.toggleClickThrough, toggleClickThrough);
  safeRegister(kb.opacityUp, () => adjustOpacity(0.1));
  safeRegister(kb.opacityDown, () => adjustOpacity(-0.1));
  safeRegister(kb.toggleMini, toggleMiniMode);

  // Hotkeys de spell activation â enviam evento ao renderer
  for (let i = 0; i < 5; i++) {
    for (let s = 0; s < 2; s++) {
      const key = `spell_${i}_${s}`;
      const accel = kb[key];
      if (!accel) continue;
      safeRegister(accel, () => {
        if (mainWindow) {
          mainWindow.webContents.send("hotkey-spell", {
            enemyIdx: i,
            spellIdx: s,
          });
        }
      });
    }
  }
}

// ââ Polling Riot API âââââââââââââââââââââââââââââââââââââââââââââââ
function startPolling() {
  pollInterval = setInterval(async () => {
    if (!mainWindow) return;
    try {
      const players = await riotGet("/liveclientdata/playerlist");
      const gameData = await riotGet("/liveclientdata/gamestats");
      let events = [];
      try {
        const eventData = await riotGet("/liveclientdata/eventdata");
        events = eventData.Events || [];
      } catch (e) {}
      let activePlayer = null;
      try {
        activePlayer = await riotGet("/liveclientdata/activeplayer");
      } catch (e) {}
      mainWindow.webContents.send("riot-data", {
        players,
        gameData,
        events,
        activePlayer,
      });
    } catch (e) {
      mainWindow.webContents.send("riot-status", { connected: false });
    }
  }, 1500);
}

// ââ App lifecycle ââââââââââââââââââââââââââââââââââââââââââââââââââ
app.whenReady().then(() => {
  createWindow();
  setupTray();
  registerAllHotkeys();
  startPolling();
});

app.on("window-all-closed", () => {
  // No Windows nÃ£o fazemos quit â fica no tray
  if (process.platform !== "darwin" && !settings.minimizeToTray) {
    if (pollInterval) clearInterval(pollInterval);
    globalShortcut.unregisterAll();
    app.quit();
  }
});

app.on("before-quit", () => {
  quittingForReal = true;
});

app.on("will-quit", () => {
  if (pollInterval) clearInterval(pollInterval);
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

// ââ IPC handlers âââââââââââââââââââââââââââââââââââââââââââââââââââ
ipcMain.on("window-move", (event, { x, y }) => {
  if (mainWindow) {
    const [wx, wy] = mainWindow.getPosition();
    mainWindow.setPosition(wx + x, wy + y);
  }
});

ipcMain.handle("get-settings", () => settings);

ipcMain.handle("update-settings", (event, partial) => {
  settings = { ...settings, ...partial };
  saveSettings(settings);
  // Re-registar hotkeys se vieram alteradas
  if (partial.keybinds) registerAllHotkeys();
  return settings;
});

ipcMain.handle("save-match", (event, match) => {
  return saveMatch(match);
});

ipcMain.handle("get-history", () => loadHistory());

ipcMain.handle("clear-history", () => {
  try {
    if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.on("toggle-mini", () => toggleMiniMode());
ipcMain.on("toggle-click-through", () => toggleClickThrough());

ipcMain.on("quit-app", () => {
  quittingForReal = true;
  app.quit();
});
