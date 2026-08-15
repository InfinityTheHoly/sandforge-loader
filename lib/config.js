"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  maxMapDimension: 15360,
  disabled: [],
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function loadConfig(paths) {
  const file = readJson(paths.configPath, {});
  const legacy = readJson(paths.disabledPath, { ids: [] });
  const disabled = new Set();
  (Array.isArray(file.disabled) ? file.disabled : []).forEach((id) =>
    disabled.add(String(id)),
  );
  const legacyIds = Array.isArray(legacy) ? legacy : legacy.ids || [];
  legacyIds.forEach((id) => disabled.add(String(id)));
  return {
    maxMapDimension: Number(file.maxMapDimension) || DEFAULTS.maxMapDimension,
    disabled: [...disabled].filter(Boolean),
  };
}

function saveDisabled(paths, ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean);
  const prev = readJson(paths.configPath, {});
  writeJson(paths.configPath, Object.assign({}, prev, { disabled: list }));
  writeJson(paths.disabledPath, { ids: list });
  return list;
}

module.exports = { DEFAULTS, readJson, writeJson, loadConfig, saveDisabled };
