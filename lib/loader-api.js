"use strict";

const fs = require("fs");
const path = require("path");
const { ipcMain, dialog, BrowserWindow, shell, clipboard } = require("electron");
const { EventBus } = require("./events");
const { writeJson, readJson } = require("./config");
const { toBuffer } = require("./safe-io");
const { attachElectronApi, createDispatch, API_VERSION } = require("./api-electron");
const { createBus } = require("./bus");
const { createRegistry } = require("./registry");
const { createResourceTracker } = require("./resources");
const { discoverMods, sortMods } = require("./discover");
const { rebuildRendererPatches, applyPreloadPatches } = require("./hooks");
const { isGameRenderer } = require("./window-kind");
const { wrapGameEntry } = require("./game-inject");
const { assetUrl } = require("./protocol");
const { sfError, CODES } = require("./errors");

const LOADER_VERSION = API_VERSION;

function createLoader(ctx) {
  const events = new EventBus();
  [
    "sf:mod-loaded",
    "sf:mod-unloaded",
    "sf:all-mods-loaded",
    "sf:game-started",
    "sf:game-closed",
    "sf:file-requested",
    "sf:pre-scene-loaded",
    "sf:mod-config-changed",
    "sf:scene-loaded",
    "sf:window-created",
  ].forEach((name) => {
    try {
      events.registerEvent(name);
    } catch (_) {}
  });

  const ipcHandlers = new Map();
  const loadedPlugins = [];
  const patcher = ctx.patcher;
  const resources = createResourceTracker();
  const bus = createBus(sendGameEvent);
  const registry = createRegistry();
  ctx.bus = bus;
  ctx.registry = registry;
  ctx.resources = resources;

  function isInside(root, target) {
    return ctx.isInside(root, target);
  }

  function resolveAllowed(relPath) {
    const rel = String(relPath || "").replace(/\\/g, "/");
    if (!rel || rel.includes("..") || rel.indexOf("\0") !== -1) {
      throw sfError(CODES.PATH_INVALID, "Invalid path");
    }
    let abs;
    if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
      abs = path.resolve(rel);
    } else {
      abs = path.resolve(ctx.paths.localModsRoot, rel);
    }
    const allowed = [ctx.paths.localModsRoot, ctx.paths.sandustryData];
    (ctx.paths.workshopRoots || []).forEach((r) => allowed.push(r));
    for (let i = 0; i < allowed.length; i++) {
      if (isInside(allowed[i], abs)) return abs;
    }
    throw sfError(CODES.PATH_DENIED, "Path outside allowed folders");
  }

  function configPathFor(modId) {
    return path.join(ctx.paths.localModsRoot, "config", String(modId) + ".json");
  }

  function sendGameEvent(channel, data) {
    const ch = String(channel || "");
    if (!ch) return;
    BrowserWindow.getAllWindows().forEach((win) => {
      try {
        if (!win.isDestroyed()) win.webContents.send("sandforge-event", ch, data);
      } catch (_) {}
    });
  }

  function makeModApi(mod) {
    const H = {
      add: (patch) => patcher.add(patch, mod.id),
      set: (patch) => {
        patcher.unpatch(patch.id);
        return patcher.add(patch, mod.id);
      },
      unpatch: (id) => patcher.unpatch(id),
      prefix: (file, find, code, opts) =>
        patcher.add(Object.assign({ file, find, operation: "insertBefore", code }, opts), mod.id),
      postfix: (file, find, code, opts) =>
        patcher.add(Object.assign({ file, find, operation: "insertAfter", code }, opts), mod.id),
      bodyPrefix: (file, find, code, opts) =>
        patcher.add(Object.assign({ file, find, operation: "bodyPrefix", code }, opts), mod.id),
      replace: (file, find, code, opts) =>
        patcher.add(Object.assign({ file, find, operation: "replace", code }, opts), mod.id),
      transpiler: (file, find, code, opts) =>
        patcher.add(Object.assign({ file, find, operation: "replace", code }, opts), mod.id),
      wrap: (file, find, parts, opts) =>
        patcher.add(
          Object.assign(
            { file, find, operation: "wrap", before: parts.before, after: parts.after },
            opts,
          ),
          mod.id,
        ),
      remove: (file, find, opts) =>
        patcher.add(Object.assign({ file, find, operation: "remove" }, opts), mod.id),
      transform: (file, fn, opts) => patcher.addTransform(file, fn, opts, mod.id),
      addPatch: (file, patchObj) => patcher.addNamed(file, patchObj, mod.id),
      setPatch: (file, tag, patchObj) => {
        patcher.unpatch(tag);
        return patcher.addNamed(file, Object.assign({ id: tag }, patchObj), mod.id);
      },
      removePatch: (_file, tag) => patcher.unpatch(tag),
      patchExists: (_file, tag) => patcher.list().some((p) => p.id === tag),
      addMappedPatch: (fileMap, mapFn) => {
        const tag = require("crypto").randomUUID();
        Object.keys(fileMap || {}).forEach((file) => {
          const vars = fileMap[file];
          const args = Array.isArray(vars) ? vars : [vars];
          const result = mapFn(...args);
          if (!result) return;
          const list = Array.isArray(result) ? result : [result];
          list.forEach((p, i) => {
            if (p) patcher.addNamed(file, Object.assign({ id: i === 0 ? tag : tag + ":" + i }, p), mod.id);
          });
        });
        return tag;
      },
      setMappedPatch: (fileMap, tag, mapFn) => {
        Object.keys(fileMap || {}).forEach((file) => {
          const vars = fileMap[file];
          const args = Array.isArray(vars) ? vars : [vars];
          const result = mapFn(...args);
          if (result) patcher.addNamed(file, Object.assign({ id: tag }, result), mod.id);
        });
        return tag;
      },
      read: (file) => patcher.read(file),
      preview: (file, find, n) => patcher.preview(file, find, n),
      dump: (file) => patcher.dump(file),
      list: () => patcher.list().filter((p) => p.modId === mod.id),
      file: (file) => patcher.fluent(file),
      status: () => patcher.status(),
      unseal: () => patcher.unseal(),
      isSealed: () => patcher.isSealed(),
      applyPreload: () => applyPreloadPatches(ctx),
    };

    const api = {
      version: LOADER_VERSION,
      modId: mod.id,
      environment: "electron",
      events,
      patcher: H,
      log(level, a, b) {
        const message = b != null ? b : a;
        const tag = b != null ? a : mod.id;
        console.log("[sandforge:" + tag + "][" + level + "] " + message);
      },
      handleGameIPC(channel, handler) {
        const ch = String(channel);
        ipcHandlers.set(ch, { modId: mod.id, handler });
        resources.trackIpc(mod.id, ch);
      },
      sendGameEvent,
      getModsPath: () => ctx.paths.localModsRoot,
      getGameBasePath: () => ctx.paths.gameRoot,
      getGameAsarPath: () => ctx.paths.gameAsar,
      getGameRoot: () => ctx.paths.gameRoot,
      getTempBasePath: () => ctx.paths.sandustryData,
      getTempExtractedPath: () => ctx.paths.uiDir,
      getUserDataPath: () => ctx.paths.sandustryData,
      getAppPath: () => ctx.paths.loaderDir,
      getInstalledMods: () =>
        ctx.mods.map((m) => ({
          info: m.info,
          path: m.dir,
          isEnabled: m.enabled,
          isLoaded: loadedPlugins.some((p) => p.id === m.id),
          modID: m.id,
        })),
      getLoadedMods: () =>
        loadedPlugins.map((m) => ({
          info: m.info,
          path: m.dir,
          isEnabled: true,
          isLoaded: true,
          modID: m.id,
        })),
      getEnabledMods: () =>
        ctx.mods
          .filter((m) => m.enabled)
          .map((m) => ({
            info: m.info,
            path: m.dir,
            isEnabled: true,
            isLoaded: loadedPlugins.some((p) => p.id === m.id),
            modID: m.id,
          })),
      addPatch: H.addPatch,
      setPatch: H.setPatch,
      removePatch: H.removePatch,
      patchExists: H.patchExists,
      addMappedPatch: H.addMappedPatch,
      setMappedPatch: H.setMappedPatch,
      modConfig: {
        get(modName) {
          const id = modName || mod.id;
          const file = configPathFor(id);
          return readJson(file, {});
        },
        set(modName, config) {
          const id = typeof modName === "string" && config !== undefined ? modName : mod.id;
          const value = config !== undefined ? config : modName;
          writeJson(configPathFor(id), value || {});
          events.trigger("sf:mod-config-changed", { modId: id, config: value });
          return value;
        },
      },
    };
    attachElectronApi(api, ctx, mod);
    api.handle = api.handleGameIPC;
    api.emit = sendGameEvent;
    api.on = (channel, fn) => events.on(channel, fn);
    api.mods.setDisabled = api.mods.disable;
    api.listMods = () => api.mods.list();
    api.getDisabled = () => api.mods.getDisabled();
    api.setDisabled = (ids) => api.mods.disable(ids);
    api.disable = (ids) => api.mods.disable(ids);
    api.ipc = {
      handle: api.handleGameIPC,
      emit: sendGameEvent,
      send: sendGameEvent,
      broadcast: sendGameEvent,
      invoke() {
        throw sfError(
          CODES.IPC_INVOKE,
          "api.ipc.invoke is not request/response. Use api.handle in Electron and api.invoke in the game, or api.emit to broadcast.",
        );
      },
    };
    return api;
  }

  function loadElectronPlugin(mod) {
    if (!mod || !mod.electronEntrypoint) return { ok: false, error: "No electron entry" };
    const entry = path.join(mod.dir, mod.electronEntrypoint);
    try {
      delete require.cache[require.resolve(entry)];
    } catch (_) {}
    try {
      const fn = require(entry);
      const api = makeModApi(mod);
      global.sandforge = api;
      if (typeof fn === "function") fn(api);
      if (!loadedPlugins.some((p) => p.id === mod.id)) loadedPlugins.push(mod);
      events.trigger("sf:mod-loaded", {
        info: mod.info,
        path: mod.dir,
        isEnabled: true,
        isLoaded: true,
        modID: mod.id,
      });
      console.log("[sandforge-loader] electron plugin", mod.id, entry);
      return { ok: true, id: mod.id };
    } catch (e) {
      console.error("[sandforge-loader] plugin failed", mod.id, e);
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function injectGamePlugin(mod) {
    if (!mod || !mod.gameEntrypoint) return { ok: false };
    const file = path.join(mod.dir, mod.gameEntrypoint);
    let code = "";
    try {
      code = fs.readFileSync(file, "utf8");
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
    const script = wrapGameEntry(mod.id, code);
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed() && isGameRenderer(win)) {
        win.webContents.executeJavaScript(script, true).catch(() => {});
      }
    });
    return { ok: true };
  }

  function unloadMod(id) {
    const modId = String(id || "");
    resources.ipcChannels(modId).forEach((ch) => ipcHandlers.delete(ch));
    const disposed = resources.dispose(modId);
    const idx = loadedPlugins.findIndex((p) => p.id === modId);
    if (idx !== -1) loadedPlugins.splice(idx, 1);
    try {
      registry.clear && registry.clear(modId);
    } catch (_) {}
    events.trigger("sf:mod-unloaded", { modID: modId });
    sendGameEvent("sf:mod-unloaded", { id: modId });
    return { ok: true, id: modId, closed: disposed.closed };
  }

  function missingDepends(mod) {
    return (mod.depends || []).filter((id) => !ctx.mods.some((x) => x.id === id && x.enabled));
  }

  function loadElectronPlugins() {
    const enabled = sortMods(ctx.mods.filter((m) => m.enabled && m.electronEntrypoint));
    enabled.forEach((mod) => {
      const missing = missingDepends(mod);
      if (missing.length) {
        console.warn("[sandforge-loader] missing depends for", mod.id, missing.join(", "));
        if (mod.dependsRequired) {
          console.error("[sandforge-loader] skip", mod.id, "(dependsRequired)");
          return;
        }
      }
      loadElectronPlugin(mod);
    });
    events.trigger("sf:all-mods-loaded");
  }

  function gameEntrypoints() {
    return sortMods(ctx.mods.filter((m) => m.enabled && m.gameEntrypoint)).map((m) => ({
        id: m.id,
        file: path.join(m.dir, m.gameEntrypoint),
        url: assetUrl(m.id, m.gameEntrypoint),
      }));
  }

  function workerEntrypoints() {
    const out = [];
    ctx.mods
      .filter((m) => m.enabled)
      .forEach((m) => {
        const files = m.workerFiles || {};
        const both = files.both || (!files.manager && !files.simulation ? m.workerEntrypoint : "");
        if (both) {
          out.push({
            id: m.id,
            file: path.join(m.dir, both),
            source: safeRead(path.join(m.dir, both)),
            targets: ["manager", "simulation"],
          });
        }
        if (files.manager) {
          out.push({
            id: m.id + ":manager",
            file: path.join(m.dir, files.manager),
            source: safeRead(path.join(m.dir, files.manager)),
            targets: ["manager"],
          });
        }
        if (files.simulation) {
          out.push({
            id: m.id + ":simulation",
            file: path.join(m.dir, files.simulation),
            source: safeRead(path.join(m.dir, files.simulation)),
            targets: ["simulation"],
          });
        }
      });
    return out;
  }

  function reloadMod(id) {
    const mod = ctx.mods.find((m) => m.id === String(id || ""));
    if (!mod) return { ok: false, error: "Unknown mod" };
    if (!mod.enabled) return { ok: false, error: "Mod is disabled" };
    unloadMod(mod.id);
    const out = {
      ok: true,
      id: mod.id,
      electron: false,
      game: false,
      anvil: false,
      note: "Worker entrypoints still need F6. Renderer Anvil needs windows.reload() after unseal.",
    };
    if (mod.electronEntrypoint) {
      const loaded = loadElectronPlugin(mod);
      out.electron = !!loaded.ok;
      if (!loaded.ok) out.electronError = loaded.error;
    }
    if (mod.gameEntrypoint) {
      const game = injectGamePlugin(mod);
      out.game = !!game.ok;
      if (!game.ok) out.gameError = game.error;
    }
    ctx.workerGeneration = (ctx.workerGeneration || 0) + 1;
    out.workers = true;
    return out;
  }

  function applyDisabled(ids) {
    const prevOff = new Set(
      (ctx.mods || []).filter((m) => m && !m.enabled).map((m) => String(m.id)),
    );
    const list = ctx.setDisabledIds(ids);
    const off = new Set(list.map(String));
    (ctx.mods || []).forEach((m) => {
      if (m && m.id) m.enabled = !off.has(String(m.id));
    });
    (ctx.mods || []).forEach((m) => {
      if (!m || !m.id) return;
      const id = String(m.id);
      if (off.has(id) && !prevOff.has(id)) {
        unloadMod(id);
        const was = patcher.isSealed();
        if (was) patcher.unseal();
        try {
          patcher.removeByMod(id);
        } catch (_) {}
        if (was) patcher.seal();
      } else if (!off.has(id) && prevOff.has(id)) {
        loadElectronPlugin(m);
        injectGamePlugin(m);
      }
    });
    let rebuilt = { ok: false };
    try {
      rebuilt = rebuildRendererPatches(ctx);
    } catch (e) {
      rebuilt = { ok: false, error: String(e && e.message ? e.message : e) };
    }
    try {
      applyPreloadPatches(ctx);
    } catch (_) {}
    const disabled = [...off];
    BrowserWindow.getAllWindows().forEach((win) => {
      if (win.isDestroyed()) return;
      win.webContents
        .executeJavaScript(
          "window.__SF_DISABLED__=" +
            JSON.stringify(disabled) +
            ";try{window.dispatchEvent(new CustomEvent('sf-disabled',{detail:window.__SF_DISABLED__}));}catch(e){}",
          true,
        )
        .catch(() => {});
      if (!isGameRenderer(win)) return;
      try {
        win.reload();
      } catch (_) {}
    });
    ctx.workerGeneration = (ctx.workerGeneration || 0) + 1;
    sendGameEvent("sf:mods-disabled", { ids: list });
    return { ok: true, ids: list, rebuilt };
  }

  function refreshWorkshopMods() {
    try {
      const fresh = discoverMods(ctx.paths, ctx.getDisabledIds());
      ctx.mods.splice(0, ctx.mods.length, ...fresh);
      return { ok: true, mods: ctx.mods.length };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function invokeIpc(channel, args) {
    const row = ipcHandlers.get(String(channel || ""));
    if (!row || typeof row.handler !== "function") throw sfError(CODES.NO_HANDLER, "No handler");
    return row.handler(...(args || []));
  }

  ctx.reloadMod = reloadMod;
  ctx.unloadMod = unloadMod;
  ctx.applyDisabled = applyDisabled;
  ctx.refreshWorkshopMods = refreshWorkshopMods;
  ctx.loadElectronPlugin = loadElectronPlugin;
  ctx.injectGamePlugin = injectGamePlugin;
  ctx.invokeIpc = invokeIpc;
  ctx.applyPreloadPatches = () => applyPreloadPatches(ctx);
  ctx.workerGeneration = ctx.workerGeneration || 0;
  ctx.workerEntrypoints = workerEntrypoints;

  function pathToFileUrl(p) {
    let s = String(p || "").replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(s)) return "file:///" + encodeURI(s);
    if (s.charAt(0) === "/") return "file://" + encodeURI(s);
    return "";
  }

  function safeRead(file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (_) {
      return "";
    }
  }

  function installIpc() {
    ipcMain.handle("sandforge-loader-version", () => LOADER_VERSION);
    ipcMain.handle("sandforge-is-wrapper", () => true);
    ipcMain.handle("sandforge-is-loader", () => true);
    ipcMain.handle("sandforge-relaunch", () => {
      const { app } = require("electron");
      app.relaunch();
      app.quit();
      return { ok: true };
    });
    ipcMain.handle("sandforge-get-mods-path", () => ctx.paths.localModsRoot);
    ipcMain.handle("sandforge-get-paths", () => ({
      localMods: ctx.paths.localModsRoot,
      gameRoot: ctx.paths.gameRoot,
      workshopRoots: ctx.paths.workshopRoots,
      loader: ctx.paths.loaderDir,
    }));
    ipcMain.handle("sandforge-list-mods", () =>
      ctx.mods.map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        author: m.author,
        source: m.source,
        workshopId: m.workshopId,
        enabled: m.enabled,
        dir: m.dir,
        electronEntrypoint: !!m.electronEntrypoint,
        gameEntrypoint: !!m.gameEntrypoint,
        workerEntrypoint: !!m.workerEntrypoint,
      })),
    );
    ipcMain.handle("sandforge-get-disabled", () => ({
      ok: true,
      ids: ctx.getDisabledIds(),
    }));
    ipcMain.handle("sandforge-set-disabled", (_e, ids) => applyDisabled(ids));
    ipcMain.handle("sandforge-patcher-status", () => patcher.status());
    ipcMain.handle("sandforge-game-entrypoints", () => gameEntrypoints());
    ipcMain.handle("sandforge-mod-config-get", (_e, modName) => {
      const file = path.join(ctx.paths.localModsRoot, "config", String(modName) + ".json");
      return readJson(file, {});
    });
    ipcMain.handle("sandforge-mod-config-set", (_e, modName, config) => {
      const file = path.join(ctx.paths.localModsRoot, "config", String(modName) + ".json");
      writeJson(file, config || {});
      events.trigger("sf:mod-config-changed", { modId: modName, config });
      return config;
    });
    ipcMain.handle("sandforge-mod-invoke", async (_event, payload) => {
      const channel = payload && payload.channel;
      const row = ipcHandlers.get(String(channel || ""));
      if (!row || typeof row.handler !== "function") return { ok: false, error: "No handler" };
      const args = (payload && payload.args) || [];
      return row.handler(...args);
    });
    ipcMain.handle("sandforge-write-file", async (_event, payload) => {
      try {
        const dest = resolveAllowed((payload && payload.relPath) || "");
        const data = payload && payload.data;
        if (data == null) return { ok: false, error: "Missing data" };
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, toBuffer(data));
        return { ok: true, path: dest };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    });
    ipcMain.handle("sandforge-fs-read-text", (_e, rel) => {
      return fs.readFileSync(resolveAllowed(rel), "utf8");
    });
    ipcMain.handle("sandforge-fs-write", (_e, payload) => {
      const dest = resolveAllowed((payload && payload.relPath) || payload.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, String((payload && payload.data) || ""), "utf8");
      return { ok: true, path: dest };
    });
    ipcMain.handle("sandforge-dialog-open", async (event, opts) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      return dialog.showOpenDialog(parent || undefined, opts || {});
    });
    ipcMain.handle("sandforge-shell-open-path", async (_e, target) => {
      return shell.openPath(String(target || ""));
    });
    ipcMain.handle("sandforge-clipboard-read", () => clipboard.readText());
    ipcMain.handle("sandforge-clipboard-write", (_e, text) => {
      clipboard.writeText(String(text || ""));
      return { ok: true };
    });
    const { dispatch } = createDispatch(ctx, {
      makeModApi,
      reloadMod,
      unloadMod,
      applyDisabled,
      invokeIpc,
      refreshWorkshopMods,
    });
    ctx.dispatch = dispatch;
    ipcMain.handle("sandforge-api", async (_event, payload) => {
      const ns = payload && payload.ns;
      const method = payload && payload.method;
      const args = (payload && payload.args) || [];
      return dispatch(ns, method, args);
    });
  }

  return {
    events,
    version: LOADER_VERSION,
    loadElectronPlugins,
    installIpc,
    sendGameEvent,
    gameEntrypoints,
    workerEntrypoints,
    makeModApi,
    reloadMod,
    unloadMod,
    applyDisabled,
  };
}

module.exports = { createLoader, LOADER_VERSION };
