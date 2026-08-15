"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function createApi() {
  const listeners = new Map();

  ipcRenderer.on("sandforge-event", (_event, channel, data) => {
    const list = listeners.get(String(channel || ""));
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (e) {
        console.error("[sandforge] event handler", channel, e);
      }
    }
  });

  return {
    isWrapper: true,
    isLoader: true,
    version: "1.0.0",
    environment: "game",
    relaunch: () => ipcRenderer.invoke("sandforge-relaunch"),
    getModsPath: () => ipcRenderer.invoke("sandforge-get-mods-path"),
    getPaths: () => ipcRenderer.invoke("sandforge-get-paths"),
    listMods: () => ipcRenderer.invoke("sandforge-list-mods"),
    getDisabled: () => ipcRenderer.invoke("sandforge-get-disabled"),
    setDisabled: (ids) => ipcRenderer.invoke("sandforge-set-disabled", ids),
    writeFile: (relPath, data) =>
      ipcRenderer.invoke("sandforge-write-file", { relPath, data }),
    patcher: {
      status: () => ipcRenderer.invoke("sandforge-patcher-status"),
    },
    invoke: (channel, ...args) =>
      ipcRenderer.invoke("sandforge-mod-invoke", { channel, args }),
    invokeElectronIPC: (channel, ...args) =>
      ipcRenderer.invoke("sandforge-mod-invoke", { channel, args }),
    handleElectronEvent: (channel, handler) => {
      const ch = String(channel || "");
      if (!listeners.has(ch)) listeners.set(ch, []);
      listeners.get(ch).push(handler);
    },
    on: (channel, handler) => {
      const ch = String(channel || "");
      if (!listeners.has(ch)) listeners.set(ch, []);
      listeners.get(ch).push(handler);
    },
    gameEntrypoints: () => ipcRenderer.invoke("sandforge-game-entrypoints"),
    modConfig: {
      get: (modName) => ipcRenderer.invoke("sandforge-mod-config-get", modName),
      set: (modName, config) =>
        ipcRenderer.invoke("sandforge-mod-config-set", modName, config),
    },
    api: (ns, method, args) =>
      ipcRenderer.invoke("sandforge-api", { ns, method, args: args || [] }),
  };
}

(function expose() {
  try {
    const api = createApi();
    const host = { loader: true, version: api.version };
    function publish(name, value) {
      try {
        window[name] = value;
      } catch (_) {}
      try {
        contextBridge.exposeInMainWorld(name, value);
      } catch (_) {}
    }
    publish("__SF_HOST__", host);
    publish("__SANDFORGE_LOADER__", host);
    publish("sandforge", api);
    publish("sandforgeAPI", api);
  } catch (e) {
    console.error("[sandforge-loader] bridge failed", e);
  }
})();

