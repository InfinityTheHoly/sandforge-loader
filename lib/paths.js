"use strict";

const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const STEAM_APP_ID = "2764460";
const LOADER_DIR = path.resolve(__dirname, "..");

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (_) {
    return "";
  }
}

function findSteamLibraries() {
  const libs = [];
  let steam = "";
  try {
    const { execSync } = require("child_process");
    const out = execSync(
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
      { windowsHide: true, encoding: "utf8" },
    );
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
    if (m) steam = m[1].trim();
  } catch (_) {}
  if (!steam) {
    for (const p of [
      path.join(process.env["ProgramFiles(x86)"] || "", "Steam"),
      path.join(process.env.ProgramFiles || "", "Steam"),
    ]) {
      if (p && fs.existsSync(p)) {
        steam = p;
        break;
      }
    }
  }
  if (steam) {
    libs.push(steam);
    const vdf = path.join(steam, "steamapps", "libraryfolders.vdf");
    const text = readText(vdf);
    const matches = text.matchAll(/"path"\s+"([^"]+)"/g);
    for (const m of matches) {
      libs.push(m[1].replace(/\\\\/g, "\\"));
    }
  }
  return [...new Set(libs.map((p) => path.resolve(p)))];
}

function stockAsarPath(gameRoot) {
  if (!gameRoot) return "";
  const vanilla = path.join(gameRoot, "resources", "vanilla", "app.asar");
  if (fs.existsSync(vanilla)) return vanilla;
  const direct = path.join(gameRoot, "resources", "app.asar");
  if (fs.existsSync(direct)) return direct;
  return "";
}

function isGameRoot(dir) {
  return !!stockAsarPath(dir);
}

function findGameRoot() {
  const exeDir = path.dirname(process.execPath || "");
  if (exeDir && isGameRoot(exeDir)) {
    return path.resolve(exeDir);
  }
  const beside = path.resolve(LOADER_DIR, "..");
  if (isGameRoot(beside)) {
    return beside;
  }
  const fromEnv = process.env.SANDFORGE_GAME_ROOT;
  if (fromEnv && isGameRoot(fromEnv)) {
    return path.resolve(fromEnv);
  }
  for (const lib of findSteamLibraries()) {
    const guess = path.join(lib, "steamapps", "common", "Sandustry");
    if (isGameRoot(guess)) {
      return guess;
    }
  }
  return "";
}

function findWorkshopRoots(gameRoot) {
  const roots = [];
  if (gameRoot) {
    const beside = path.resolve(gameRoot, "..", "..", "workshop", "content", STEAM_APP_ID);
    if (fs.existsSync(beside)) roots.push(beside);
  }
  for (const lib of findSteamLibraries()) {
    const p = path.join(lib, "steamapps", "workshop", "content", STEAM_APP_ID);
    if (fs.existsSync(p)) roots.push(path.resolve(p));
  }
  return [...new Set(roots)];
}

function sandustryData() {
  return path.join(app.getPath("appData"), "sandustry");
}

function localModsRoot() {
  const envp = process.env.SANDFORGE_MODS_PATH;
  if (envp && String(envp).trim() && fs.existsSync(String(envp).trim())) {
    return path.resolve(String(envp).trim());
  }
  return path.join(sandustryData(), "mods");
}

function extractStockPreload(gameAsar, dest) {
  if (!gameAsar || !dest) return false;
  const src = path.join(gameAsar, "preload.js");
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return fs.existsSync(dest);
}

function resolvePaths() {
  const gameRoot = findGameRoot();
  const gameAsar = stockAsarPath(gameRoot);
  const stockPreload = path.join(LOADER_DIR, "stock-preload.js");
  return {
    loaderDir: LOADER_DIR,
    gameRoot,
    gameAsar,
    uiDir: gameAsar ? path.join(gameAsar, "dist") : "",
    origPreload: gameAsar ? path.join(gameAsar, "preload.js") : "",
    stockPreload,
    workshopRoots: findWorkshopRoots(gameRoot),
    localModsRoot: localModsRoot(),
    sandustryData: sandustryData(),
    configPath: path.join(sandustryData(), "loader-config.json"),
    disabledPath: path.join(sandustryData(), "meta", "mods-disabled.json"),
    steamAppId: STEAM_APP_ID,
  };
}

module.exports = {
  STEAM_APP_ID,
  LOADER_DIR,
  findSteamLibraries,
  findGameRoot,
  findWorkshopRoots,
  stockAsarPath,
  isGameRoot,
  sandustryData,
  localModsRoot,
  extractStockPreload,
  resolvePaths,
};
