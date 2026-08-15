"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  app,
  dialog,
  BrowserWindow,
  shell,
  clipboard,
  nativeImage,
  Notification,
  screen,
  globalShortcut,
  Tray,
  Menu,
} = require("electron");
const { createFs, pathToFileUrl, resolveAllowed, isInside } = require("./safe-io");
const { writeJson, readJson } = require("./config");
const { httpGet, httpPost, request: httpRequest, download } = require("./http-safe");
const { connect: wsConnect } = require("./ws-safe");
const { assetUrl } = require("./protocol");
const { sfError, CODES } = require("./errors");

const API_VERSION = "1.0.0";

function winList() {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
}

function pickWin(id) {
  if (id == null) return winList()[0] || null;
  return winList().find((w) => w.id === Number(id) || w.id === id) || null;
}

function resolveModHtml(mod, rel) {
  const clean = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!clean || clean.includes("..") || clean.indexOf("\0") !== -1) {
    throw new Error("Invalid window file");
  }
  if (!/\.html?$/i.test(clean)) {
    throw new Error("windows.create only loads .html from the mod folder");
  }
  const abs = path.resolve(mod.dir, clean);
  if (!isInside(mod.dir, abs)) throw new Error("Path outside mod folder");
  if (!fs.existsSync(abs)) throw new Error("Missing " + clean);
  return abs;
}

function createModWindow(mod, opts, ctx) {
  const file = resolveModHtml(mod, opts.file || opts.html || opts.path);
  let parent = null;
  if (opts.parent === false) parent = null;
  else if (opts.parent === true || opts.parent == null) parent = pickWin();
  else parent = pickWin(opts.parent);

  let x;
  let y;
  if (opts.display != null) {
    const displays = screen.getAllDisplays();
    const d =
      displays.find((row) => row.id === opts.display) ||
      displays[Number(opts.display)] ||
      screen.getPrimaryDisplay();
    const wa = d.workArea;
    const width = Number(opts.width) || 640;
    const height = Number(opts.height) || 480;
    x = wa.x + Math.max(0, ((wa.width - width) / 2) | 0);
    y = wa.y + Math.max(0, ((wa.height - height) / 2) | 0);
  }

  const win = new BrowserWindow({
    width: Number(opts.width) || 640,
    height: Number(opts.height) || 480,
    title: String(opts.title || mod.name || "SandForge"),
    backgroundColor: opts.backgroundColor || "#000000",
    parent: parent || undefined,
    alwaysOnTop: !!opts.alwaysOnTop,
    autoHideMenuBar: opts.autoHideMenuBar !== false,
    minimizable: opts.minimizable !== false,
    maximizable: !!opts.maximizable,
    fullscreenable: !!opts.fullscreenable,
    resizable: opts.resizable !== false,
    x,
    y,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload:
        ctx && ctx.paths && ctx.paths.loaderDir
          ? path.join(ctx.paths.loaderDir, "preload-chain.js")
          : undefined,
    },
  });
  win.__SF_POPOUT__ = true;
  win.__SF_POPOUT_MOD__ = mod.id;
  win.__SF_INJECT_GAME__ = !!opts.injectGame;
  if (opts.alwaysOnTop) win.setAlwaysOnTop(true, "floating");
  win.setMenuBarVisibility(false);
  if (ctx && ctx.resources) ctx.resources.trackWindow(mod.id, win);
  const rel = path.relative(mod.dir, file).replace(/\\/g, "/");
  try {
    win.loadURL(assetUrl(mod.id, rel));
  } catch (e) {
    win.loadFile(file);
  }
  return { ok: true, id: win.id };
}

