"use strict";

const fs = require("fs");
const path = require("path");

const SKIP_DIR = new Set([
  "node_modules",
  "wrapper",
  "runtime",
  "loader",
  ".git",
]);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function pickId(info, folderName) {
  return (
    (info && (info.id || info.modID || info.modId)) ||
    folderName ||
    ""
  );
}

function firstExisting(dir, names) {
  for (let i = 0; i < names.length; i++) {
    const p = path.join(dir, names[i]);
    if (fs.existsSync(p)) return names[i];
  }
  return "";
}

function inspectMod(dir, extra) {
  const infoPath = path.join(dir, "modinfo.json");
  if (!fs.existsSync(infoPath)) return null;
  const info = readJson(infoPath);
  if (!info || typeof info !== "object") return null;
  const folderName = path.basename(dir);
  const id = String(pickId(info, folderName));
  if (!id) return null;
  const electronEntrypoint =
    info.electronEntrypoint ||
    (info.sandforge && info.sandforge.electronEntrypoint) ||
    firstExisting(dir, ["entry.electron.js", "sandforge-main.js"]);
  const gameEntrypoint =
    info.gameEntrypoint || firstExisting(dir, ["entry.game.js"]);
  const workerMap =
    info.workerEntrypoints && typeof info.workerEntrypoints === "object"
      ? info.workerEntrypoints
      : info.workers && typeof info.workers === "object"
        ? info.workers
        : null;
  const workerFiles = {
    both: (workerMap && (workerMap.both || workerMap.all)) || "",
    manager: (workerMap && (workerMap.manager || workerMap.managerWorker)) || "",
    simulation:
      (workerMap && (workerMap.simulation || workerMap.sim || workerMap.simulationWorker)) ||
      "",
  };
  const workerEntrypoint =
    workerFiles.both ||
    info.workerEntrypoint ||
    (!workerFiles.manager && !workerFiles.simulation
      ? firstExisting(dir, ["entry.worker.js"])
      : "");
  if (workerEntrypoint && !workerFiles.both && !workerFiles.manager && !workerFiles.simulation) {
    workerFiles.both = workerEntrypoint;
  }
  return Object.assign(
    {
      id,
      name: info.name || id,
      version: info.version || "0.0.0",
      author: info.author || "",
      folderName,
      dir,
      info,
      electronEntrypoint,
      gameEntrypoint,
      workerEntrypoint,
      workerFiles,
      loadOrder: Number(info.loadOrder) || 0,
      depends: Array.isArray(info.depends)
        ? info.depends.map(String)
        : Array.isArray(info.dependencies)
          ? info.dependencies.map(String)
          : [],
      dependsRequired: !!(info.dependsRequired || info.hardDepends),
    },
    extra || {},
  );
}

function scanLocalRoot(root, source) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  let names;
  try {
    names = fs.readdirSync(root);
  } catch (_) {
    return out;
  }
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (SKIP_DIR.has(name) || name.startsWith(".")) continue;
    const dir = path.join(root, name);
    let st;
    try {
      st = fs.statSync(dir);
    } catch (_) {
      continue;
    }
    if (!st.isDirectory()) continue;
    const mod = inspectMod(dir, { source, workshopId: null });
    if (mod) out.push(mod);
  }
  return out;
}

function scanWorkshopRoot(root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  let names;
  try {
    names = fs.readdirSync(root);
  } catch (_) {
    return out;
  }
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!/^\d+$/.test(name)) continue;
    const dir = path.join(root, name);
    let st;
    try {
      st = fs.statSync(dir);
    } catch (_) {
      continue;
    }
    if (!st.isDirectory()) continue;
    const mod = inspectMod(dir, { source: "workshop", workshopId: name });
    if (mod) out.push(mod);
  }
  return out;
}

function discoverMods(paths, disabledIds) {
  const disabled = new Set((disabledIds || []).map(String));
  const byId = new Map();

  function add(mod) {
    if (!mod || !mod.id) return;
    const prev = byId.get(mod.id);
    if (prev && prev.source === "local" && mod.source === "workshop") return;
    byId.set(mod.id, mod);
  }

  (paths.workshopRoots || []).forEach((root) => {
    scanWorkshopRoot(root).forEach(add);
  });
  scanLocalRoot(paths.localModsRoot, "local").forEach(add);

  const mods = [...byId.values()].sort((a, b) => {
    if (a.loadOrder !== b.loadOrder) return a.loadOrder - b.loadOrder;
    return String(a.id).localeCompare(String(b.id));
  });
  mods.forEach((mod) => {
    mod.enabled = !disabled.has(mod.id);
  });
  return mods;
}

function sortMods(mods) {
  const list = (mods || []).slice();
  const byId = new Map(list.map((m) => [m.id, m]));
  const seen = new Set();
  const out = [];
  function visit(m) {
    if (!m || seen.has(m.id)) return;
    seen.add(m.id);
    (m.depends || []).forEach((id) => {
      if (byId.has(id)) visit(byId.get(id));
    });
    out.push(m);
  }
  list
    .sort(
      (a, b) =>
        (Number(a.loadOrder) || 0) - (Number(b.loadOrder) || 0) ||
        String(a.id).localeCompare(String(b.id)),
    )
    .forEach(visit);
  return out;
}

module.exports = { discoverMods, inspectMod, sortMods };
