"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");

function asarRelative(filename) {
  const n = String(filename || "").replace(/\\/g, "/");
  const marker = "app.asar/";
  const idx = n.toLowerCase().indexOf(marker);
  if (idx === -1) return "";
  return n.slice(idx + marker.length);
}

function compilePatchedModule(filename, parent, src) {
  const mod = new Module(filename, parent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(src, filename);
  Module._cache[filename] = mod;
  return mod.exports;
}

function applyHostWorkshopPatches(src, maxMap) {
  return src.replace(/MAX_MAP_DIMENSION\s*=\s*3840/, "MAX_MAP_DIMENSION = " + maxMap);
}

function applyHostMainPatches(src, opts) {
  let next = src;
  const windowPreload = String(opts.windowPreload || opts.chainPreload || "").replace(/\\/g, "/");
  next = next.replace(
    "path.join(__dirname, 'preload.js')",
    JSON.stringify(windowPreload),
  );
  next = next.replace(
    "if (workshopPatches.length === 0) {\n    console.log('Skipping protocol interceptor (no native mod patches)');\n    return;\n  }",
    "if (workshopPatches.length === 0 && !global.__SANDFORGE_HAS_RENDERER_PATCHES__) {\n    console.log('Skipping protocol interceptor (no native mod patches)');\n    return;\n  }",
  );
  next = next.replace(
    "for (let i = 0; i < workshopPatches.length; i++) {\n    targetFiles.add(workshopPatches[i].file);\n  }",
    "for (let i = 0; i < workshopPatches.length; i++) {\n    targetFiles.add(workshopPatches[i].file);\n  }\n  (global.__SANDFORGE_RENDERER_FILES__ || []).forEach(function (f) { targetFiles.add(f); });",
  );
  next = next.replace(
    "'Content-Type': 'application/javascript'",
    "'Content-Type': (/\\.css$/i.test(normalized) ? 'text/css' : /\\.html?$/i.test(normalized) ? 'text/html' : /\\.json$/i.test(normalized) ? 'application/json' : 'application/javascript')",
  );
  next = next.replace(
    "mainWindow.loadFile(distIndex)",
    "mainWindow.loadURL('sandforge-ui://game/index.html')",
  );
  next = next.replace(
    "if (_workshopPatchedSources.has(normalized)) {\n          const redirectUrl = new URL(`${PATCH_PROTOCOL_SCHEME}://bundle/`);\n          redirectUrl.pathname = `/${normalized}`;\n          callback({ redirectURL: redirectUrl.href });\n          return;\n        }",
    "var __sfFileRedir = (typeof global !== 'undefined' && global.__SANDFORGE_REDIRECT_FILE__) ? global.__SANDFORGE_REDIRECT_FILE__(filePath) : '';\n        if (__sfFileRedir) {\n          callback({ redirectURL: __sfFileRedir });\n          return;\n        }\n        if (_workshopPatchedSources.has(normalized) || /app\\.asar[\\\\/]+dist/i.test(filePath)) {\n          callback({ redirectURL: 'sandforge-ui://game/' + normalized });\n          return;\n        }",
  );
  return next;
}

function wrapWorkshopExports(exported, ctx) {
  ctx.workshopApi = ctx.workshopApi || {};
  ctx.workshopApi.exported = exported;
  if (typeof exported.discoverSandkitWorkshopMods === "function") {
    const orig = exported.discoverSandkitWorkshopMods;
    exported.discoverSandkitWorkshopMods = function (options) {
      const data = orig(options);
      const disabled = new Set(ctx.getDisabledIds());
      if (disabled.size && data && Array.isArray(data.mods)) {
        data.mods = data.mods.filter((record) => {
          const id = record && record.manifest && record.manifest.id;
          if (!id) return true;
          return !disabled.has(id);
        });
      }
      return data;
    };
  }
  const patcher = ctx.patcher;
  if (patcher && typeof exported.loadWorkshopPatches === "function") {
    const origLoadP = exported.loadWorkshopPatches;
    exported.loadWorkshopPatches = function (mods, options) {
      const data = origLoadP(mods, options);
      ctx.workshopApi.lastWorkshopPatches = (data.patches || []).slice();
      const disabled = new Set(ctx.getDisabledIds());
      const early = patcher.toSandkitPatches("early").filter((p) => !disabled.has(p.modId));
      const late = patcher.toSandkitPatches("late").filter((p) => !disabled.has(p.modId));
      data.patches = early.concat(data.patches || []).concat(late);
      if (early.length || late.length) {
        console.log(
          "[sandforge-loader] injected",
          early.length + late.length,
          "Anvil renderer patch(es)",
        );
      }
      return data;
    };
  }
  if (patcher && typeof exported.applyPatchSet === "function") {
    const origApply = exported.applyPatchSet;
    exported.applyPatchSet = function (inputSources, patches) {
      ctx.workshopApi.lastSources = new Map(inputSources);
      ctx.workshopApi.lastPatches = patches;
      const sources = new Map(inputSources);
      patcher.ensureRendererSources(sources, ctx.paths.uiDir);
      patcher.applyRendererTransforms(sources, "early");
      const prepared = origApply(sources, patches);
      patcher.applyRendererTransforms(prepared.sources, "late");
      try {
        global.__SANDFORGE_PATCHED_UI__ = prepared.sources;
      } catch (_) {}
      return prepared;
    };
  }
}

function installModuleHooks(ctx) {
  const gameAsar = ctx.paths.gameAsar;
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    let filename;
    try {
      filename = Module._resolveFilename(request, parent, isMain);
    } catch (_) {
      return origLoad.apply(this, arguments);
    }
    const rel = asarRelative(filename);
    if (!rel || !/\.js$/i.test(rel)) {
      return origLoad.apply(this, arguments);
    }
    if (rel.indexOf("node_modules/") === 0 && !(ctx.patcher && ctx.patcher.hasMainPatches(rel))) {
      return origLoad.apply(this, arguments);
    }

    const isWorkshop = rel === "workshop-mods.js";
    const isMainJs = rel === "main.js";
    const userMain = ctx.patcher && ctx.patcher.hasMainPatches(rel);
    if (!isWorkshop && !isMainJs && !userMain) {
      return origLoad.apply(this, arguments);
    }
    if (Module._cache[filename]) return Module._cache[filename].exports;

    let src = fs.readFileSync(filename, "utf8");
    if (isWorkshop) src = applyHostWorkshopPatches(src, ctx.maxMapDimension);
    if (isMainJs) {
      const stock = ctx.paths.stockPreload;
      const chain = path.join(ctx.paths.loaderDir, "preload-chain.js");
      src = applyHostMainPatches(src, {
        chainPreload: chain,
        windowPreload:
          (ctx.paths.windowPreload && fs.existsSync(ctx.paths.windowPreload)
            ? ctx.paths.windowPreload
            : "") ||
          (stock && fs.existsSync(stock) ? stock : chain),
      });
    }
    if (userMain) {
      try {
        src = ctx.patcher.applyMainSource(rel, src).content;
      } catch (e) {
        console.error("[sandforge-loader] Anvil main patch failed for", rel, e);
      }
    }

    const exported = compilePatchedModule(filename, parent, src);
    if (isWorkshop) wrapWorkshopExports(exported, ctx);
    return exported;
  };
}