function utilLib() {
  return {
    join: (...parts) => path.join(...parts),
    basename: (p) => path.basename(p),
    dirname: (p) => path.dirname(p),
    extname: (p) => path.extname(p),
    fileUrl: pathToFileUrl,
    assetUrl,
    clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    },
    lerp(a, b, t) {
      return a + (b - a) * t;
    },
    deepClone(v) {
      return JSON.parse(JSON.stringify(v));
    },
    deepMerge(a, b) {
      const out = Object.assign({}, a || {});
      Object.keys(b || {}).forEach((k) => {
        if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
          out[k] = utilLib().deepMerge(out[k], b[k]);
        } else {
          out[k] = b[k];
        }
      });
      return out;
    },
    pick(obj, keys) {
      const out = {};
      (keys || []).forEach((k) => {
        if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
      });
      return out;
    },
    omit(obj, keys) {
      const skip = new Set(keys || []);
      const out = {};
      Object.keys(obj || {}).forEach((k) => {
        if (!skip.has(k)) out[k] = obj[k];
      });
      return out;
    },
    debounce(fn, ms) {
      let t;
      return function () {
        const args = arguments;
        const ctx = this;
        clearTimeout(t);
        t = setTimeout(function () {
          fn.apply(ctx, args);
        }, ms);
      };
    },
    throttle(fn, ms) {
      let last = 0;
      let t;
      return function () {
        const now = Date.now();
        const args = arguments;
        const ctx = this;
        const remain = ms - (now - last);
        if (remain <= 0) {
          last = now;
          fn.apply(ctx, args);
        } else {
          clearTimeout(t);
          t = setTimeout(function () {
            last = Date.now();
            fn.apply(ctx, args);
          }, remain);
        }
      };
    },
    uid: () => crypto.randomUUID(),
    base64Encode: (text) => Buffer.from(String(text ?? ""), "utf8").toString("base64"),
    base64Decode: (b64) => Buffer.from(String(b64 || ""), "base64").toString("utf8"),
    parseJson(text, fallback) {
      try {
        return JSON.parse(text);
      } catch (_) {
        return fallback;
      }
    },
    semverCompare(a, b) {
      const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
      const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) < (pb[i] || 0)) return -1;
        if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      }
      return 0;
    },
    hexToRgb(hex) {
      const h = String(hex || "").replace("#", "");
      const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    rgbToHex(r, g, b) {
      return (
        "#" +
        [r, g, b]
          .map((n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0"))
          .join("")
      );
    },
    rng(seed) {
      let s = Number(seed) || Date.now();
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    },
  };
}

function loadFreshMods(ctx) {
  const before = new Set((ctx.mods || []).map((m) => m.id));
  if (typeof ctx.refreshWorkshopMods === "function") ctx.refreshWorkshopMods();
  const added = [];
  (ctx.mods || []).forEach((m) => {
    if (!m || !m.enabled || before.has(m.id)) return;
    added.push(m.id);
    if (typeof ctx.loadElectronPlugin === "function") ctx.loadElectronPlugin(m);
    if (typeof ctx.injectGamePlugin === "function") ctx.injectGamePlugin(m);
  });
  ctx.workerGeneration = (ctx.workerGeneration || 0) + 1;
  return { ok: true, added };
}

function attachElectronApi(api, ctx, mod) {
  const io = createFs(ctx.paths);
  const storeDir = path.join(ctx.paths.sandustryData, "mod-store");

  api.apiVersion = API_VERSION;
  api.apiLevel = 1;
  api.mod = {
    id: mod.id,
    name: mod.name,
    version: mod.version,
    author: mod.author,
    dir: mod.dir,
    source: mod.source,
    workshopId: mod.workshopId,
    info: mod.info,
    fileUrl(rel) {
      return pathToFileUrl(path.join(mod.dir, String(rel || "").replace(/^[/\\]+/, "")));
    },
    read(rel) {
      return io.readText(path.join(mod.dir, rel));
    },
    readJson(rel, fallback) {
      return io.readJson(path.join(mod.dir, rel), fallback);
    },
    write(rel, data) {
      return io.write(path.join(mod.dir, rel), data);
    },
    list(rel) {
      return io.list(rel ? path.join(mod.dir, rel) : mod.dir);
    },
  };

  api.app = {
    version: API_VERSION,
    loaderVersion: API_VERSION,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    pid: process.pid,
    relaunch() {
      app.relaunch();
      app.quit();
    },
    quit() {
      app.quit();
    },
    isPackaged: app.isPackaged,
    getLocale: () => app.getLocale(),
    whenReady: () => app.whenReady(),
  };

  api.paths = {
    loader: ctx.paths.loaderDir,
    game: ctx.paths.gameRoot,
    asar: ctx.paths.gameAsar,
    ui: ctx.paths.uiDir,
    mods: ctx.paths.localModsRoot,
    data: ctx.paths.sandustryData,
    workshop: ctx.paths.workshopRoots,
    saves: path.join(ctx.paths.sandustryData, "saves"),
    maps: path.join(ctx.paths.sandustryData, "custom_maps"),
    meta: path.join(ctx.paths.sandustryData, "meta"),
    store: storeDir,
    steamAppId: ctx.paths.steamAppId,
    get: () => ({
      loader: ctx.paths.loaderDir,
      game: ctx.paths.gameRoot,
      asar: ctx.paths.gameAsar,
      ui: ctx.paths.uiDir,
      mods: ctx.paths.localModsRoot,
      data: ctx.paths.sandustryData,
      workshop: ctx.paths.workshopRoots,
      steamAppId: ctx.paths.steamAppId,
    }),
  };

  api.fs = io;

  api.store = {
    get(key, fallback) {
      const file = path.join(storeDir, mod.id + ".json");
      const data = readJson(file, {});
      if (key == null) return data;
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
    },
    set(key, value) {
      const file = path.join(storeDir, mod.id + ".json");
      const data = readJson(file, {});
      if (key && typeof key === "object" && value === undefined) {
        writeJson(file, key);
        return key;
      }
      data[key] = value;
      writeJson(file, data);
      return value;
    },
    remove(key) {
      const file = path.join(storeDir, mod.id + ".json");
      const data = readJson(file, {});
      delete data[key];
      writeJson(file, data);
    },
    clear() {
      writeJson(path.join(storeDir, mod.id + ".json"), {});
    },
  };

  api.mods = {
    list: () =>
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
    get: (id) => ctx.mods.find((m) => m.id === id) || null,
    enabled: () => ctx.mods.filter((m) => m.enabled),
    disable: (ids) =>
      ctx.applyDisabled ? ctx.applyDisabled(ids) : ctx.setDisabledIds(ids),
    unload: (id) => (ctx.unloadMod ? ctx.unloadMod(id || mod.id) : { ok: false }),
    getDisabled: () => ctx.getDisabledIds(),
    assetUrl(modId, rel) {
      return assetUrl(modId || mod.id, rel);
    },
    fileUrl(modId, rel) {
      const m = ctx.mods.find((x) => x.id === (modId || mod.id));
      if (!m) return "";
      return pathToFileUrl(path.join(m.dir, String(rel || "").replace(/^[/\\]+/, "")));
    },
    read(modId, rel) {
      const m = ctx.mods.find((x) => x.id === modId);
      if (!m) throw sfError(CODES.UNKNOWN_MOD, "Unknown mod " + modId);
      return io.readText(path.join(m.dir, rel));
    },
    reload(id) {
      if (typeof ctx.reloadMod === "function") return ctx.reloadMod(id || mod.id);
      throw sfError(CODES.RELOAD, "reload unavailable");
    },
    missingDeps() {
      return ctx.mods
        .filter((m) => m.enabled)
        .map((m) => {
          const need = m.depends || [];
          const missing = need.filter((id) => !ctx.mods.some((x) => x.id === id && x.enabled));
          return { id: m.id, missing };
        })
        .filter((row) => row.missing.length);
    },
  };

  api.windows = {
    list() {
      return winList().map((w) => ({
        id: w.id,
        title: w.getTitle(),
        url: w.webContents.getURL(),
        visible: w.isVisible(),
        bounds: w.getBounds(),
      }));
    },
    get: (id) => pickWin(id),
    current: () => pickWin(),
    show(id) {
      const w = pickWin(id);
      if (w) w.show();
    },
    hide(id) {
      const w = pickWin(id);
      if (w) w.hide();
    },
    focus(id) {
      const w = pickWin(id);
      if (w) w.focus();
    },
    reload(id) {
      const w = pickWin(id);
      if (w) w.reload();
    },
    setTitle(title, id) {
      const w = pickWin(id);
      if (w) w.setTitle(String(title || ""));
    },
    setSize(width, height, id) {
      const w = pickWin(id);
      if (w) w.setSize(Number(width) || 1280, Number(height) || 720);
    },
    openDevTools(id) {
      const w = pickWin(id);
      if (w) w.webContents.openDevTools({ mode: "detach" });
    },
    executeJavaScript(code, id) {
      const w = pickWin(id);
      if (!w) return Promise.reject(new Error("No window"));
      return w.webContents.executeJavaScript(String(code || ""), true);
    },
    insertCSS(css, id) {
      const w = pickWin(id);
      if (!w) return Promise.reject(new Error("No window"));
      return w.webContents.insertCSS(String(css || ""));
    },
    send(channel, data, id) {
      const w = pickWin(id);
      if (w) w.webContents.send("sandforge-event", String(channel || ""), data);
    },
    broadcast(channel, data) {
      winList().forEach((w) => {
        try {
          w.webContents.send("sandforge-event", String(channel || ""), data);
        } catch (_) {}
      });
    },
    capturePage(id) {
      const w = pickWin(id);
      if (!w) return Promise.reject(new Error("No window"));
      return w.webContents.capturePage().then((img) => img.toPNG());
    },
    minimize(id) {
      const w = pickWin(id);
      if (w) w.minimize();
    },
    maximize(id) {
      const w = pickWin(id);
      if (w) w.maximize();
    },
    unmaximize(id) {
      const w = pickWin(id);
      if (w) w.unmaximize();
    },
    setFullScreen(flag, id) {
      const w = pickWin(id);
      if (w) w.setFullScreen(!!flag);
    },
    isFullScreen(id) {
      const w = pickWin(id);
      return w ? w.isFullScreen() : false;
    },
    setBounds(bounds, id) {
      const w = pickWin(id);
      if (w) w.setBounds(bounds || {});
    },
    getBounds(id) {
      const w = pickWin(id);
      return w ? w.getBounds() : null;
    },
    setZoom(factor, id) {
      const w = pickWin(id);
      if (w) w.webContents.setZoomFactor(Number(factor) || 1);
    },
    getZoom(id) {
      const w = pickWin(id);
      return w ? w.webContents.getZoomFactor() : 1;
    },
    setAlwaysOnTop(flag, id) {
      const w = pickWin(id);
      if (w) w.setAlwaysOnTop(!!flag);
    },
    create(opts) {
      return createModWindow(mod, opts || {}, ctx);
    },
    captureRegion(rect, id) {
      const w = pickWin(id);
      if (!w) return Promise.reject(new Error("No window"));
      return w.webContents.capturePage(rect || {}).then((img) => img.toPNG());
    },
    printToPDF(opts, id) {
      const w = pickWin(id);
      if (!w) return Promise.reject(new Error("No window"));
      return w.webContents.printToPDF(opts || {});
    },
    captureToClipboard(id) {
      const w = pickWin(id);
      if (!w) return Promise.reject(new Error("No window"));
      return w.webContents.capturePage().then((img) => {
        clipboard.writeImage(img);
        return { ok: true, bytes: img.toPNG().length };
      });
    },
    close(id) {
      const w = pickWin(id);
      if (w) w.close();
      return { ok: !!w };
    },
  };

  api.dialog = {
    open: (opts) => dialog.showOpenDialog(pickWin() || undefined, opts || {}),
    save: (opts) => dialog.showSaveDialog(pickWin() || undefined, opts || {}),
    message: (opts) => dialog.showMessageBox(pickWin() || undefined, opts || { message: "" }),
    error: (title, content) => dialog.showErrorBox(String(title || "Error"), String(content || "")),
  };

  api.clipboard = {
    readText: () => clipboard.readText(),
    writeText: (text) => clipboard.writeText(String(text ?? "")),
    readImage: () => {
      const img = clipboard.readImage();
      return img.isEmpty() ? null : img.toPNG();
    },
    writeImagePng(buf) {
      clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(buf)));
    },
    writePage(id) {
      return api.windows.captureToClipboard(id);
    },
  };

  api.shell = {
    openPath(target) {
      const abs = resolveAllowed(ctx.paths, target);
      return shell.openPath(abs);
    },
    openUrl(url) {
      const u = new URL(String(url || ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Only http/https URLs are allowed");
      }
      return shell.openExternal(u.toString());
    },
    showItemInFolder(target) {
      shell.showItemInFolder(resolveAllowed(ctx.paths, target));
    },
  };

  api.net = {
    fetch: (url, limit) => httpGet(url, limit),
    get: (url, limit) => httpGet(url, limit),
    post: (url, body, opts) => httpPost(url, body, opts),
    request: (url, opts) => httpRequest(url, opts),
    getJson: async (url) => {
      const res = await httpGet(url);
      return JSON.parse(res.body);
    },
    download(url, destRel) {
      const dest = resolveAllowed(ctx.paths, destRel);
      return download(url, dest);
    },
    ws(url, opts) {
      const sock = wsConnect(url, opts);
      if (ctx.resources) ctx.resources.trackSocket(mod.id, sock);
      return sock;
    },
  };

  api.crypto = {
    randomId: () => crypto.randomUUID(),
    hash(text, algo) {
      return crypto.createHash(algo || "sha256").update(String(text ?? "")).digest("hex");
    },
    hashFile: (rel, algo) => io.hash(rel, algo),
  };

  api.time = {
    now: () => Date.now(),
    iso: () => new Date().toISOString(),
    sleep: (ms) => new Promise((r) => setTimeout(r, Number(ms) || 0)),
  };

  api.notify = {
    show(title, body, opts) {
      if (!Notification.isSupported()) return false;
      const o = opts || {};
      const n = new Notification({
        title: String(title || "SandForge"),
        body: String(body || ""),
        actions: Array.isArray(o.actions) ? o.actions : undefined,
        silent: !!o.silent,
      });
      n.on("click", () => {
        if (typeof o.onClick === "function") o.onClick();
        if (ctx.bus) ctx.bus.emit("sf:notify-click", { title, body, modId: mod.id });
      });
      n.on("action", (_e, index) => {
        if (typeof o.onAction === "function") o.onAction(index);
        if (ctx.bus) ctx.bus.emit("sf:notify-action", { title, body, index, modId: mod.id });
      });
      if (ctx.resources) ctx.resources.trackNotification(mod.id, n);
      n.show();
      return true;
    },
  };

  api.tray = {
    create(opts) {
      const o = opts || {};
      let icon;
      if (o.icon) {
        const abs = path.isAbsolute(o.icon)
          ? o.icon
          : path.join(mod.dir, String(o.icon).replace(/^[/\\]+/, ""));
        if (!isInside(mod.dir, abs) && !isInside(ctx.paths.sandustryData, abs)) {
          throw new Error("Tray icon outside allowed folders");
        }
        icon = nativeImage.createFromPath(abs);
      } else {
        icon = nativeImage.createEmpty();
      }
      const tray = new Tray(icon);
      if (o.tooltip) tray.setToolTip(String(o.tooltip));
      if (Array.isArray(o.menu)) {
        tray.setContextMenu(
          Menu.buildFromTemplate(
            o.menu.map((item) => ({
              label: String((item && item.label) || ""),
              click: item && item.click,
            })),
          ),
        );
      }
      if (typeof o.onClick === "function") tray.on("click", o.onClick);
      if (ctx.resources) ctx.resources.trackTray(mod.id, tray);
      return { ok: true };
    },
  };

  api.steam = {
    appId: ctx.paths.steamAppId,
    workshopRoots: ctx.paths.workshopRoots,
    gameRoot: ctx.paths.gameRoot,
    info: () => (ctx.steam ? ctx.steam.info() : { appId: ctx.paths.steamAppId }),
    subscribe: (id) => ctx.steam.subscribe(id).then((r) => {
      loadFreshMods(ctx);
      return r;
    }),
    unsubscribe: (id) => ctx.steam.unsubscribe(id),
    download: (id, high) => {
      const r = ctx.steam.download(id, high);
      loadFreshMods(ctx);
      return r;
    },
    state: (id) => ctx.steam.state(id),
    installInfo: (id) => ctx.steam.installInfo(id),
    downloadInfo: (id) => ctx.steam.downloadInfo(id),
    subscribed: () => ctx.steam.subscribed(),
    getItem: (id) => ctx.steam.getItem(id),
    getItems: (ids) => ctx.steam.getItems(ids),
    query: (opts) => ctx.steam.query(opts),
  };

  api.logFile = {
    write(line) {
      const file = path.join(ctx.paths.sandustryData, "meta", "sandforge-loader.log");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, "[" + new Date().toISOString() + "] " + String(line) + "\n");
    },
  };

  api.saves = {
    list() {
      const dir = path.join(ctx.paths.sandustryData, "saves");
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir);
    },
    maps() {
      const dir = path.join(ctx.paths.sandustryData, "custom_maps");
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir);
    },
  };

  api.util = utilLib();

  api.bus = ctx.bus || {
    on() {},
    off() {},
    once() {},
    emit() {},
    channels() {
      return [];
    },
  };

  api.registry = ctx.registry || {
    set() {},
    get() {},
    has() {
      return false;
    },
    remove() {},
    list() {
      return [];
    },
  };

  api.settings = {
    schema() {
      return (mod.info && mod.info.configSchema) || {};
    },
    get() {
      return api.modConfig.get(mod.id);
    },
    set(value) {
      return api.modConfig.set(mod.id, value);
    },
    patch(partial) {
      const cur = api.modConfig.get(mod.id) || {};
      const next = Object.assign({}, cur, partial || {});
      return api.modConfig.set(mod.id, next);
    },
  };

  api.watch = {
    dir(rel, fn) {
      const abs = resolveAllowed(ctx.paths, rel || mod.dir);
      const watcher = fs.watch(abs, { recursive: true }, (event, filename) => {
        try {
          fn({ event, filename, dir: abs });
        } catch (e) {
          console.error("[sandforge-watch]", e);
        }
      });
      const unwatch = function () {
        try {
          watcher.close();
        } catch (_) {}
      };
      if (ctx.resources) ctx.resources.trackWatcher(mod.id, unwatch);
      return unwatch;
    },
  };

  api.screen = {
    displays() {
      try {
        return screen.getAllDisplays().map((d) => ({
          id: d.id,
          bounds: d.bounds,
          workArea: d.workArea,
          scaleFactor: d.scaleFactor,
          rotation: d.rotation,
        }));
      } catch (_) {
        return [];
      }
    },
    primary() {
      try {
        const d = screen.getPrimaryDisplay();
        return { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor };
      } catch (_) {
        return null;
      }
    },
  };

  api.shortcuts = {
    register(accelerator, fn) {
      const acc = String(accelerator || "");
      if (!acc) throw new Error("Accelerator required");
      const ok = globalShortcut.register(acc, fn);
      if (ok && ctx.resources) ctx.resources.trackShortcut(mod.id, acc);
      return ok;
    },
    unregister(accelerator) {
      const acc = String(accelerator || "");
      globalShortcut.unregister(acc);
      if (ctx.resources) ctx.resources.untrackShortcut(mod.id, acc);
    },
    unregisterAll() {
      const bag = ctx.resources && ctx.resources.bag(mod.id);
      (bag ? [...bag.shortcuts] : []).forEach((acc) => {
        try {
          globalShortcut.unregister(acc);
        } catch (_) {}
      });
      if (bag) bag.shortcuts.clear();
    },
    isRegistered(accelerator) {
      return globalShortcut.isRegistered(String(accelerator || ""));
    },
  };

  api.images = {
    fromFile(rel) {
      const abs = resolveAllowed(ctx.paths, rel);
      return nativeImage.createFromPath(abs).toPNG();
    },
    fromPng(buf) {
      return nativeImage.createFromBuffer(Buffer.from(buf));
    },
    resize(buf, width, height) {
      const img = nativeImage.createFromBuffer(Buffer.from(buf));
      return img.resize({ width: Number(width) || 64, height: Number(height) || 64 }).toPNG();
    },
    size(buf) {
      const img = nativeImage.createFromBuffer(Buffer.from(buf));
      return img.getSize();
    },
  };

  api.timers = {
    timeout: (ms, fn) => {
      const id = setTimeout(fn, Number(ms) || 0);
      if (ctx.resources) ctx.resources.trackTimer(mod.id, id);
      return id;
    },
    interval: (ms, fn) => {
      const id = setInterval(fn, Number(ms) || 0);
      if (ctx.resources) ctx.resources.trackTimer(mod.id, id);
      return id;
    },
    clear: (id) => {
      clearTimeout(id);
      clearInterval(id);
    },
  };

  api.assets = {
    url: (rel) => assetUrl(mod.id, rel),
    fileUrl: (rel) => pathToFileUrl(path.join(mod.dir, String(rel || "").replace(/^[/\\]+/, ""))),
    read: (rel) => io.readText(path.join(mod.dir, rel)),
    readBinary: (rel) => io.readBinary(path.join(mod.dir, rel)),
  };

  api.help = () =>
    Object.keys(api)
      .filter((k) => typeof api[k] === "object" || typeof api[k] === "function")
      .sort();

  return api;
}

