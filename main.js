/**
 * SandForge loader — Electron resources/app when installed.
 * Steam still launches Sandustry.exe. This folder is not a Workshop item.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { app, dialog, session } = require("electron");
const { resolvePaths, extractStockPreload } = require("./lib/paths");
const { loadConfig, saveDisabled } = require("./lib/config");
const { discoverMods } = require("./lib/discover");
const { createPatcher } = require("./lib/patcher");
const { createLoader } = require("./lib/loader-api");
const { installModuleHooks, injectWorkerEntrypoints, applyPreloadPatches } = require("./lib/hooks");
const { createSteamWorkshop } = require("./lib/steam-workshop");
const { registerPrivilegedSchemes, installProtocol } = require("./lib/protocol");
const { isGameRenderer } = require("./lib/window-kind");
const { wrapGameEntry } = require("./lib/game-inject");

registerPrivilegedSchemes();

process.env.SANDFORGE_LOADER = "1";
process.env.SANDFORGE_WRAPPER = "1";

try {
  app.setName("sandustry");
  app.setPath("userData", path.join(app.getPath("appData"), "sandustry"));
} catch (_) {}

function writeBootMarker(extra) {
  try {
    const dir = path.join(app.getPath("appData"), "sandustry", "meta");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "sandforge-boot.json"),
      JSON.stringify(
        Object.assign(
          {
            at: new Date().toISOString(),
            pid: process.pid,
            exec: process.execPath,
            resourcesPath: process.resourcesPath,
            appPath: app.getAppPath(),
            loaderDir: path.resolve(__dirname),
          },
          extra || {},
        ),
        null,
        2,
      ),
    );
  } catch (_) {}
}

writeBootMarker({ stage: "start" });

const paths = resolvePaths();
const config = loadConfig(paths);

function isInside(root, target) {
  const r = path.resolve(root) + path.sep;
  const t = path.resolve(target);
  return t === path.resolve(root) || t.toLowerCase().startsWith(r.toLowerCase());
}

function getDisabledIds() {
  return config.disabled.slice();
}

function setDisabledIds(ids) {
  config.disabled = saveDisabled(paths, ids);
  return config.disabled;
}

if (!paths.gameRoot || !paths.gameAsar || !fs.existsSync(paths.gameAsar)) {
  writeBootMarker({ stage: "missing-asar", gameRoot: paths.gameRoot, gameAsar: paths.gameAsar });
  app.whenReady().then(() => {
    dialog.showErrorBox(
      "SandForge loader",
      "Could not find the stock game asar (resources\\vanilla\\app.asar). Run install.cmd, then launch from Steam.",
    );
    app.quit();
  });
} else {
  writeBootMarker({
    stage: "found-asar",
    gameRoot: paths.gameRoot,
    gameAsar: paths.gameAsar,
  });
  process.env.SANDFORGE_GAME_ROOT = paths.gameRoot;
  process.env.SANDFORGE_ORIG_PRELOAD = paths.origPreload;
  process.env.SANDFORGE_UI_DIR = paths.uiDir;
  process.env.SANDFORGE_USERDATA = paths.sandustryData;
  try {
    if (extractStockPreload(paths.gameAsar, paths.stockPreload)) {
      process.env.SANDFORGE_ORIG_PRELOAD = paths.stockPreload;
    } else {
      console.warn("[sandforge-loader] could not extract stock preload");
    }
  } catch (e) {
    console.warn("[sandforge-loader] stock preload extract failed", e);
  }

  const mods = discoverMods(paths, config.disabled);
  const patcher = createPatcher({
    uiDir: paths.uiDir,
    gameAsar: paths.gameAsar,
    sandustryData: paths.sandustryData,
  });
  const ctx = {
    paths,
    mods,
    patcher,
    maxMapDimension: config.maxMapDimension,
    getDisabledIds,
    setDisabledIds,
    isInside,
  };
  const loader = createLoader(ctx);
  const steam = createSteamWorkshop(paths);
  ctx.steam = steam;
  steam.hook();

  console.log(
    "[sandforge-loader] boot",
    "pid",
    process.pid,
    "game",
    paths.gameRoot,
    "workshop",
    paths.workshopRoots,
    "mods",
    mods.length,
    "enabled",
    mods.filter((m) => m.enabled).length,
  );

  try {
    patcher.loadFromMods(mods);
    const workerApi = fs.readFileSync(
      path.join(paths.loaderDir, "runtime", "worker-api.js"),
      "utf8",
    );
    injectWorkerEntrypoints(patcher, loader.workerEntrypoints(), workerApi);
    const hostBoot =
      ";(function(){try{window.__SF_HOST__={loader:true,version:'1.0.0'};window.__SANDFORGE_LOADER__=window.__SF_HOST__;window.SandforgeLoader=window.SandforgeLoader||{};window.SandforgeLoader.has=function(){return true;};window.SandforgeLoader.GITHUB_URL=window.SandforgeLoader.GITHUB_URL||'https://github.com/sandforge/sandforge-loader';}catch(e){}})();\n";
    patcher.addTransform(
      "js/bundle.js",
      (src) => {
        let next = hostBoot + String(src);
        next = next.replace(
          /if\(!([A-Za-z_$][\w$]*)\)throw new Error\(["']Automatic publicPath is not supported in this browser["']\)/g,
          'if(!$1)$1="sandforge-ui://game/js/bundle.js"',
        );
        return next;
      },
      { id: "sandforge-loader:host-flag-bundle", phase: "early" },
      "sandforge-loader",
    );
    patcher.addTransform(
      "index.html",
      (src) =>
        String(src).replace(
          "<head>",
          "<head><script>window.__SF_HOST__={loader:true,version:'1.0.0'};window.__SANDFORGE_LOADER__=window.__SF_HOST__;window.SandforgeLoader=window.SandforgeLoader||{};window.SandforgeLoader.has=function(){return true;};window.SandforgeLoader.GITHUB_URL=window.SandforgeLoader.GITHUB_URL||'https://github.com/sandforge/sandforge-loader';</script>",
        ),
      { id: "sandforge-loader:host-flag", phase: "early" },
      "sandforge-loader",
    );
    loader.loadElectronPlugins();
    applyPreloadPatches(ctx);
    patcher.seal();
  } catch (e) {
    console.error("[sandforge-loader] plugin/patcher load failed", e);
    try {
      patcher.seal();
    } catch (_) {}
  }

  global.__SANDFORGE_HAS_RENDERER_PATCHES__ = patcher.hasRendererWork();
  global.__SANDFORGE_RENDERER_FILES__ = patcher.getRendererFiles();

  loader.installIpc();
  installProtocol(ctx);
  installModuleHooks(ctx);

  app.on("browser-window-created", (_event, win) => {
    try {
      loader.events.emit("sf:window-created", win);
      loader.sendGameEvent("sf:window-created", { pid: process.pid });
      loader.events.trigger("sf:game-started");
    } catch (_) {}
    try {
      win.webContents.on("dom-ready", () => {
        let guard = "";
        try {
          guard = fs.readFileSync(
            path.join(path.resolve(__dirname), "runtime", "file-url-guard.js"),
            "utf8",
          );
        } catch (_) {}
        win.webContents
          .executeJavaScript(
            "window.__SF_HOST__=window.__SF_HOST__||{loader:true,version:'1.0.0'};" +
              "window.__SANDFORGE_LOADER__=window.__SANDFORGE_LOADER__||window.__SF_HOST__;\n" +
              (guard ? guard + "\n//# sourceURL=sandforge-file-url-guard.js\n" : ""),
            true,
          )
          .catch(() => {});
      });
      win.webContents.on("did-finish-load", () => {
        console.log("[sandforge-loader] loaded", win.webContents.getURL());
        let gameApi = "";
        try {
          gameApi = fs.readFileSync(
            path.join(path.resolve(__dirname), "runtime", "game-api.js"),
            "utf8",
          );
        } catch (e) {
          console.error("[sandforge-loader] game-api read failed", e);
          return;
        }
        const popoutMod = win.__SF_POPOUT_MOD__ || "";
        const rows = isGameRenderer(win) ? loader.gameEntrypoints() : [];
        let chain = win.webContents.executeJavaScript(
          (popoutMod
            ? "window.__SF_CURRENT_MOD__=" + JSON.stringify(popoutMod) + ";\n"
            : "") +
            gameApi +
            "\n//# sourceURL=sandforge-game-api.js\n",
          true,
        );
        if (popoutMod) {
          chain = chain.then(() =>
            win.webContents.executeJavaScript(
              "if(window.SandforgeGame&&window.SandforgeGame.bind){var a=window.SandforgeGame.bind(" +
                JSON.stringify(popoutMod) +
                ");window.sandforge=a;window.sandforgeAPI=a;}",
              true,
            ),
          );
        }
        rows.forEach((row) => {
          if (!row || !row.file) return;
          let code = "";
          try {
            code = fs.readFileSync(row.file, "utf8");
          } catch (e) {
            console.error("[sandforge-loader] game plugin read", row.id, e);
            return;
          }
          chain = chain
            .then(() =>
              win.webContents.executeJavaScript(
                wrapGameEntry(row.id, code, { persist: !!popoutMod }),
                true,
              ),
            )
            .then(() => console.log("[sandforge-loader] game plugin", row.id))
            .catch((e) =>
              console.error("[sandforge-loader] game plugin failed", row.id, e),
            );
        });
      });
      win.webContents.on("before-input-event", (event, input) => {
        if (input.type !== "keyDown" || input.control || input.alt || input.meta) {
          return;
        }
        if (input.code === "F6" && !input.shift) {
          event.preventDefault();
          app.relaunch();
          app.quit();
          return;
        }
        if (input.code === "F12") {
          event.preventDefault();
          try {
            win.webContents.toggleDevTools();
          } catch (e) {
            console.warn("[sandforge-loader] toggleDevTools failed", e);
          }
        }
      });
    } catch (_) {}
  });

  app.whenReady().then(() => {
    try {
      session.defaultSession.setPreloads([
        path.join(paths.loaderDir, "preload-chain.js"),
      ]);
    } catch (e) {
      console.warn("[sandforge-loader] setPreloads failed", e);
    }
  });

  app.on("quit", () => {
    try {
      loader.events.trigger("sf:game-closed");
    } catch (_) {}
  });

  writeBootMarker({
    stage: "require-game",
    gameRoot: paths.gameRoot,
    gameAsar: paths.gameAsar,
    mods: mods.length,
  });
  require(path.join(paths.gameAsar, "main.js"));
}