function workerBoot(rows) {
  return (
    ";(function(){\n" +
    "  try {\n" +
    "    var __SF_W=" +
    JSON.stringify(rows) +
    ";\n" +
    "    for (var i = 0; i < __SF_W.length; i++) {\n" +
    "      try {\n" +
    "        (0, eval)(__SF_W[i].source + \"\\n//# sourceURL=sandforge-worker/\" + __SF_W[i].id);\n" +
    "      } catch (e) {\n" +
    "        console.error(\"[sandforge-loader] worker plugin\", __SF_W[i].id, e);\n" +
    "      }\n" +
    "    }\n" +
    "  } catch (e) {}\n" +
    "})();\n"
  );
}

function injectWorkerEntrypoints(patcher, entries, workerApiSource) {
  const prefix = String(workerApiSource || "");
  const byFile = {
    "js/manager-worker.js": [],
    "js/simulation-worker.js": [],
  };
  (entries || []).forEach((e) => {
    const targets = e.targets && e.targets.length ? e.targets : ["manager", "simulation"];
    const row = { id: e.id, source: e.source };
    if (targets.indexOf("manager") !== -1) byFile["js/manager-worker.js"].push(row);
    if (targets.indexOf("simulation") !== -1) byFile["js/simulation-worker.js"].push(row);
  });
  Object.keys(byFile).forEach((file) => {
    const kind = file.indexOf("manager") !== -1 ? "manager" : "simulation";
    const boot =
      "self.__SF_WORKER_KIND__=" + JSON.stringify(kind) + ";\n" + workerBoot(byFile[file]);
    patcher.addTransform(
      file,
      (src) => prefix + "\n" + src + "\n" + boot,
      { id: "sandforge-loader:worker-append:" + file, phase: "late" },
      "sandforge-loader",
    );
  });
}

function applyPreloadPatches(ctx) {
  const stock = ctx.paths.stockPreload;
  if (!stock || !fs.existsSync(stock)) return stock || "";
  const patcher = ctx.patcher;
  if (!patcher || !patcher.hasMainPatches("preload.js")) {
    ctx.paths.windowPreload = stock;
    return stock;
  }
  const dest = path.join(ctx.paths.loaderDir, "stock-preload.patched.js");
  try {
    const src = fs.readFileSync(stock, "utf8");
    const next = patcher.applyMainSource("preload.js", src).content;
    fs.writeFileSync(dest, next, "utf8");
    ctx.paths.windowPreload = dest;
    console.log("[sandforge-loader] applied Anvil to preload.js");
    return dest;
  } catch (e) {
    console.error("[sandforge-loader] preload Anvil failed", e);
    ctx.paths.windowPreload = stock;
    return stock;
  }
}

function rebuildRendererPatches(ctx) {
  const api = ctx.workshopApi;
  if (!api || typeof api.exported.applyPatchSet !== "function" || !api.lastSources) {
    return { ok: false, error: "Renderer sources not cached yet" };
  }
  const disabled = new Set(ctx.getDisabledIds());
  const workshop = (api.lastWorkshopPatches || []).filter((p) => {
    const id = String((p && p.id) || "");
    for (const d of disabled) {
      if (id === d || id.indexOf(d + ":") === 0) return false;
    }
    return true;
  });
  const early = ctx.patcher.toSandkitPatches("early").filter((p) => !disabled.has(p.modId));
  const late = ctx.patcher.toSandkitPatches("late").filter((p) => !disabled.has(p.modId));
  const patches = early.concat(workshop).concat(late);
  api.exported.applyPatchSet(new Map(api.lastSources), patches);
  global.__SANDFORGE_HAS_RENDERER_PATCHES__ = ctx.patcher.hasRendererWork();
  global.__SANDFORGE_RENDERER_FILES__ = ctx.patcher.getRendererFiles();
  return { ok: true, patches: patches.length };
}

module.exports = {
  installModuleHooks,
  injectWorkerEntrypoints,
  applyPreloadPatches,
  rebuildRendererPatches,
};