function createDispatch(ctx, loader) {
  const io = createFs(ctx.paths);
  const routes = {
    "app.info": () => ({
      version: API_VERSION,
      platform: process.platform,
      pid: process.pid,
      electron: process.versions.electron,
    }),
    "app.relaunch": () => {
      app.relaunch();
      app.quit();
      return { ok: true };
    },
    "paths.get": () => ({
      loader: ctx.paths.loaderDir,
      game: ctx.paths.gameRoot,
      asar: ctx.paths.gameAsar,
      ui: ctx.paths.uiDir,
      mods: ctx.paths.localModsRoot,
      data: ctx.paths.sandustryData,
      workshop: ctx.paths.workshopRoots,
      steamAppId: ctx.paths.steamAppId,
    }),
    "mods.list": () =>
      ctx.mods.map((m) => ({
        id: m.id,
        name: m.name,
        version: m.version,
        author: m.author,
        source: m.source,
        workshopId: m.workshopId,
        enabled: m.enabled,
        dir: m.dir,
        depends: m.depends || [],
      })),
    "mods.getDisabled": () => ctx.getDisabledIds(),
    "mods.setDisabled": (ids) =>
      ctx.applyDisabled ? ctx.applyDisabled(ids) : ctx.setDisabledIds(ids),
    "mods.unload": (id) => (ctx.unloadMod ? ctx.unloadMod(id) : { ok: false }),
    "mods.assetUrl": (modId, rel) => assetUrl(modId, rel),
    "mods.fileUrl": (modId, rel) => {
      const m = ctx.mods.find((x) => x.id === modId);
      if (!m) return "";
      return pathToFileUrl(path.join(m.dir, String(rel || "").replace(/^[/\\]+/, "")));
    },
    "mods.read": (modId, rel) => {
      const m = ctx.mods.find((x) => x.id === modId);
      if (!m) throw sfError(CODES.UNKNOWN_MOD, "Unknown mod " + modId);
      return io.readText(path.join(m.dir, rel));
    },
    "mods.reload": (id) => {
      if (loader && typeof loader.reloadMod === "function") return loader.reloadMod(id);
      throw sfError(CODES.RELOAD, "reload unavailable");
    },
    "fs.exists": (rel) => io.exists(rel),
    "fs.stat": (rel) => io.stat(rel),
    "fs.readText": (rel) => io.readText(rel),
    "fs.readJson": (rel, fallback) => io.readJson(rel, fallback),
    "fs.write": (rel, data) => io.write(rel, data),
    "fs.writeJson": (rel, value) => io.writeJson(rel, value),
    "fs.list": (rel) => io.list(rel),
    "fs.mkdir": (rel) => io.mkdir(rel),
    "fs.remove": (rel) => io.remove(rel),
    "fs.copy": (from, to) => io.copy(from, to),
    "fs.append": (rel, text) => io.append(rel, text),
    "fs.hash": (rel, algo) => io.hash(rel, algo),
    "fs.readBinary": (rel) => io.readBinary(rel),
    "store.get": (modId, key, fallback) => {
      const file = path.join(ctx.paths.sandustryData, "mod-store", String(modId || "shared") + ".json");
      const data = readJson(file, {});
      if (key == null) return data;
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : fallback;
    },
    "store.set": (modId, key, value) => {
      const file = path.join(ctx.paths.sandustryData, "mod-store", String(modId || "shared") + ".json");
      const data = readJson(file, {});
      data[key] = value;
      writeJson(file, data);
      return value;
    },
    "store.remove": (modId, key) => {
      const file = path.join(ctx.paths.sandustryData, "mod-store", String(modId || "shared") + ".json");
      const data = readJson(file, {});
      delete data[key];
      writeJson(file, data);
      return { ok: true };
    },
    "store.clear": (modId) => {
      const file = path.join(ctx.paths.sandustryData, "mod-store", String(modId || "shared") + ".json");
      writeJson(file, {});
      return { ok: true };
    },
    "windows.show": (id) => {
      const w = pickWin(id);
      if (w) w.show();
      return { ok: !!w };
    },
    "windows.hide": (id) => {
      const w = pickWin(id);
      if (w) w.hide();
      return { ok: !!w };
    },
    "windows.focus": (id) => {
      const w = pickWin(id);
      if (w) w.focus();
      return { ok: !!w };
    },
    "windows.list": () =>
      winList().map((w) => ({
        id: w.id,
        title: w.getTitle(),
        url: w.webContents.getURL(),
        visible: w.isVisible(),
      })),
    "windows.reload": (id) => {
      const w = pickWin(id);
      if (w) w.reload();
      return { ok: !!w };
    },
    "windows.openDevTools": (id) => {
      const w = pickWin(id);
      if (w) w.webContents.openDevTools({ mode: "detach" });
      return { ok: !!w };
    },
    "windows.executeJavaScript": (code, id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.executeJavaScript(String(code || ""), true);
    },
    "windows.insertCSS": (css, id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.insertCSS(String(css || ""));
    },
    "windows.broadcast": (channel, data) => {
      winList().forEach((w) => {
        try {
          w.webContents.send("sandforge-event", String(channel || ""), data);
        } catch (_) {}
      });
      return { ok: true };
    },
    "windows.setTitle": (title, id) => {
      const w = pickWin(id);
      if (w) w.setTitle(String(title || ""));
      return { ok: !!w };
    },
    "windows.setSize": (width, height, id) => {
      const w = pickWin(id);
      if (w) w.setSize(Number(width) || 1280, Number(height) || 720);
      return { ok: !!w };
    },
    "windows.setFullScreen": (flag, id) => {
      const w = pickWin(id);
      if (w) w.setFullScreen(!!flag);
      return { ok: !!w };
    },
    "windows.isFullScreen": (id) => {
      const w = pickWin(id);
      return w ? w.isFullScreen() : false;
    },
    "windows.setZoom": (factor, id) => {
      const w = pickWin(id);
      if (w) w.webContents.setZoomFactor(Number(factor) || 1);
      return { ok: !!w };
    },
    "windows.getBounds": (id) => {
      const w = pickWin(id);
      return w ? w.getBounds() : null;
    },
    "windows.setBounds": (bounds, id) => {
      const w = pickWin(id);
      if (w) w.setBounds(bounds || {});
      return { ok: !!w };
    },
    "windows.minimize": (id) => {
      const w = pickWin(id);
      if (w) w.minimize();
      return { ok: !!w };
    },
    "windows.capturePage": (id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.capturePage().then((img) => img.toPNG());
    },
    "windows.captureToClipboard": (id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.capturePage().then((img) => {
        clipboard.writeImage(img);
        return { ok: true, bytes: img.toPNG().length };
      });
    },
    "windows.getZoom": (id) => {
      const w = pickWin(id);
      return w ? w.webContents.getZoomFactor() : 1;
    },
    "windows.setAlwaysOnTop": (flag, id) => {
      const w = pickWin(id);
      if (w) w.setAlwaysOnTop(!!flag);
      return { ok: !!w };
    },
    "windows.maximize": (id) => {
      const w = pickWin(id);
      if (w) w.maximize();
      return { ok: !!w };
    },
    "windows.unmaximize": (id) => {
      const w = pickWin(id);
      if (w) w.unmaximize();
      return { ok: !!w };
    },
    "windows.close": (id) => {
      const w = pickWin(id);
      if (w) w.close();
      return { ok: !!w };
    },
    "windows.create": (opts) => {
      const o = opts || {};
      const modId = o.modId || o.mod || "";
      const m = ctx.mods.find((x) => x.id === String(modId));
      if (!m) throw new Error("Unknown mod");
      return createModWindow(m, o, ctx);
    },
    "windows.captureRegion": (rect, id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.capturePage(rect || {}).then((img) => img.toPNG());
    },
    "windows.printToPDF": (opts, id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.printToPDF(opts || {});
    },
    "clipboard.readImage": () => {
      const img = clipboard.readImage();
      return img.isEmpty() ? null : img.toPNG();
    },
    "clipboard.writeImagePng": (buf) => {
      clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(buf)));
      return { ok: true };
    },
    "clipboard.writePage": (id) => {
      const w = pickWin(id);
      if (!w) throw new Error("No window");
      return w.webContents.capturePage().then((img) => {
        clipboard.writeImage(img);
        return { ok: true, bytes: img.toPNG().length };
      });
    },
    "patcher.unseal": () => {
      if (!ctx.patcher || typeof ctx.patcher.unseal !== "function") {
        throw new Error("unseal unavailable");
      }
      ctx.patcher.unseal();
      return { ok: true, sealed: ctx.patcher.isSealed() };
    },
    "patcher.isSealed": () => !!(ctx.patcher && ctx.patcher.isSealed && ctx.patcher.isSealed()),
    "dialog.open": (opts) => dialog.showOpenDialog(pickWin() || undefined, opts || {}),
    "dialog.save": (opts) => dialog.showSaveDialog(pickWin() || undefined, opts || {}),
    "dialog.message": (opts) => dialog.showMessageBox(pickWin() || undefined, opts || { message: "" }),
    "clipboard.readText": () => clipboard.readText(),
    "clipboard.writeText": (text) => {
      clipboard.writeText(String(text ?? ""));
      return { ok: true };
    },
    "shell.openPath": (target) => shell.openPath(resolveAllowed(ctx.paths, target)),
    "shell.openUrl": (url) => {
      const u = new URL(String(url || ""));
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Only http/https URLs are allowed");
      }
      return shell.openExternal(u.toString());
    },
    "net.fetch": (url) => httpGet(url),
    "net.get": (url) => httpGet(url),
    "net.post": (url, body, opts) => httpPost(url, body, opts),
    "net.getJson": async (url) => {
      const res = await httpGet(url);
      return JSON.parse(res.body);
    },
    "net.download": (url, destRel) => download(url, resolveAllowed(ctx.paths, destRel)),
    "net.wsOpen": (url, opts) => {
      if (!ctx.sockets) ctx.sockets = new Map();
      const id = "ws-" + crypto.randomUUID();
      const sock = wsConnect(url, opts);
      ctx.sockets.set(id, sock);
      sock.on("open", () => {
        if (ctx.bus) ctx.bus.emit("sf:ws:open", { id });
      });
      sock.on("message", (data) => {
        const binary = Buffer.isBuffer(data);
        if (ctx.bus) {
          ctx.bus.emit("sf:ws:message", {
            id,
            data: binary ? data.toString("base64") : data,
            binary,
          });
        }
      });
      sock.on("close", (info) => {
        ctx.sockets.delete(id);
        if (ctx.bus) ctx.bus.emit("sf:ws:close", Object.assign({ id }, info || {}));
      });
      sock.on("error", (e) => {
        if (ctx.bus) ctx.bus.emit("sf:ws:error", { id, error: String(e && e.message ? e.message : e) });
      });
      return { id };
    },
    "net.wsSend": (id, data) => {
      const sock = ctx.sockets && ctx.sockets.get(id);
      if (!sock) throw new Error("Unknown socket");
      sock.send(data);
      return { ok: true };
    },
    "net.wsClose": (id) => {
      const sock = ctx.sockets && ctx.sockets.get(id);
      if (sock) sock.close();
      if (ctx.sockets) ctx.sockets.delete(id);
      return { ok: !!sock };
    },
    "ipc.invoke": (channel, args) => {
      if (typeof ctx.invokeIpc !== "function") throw new Error("invoke unavailable");
      return ctx.invokeIpc(channel, args || []);
    },
    "patcher.add": (patch, modId) => {
      if (!ctx.patcher) throw new Error("No patcher");
      return ctx.patcher.add(patch || {}, modId);
    },
    "steam.info": () => (ctx.steam ? ctx.steam.info() : { appId: ctx.paths.steamAppId }),
    "steam.subscribe": async (id) => {
      const r = await ctx.steam.subscribe(id);
      return Object.assign(r, loadFreshMods(ctx));
    },
    "steam.unsubscribe": (id) => ctx.steam.unsubscribe(id),
    "steam.download": (id, high) => {
      const r = ctx.steam.download(id, high);
      return Object.assign({}, r, loadFreshMods(ctx));
    },
    "steam.state": (id) => ctx.steam.state(id),
    "steam.installInfo": (id) => ctx.steam.installInfo(id),
    "steam.downloadInfo": (id) => ctx.steam.downloadInfo(id),
    "steam.subscribed": () => ctx.steam.subscribed(),
    "steam.getItem": (id) => ctx.steam.getItem(id),
    "steam.getItems": (ids) => ctx.steam.getItems(ids),
    "steam.query": (opts) => ctx.steam.query(opts),
    "crypto.hash": (text, algo) =>
      crypto.createHash(algo || "sha256").update(String(text ?? "")).digest("hex"),
    "crypto.randomId": () => crypto.randomUUID(),
    "shell.showItemInFolder": (target) => {
      shell.showItemInFolder(resolveAllowed(ctx.paths, target));
      return { ok: true };
    },
    "screen.displays": () => {
      try {
        return screen.getAllDisplays().map((d) => ({
          id: d.id,
          bounds: d.bounds,
          workArea: d.workArea,
          scaleFactor: d.scaleFactor,
        }));
      } catch (_) {
        return [];
      }
    },
    "registry.get": (ns, key, fallback) =>
      ctx.registry ? ctx.registry.get(ns, key, fallback) : fallback,
    "registry.set": (ns, key, value) => {
      if (ctx.registry) ctx.registry.set(ns, key, value);
      return value;
    },
    "registry.list": (ns) => (ctx.registry ? ctx.registry.list(ns) : []),
    "bus.emit": (channel, data) => {
      if (ctx.bus) ctx.bus.emit(channel, data);
      return { ok: true };
    },
    "settings.get": (modId) => {
      const file = path.join(ctx.paths.localModsRoot, "config", String(modId || "shared") + ".json");
      return readJson(file, {});
    },
    "settings.set": (modId, value) => {
      const file = path.join(ctx.paths.localModsRoot, "config", String(modId || "shared") + ".json");
      writeJson(file, value || {});
      return value;
    },
    "settings.patch": (modId, partial) => {
      const file = path.join(ctx.paths.localModsRoot, "config", String(modId || "shared") + ".json");
      const next = Object.assign({}, readJson(file, {}), partial || {});
      writeJson(file, next);
      return next;
    },
    "settings.schema": (modId) => {
      const m = ctx.mods.find((x) => x.id === String(modId || ""));
      return (m && m.info && m.info.configSchema) || {};
    },
    "screen.primary": () => {
      try {
        const d = screen.getPrimaryDisplay();
        return { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor };
      } catch (_) {
        return null;
      }
    },
    "net.request": (url, opts) => httpRequest(url, opts),
    "app.quit": () => {
      app.quit();
      return { ok: true };
    },
    "dialog.error": (title, content) => {
      dialog.showErrorBox(String(title || "Error"), String(content || ""));
      return { ok: true };
    },
    "workers.generation": () => ctx.workerGeneration || 0,
    "workers.boot": (kind) => {
      const want = String(kind || "");
      const entries = (typeof ctx.workerEntrypoints === "function"
        ? ctx.workerEntrypoints()
        : []
      ).filter((e) => {
        const targets = e.targets && e.targets.length ? e.targets : ["manager", "simulation"];
        return !want || targets.indexOf(want) !== -1;
      }).map((e) => ({ id: e.id, source: e.source }));
      return { generation: ctx.workerGeneration || 0, kind: want, entries };
    },
    "workers.reload": () => {
      ctx.workerGeneration = (ctx.workerGeneration || 0) + 1;
      return { ok: true, generation: ctx.workerGeneration };
    },
    "saves.maps": () => {
      const dir = path.join(ctx.paths.sandustryData, "custom_maps");
      return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    },
    "logFile.write": (line) => {
      const file = path.join(ctx.paths.sandustryData, "meta", "sandforge-loader.log");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, "[" + new Date().toISOString() + "] " + String(line) + "\n");
      return { ok: true };
    },
    "notify.show": (title, body, opts) => {
      if (!Notification.isSupported()) return false;
      const o = opts || {};
      const n = new Notification({
        title: String(title || "SandForge"),
        body: String(body || ""),
        actions: Array.isArray(o.actions) ? o.actions : undefined,
        silent: !!o.silent,
      });
      n.on("click", () => {
        if (ctx.bus) ctx.bus.emit("sf:notify-click", { title, body });
      });
      n.on("action", (_e, index) => {
        if (ctx.bus) ctx.bus.emit("sf:notify-action", { title, body, index });
      });
      n.show();
      return true;
    },
    "saves.list": () => {
      const dir = path.join(ctx.paths.sandustryData, "saves");
      return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    },
    "patcher.status": () => ctx.patcher.status(),
    "patcher.applyPreload": () =>
      typeof ctx.applyPreloadPatches === "function" ? ctx.applyPreloadPatches() : "",
  };

  async function dispatch(ns, method, args) {
    const key = String(ns || "") + "." + String(method || "");
    const fn = routes[key];
    if (!fn) throw sfError(CODES.UNKNOWN_API, "Unknown API " + key);
    return fn.apply(null, Array.isArray(args) ? args : []);
  }

  return { dispatch, routes };
}

module.exports = { attachElectronApi, createDispatch, API_VERSION };
