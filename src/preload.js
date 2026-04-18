const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onRiotData: (cb) => ipcRenderer.on("riot-data", (_, data) => cb(data)),
  onRiotStatus: (cb) => ipcRenderer.on("riot-status", (_, data) => cb(data)),
  onClickThrough: (cb) => ipcRenderer.on("click-through", (_, v) => cb(v)),
  onMiniMode: (cb) => ipcRenderer.on("mini-mode", (_, v) => cb(v)),
  onOpacityChanged: (cb) => ipcRenderer.on("opacity-changed", (_, v) => cb(v)),
  onSettingsLoaded: (cb) => ipcRenderer.on("settings-loaded", (_, s) => cb(s)),
  onHotkeySpell: (cb) => ipcRenderer.on("hotkey-spell", (_, d) => cb(d)),
  windowMove: (x, y) => ipcRenderer.send("window-move", { x, y }),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  updateSettings: (partial) => ipcRenderer.invoke("update-settings", partial),
  saveMatch: (match) => ipcRenderer.invoke("save-match", match),
  getHistory: () => ipcRenderer.invoke("get-history"),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  toggleMini: () => ipcRenderer.send("toggle-mini"),
  toggleClickThrough: () => ipcRenderer.send("toggle-click-through"),
  quitApp: () => ipcRenderer.send("quit-app"),
});
