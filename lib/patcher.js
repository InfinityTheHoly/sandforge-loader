"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sfError, CODES } = require("./errors");

function normalizeFile(file) {
  let rel = String(file || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (rel === "bundle.js" || rel === "js/bundle.js") return "js/bundle.js";
  if (rel.indexOf("dist/") === 0) rel = rel.slice(5);
  if (rel.indexOf("asar:") === 0) rel = rel.slice(5);
  return rel;
}

function asarPath(gameAsar, rel) {
  const n = normalizeFile(rel);
  if (n.startsWith("js/") || n.startsWith("css/") || n === "index.html") {
    return path.join(gameAsar, "dist", n);
  }
  return path.join(gameAsar, n);
}

function expectedOk(expected, count) {
  if (expected === "any" || expected === 0 || expected === -1) return true;
  const n = expected == null ? 1 : Number(expected);
  return count === n;
}

function applyStringOp(src, patch) {
  const find = patch.find != null ? String(patch.find) : "";
  const regex = patch.regex;
  let matches = [];
  if (regex && regex.pattern) {
    const flags = String(regex.flags || "").replace(/g/g, "");
    const re = new RegExp(regex.pattern, flags);
    let m;
    const global = new RegExp(regex.pattern, flags + "g");
    while ((m = global.exec(src))) {
      matches.push({ index: m.index, text: m[0] });
      if (m[0].length === 0) global.lastIndex += 1;
    }
    if (!matches.length && re.test(src)) {
      const one = src.match(re);
      if (one) matches.push({ index: src.indexOf(one[0]), text: one[0] });
    }
  } else if (find) {
    let from = 0;
    while (from <= src.length) {
      const i = src.indexOf(find, from);
      if (i === -1) break;
      matches.push({ index: i, text: find });
      from = i + Math.max(find.length, 1);
    }
  } else {
    throw sfError(CODES.PATCH_NEEDS_FIND, "patch needs find or regex");
  }

  const expected = patch.expectedMatches;
  if (!expectedOk(expected, matches.length)) {
    return {
      ok: false,
      reason: "match_count_mismatch",
      matches: matches.length,
      expected: expected == null ? 1 : expected,
      content: src,
    };
  }

  let occ = patch.occurrence;
  if (occ && occ !== "all") {
    const n = Number(occ);
    matches = Number.isFinite(n) && n >= 1 ? [matches[n - 1]].filter(Boolean) : matches;
  }

  const op = String(patch.operation || patch.type || "replace");
  let code = patch.code != null ? String(patch.code) : "";
  if (patch.to != null) code = String(patch.to);
  if (patch.token && patch.from != null) {
    code = code.split(String(patch.token)).join(String(patch.from));
  }

  let next = src;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    let insert = code;
    if (regex && regex.pattern && patch.to != null) {
      insert = m.text.replace(new RegExp(regex.pattern, String(regex.flags || "")), code);
    }
    let replacement = insert;
    if (op === "remove") replacement = "";
    else if (op === "insertBefore" || op === "prefix" || op === "before") {
      replacement = insert + m.text;
    } else if (op === "insertAfter" || op === "postfix" || op === "bodyPrefix" || op === "after") {
      replacement = m.text + insert;
    } else if (op === "wrap") {
      replacement = String(patch.before || "") + m.text + String(patch.after || "");
    } else {
      replacement = insert;
    }
    next = next.slice(0, m.index) + replacement + next.slice(m.index + m.text.length);
  }
  return { ok: true, content: next, matches: matches.length };
}

function createPatcher(ctx) {
  const queued = [];
  const transforms = [];
  const results = [];
  const assetOverrides = new Map();
  let sealed = false;

  function log(message) {
    console.log("[sandforge-patcher] " + message);
  }

  function add(patch, modId) {
    if (sealed) throw sfError(CODES.PATCH_SEALED, "Patcher is sealed");
    const p = Object.assign({}, patch);
    p.modId = modId || p.modId || "loader";
    p.id = p.id || p.tag || p.modId + ":" + crypto.randomUUID();
    p.file = normalizeFile(p.file);
    p.priority = p.priority == null ? 0 : Number(p.priority);
    p.phase = p.phase === "early" ? "early" : "late";
    if (p.from && !p.find && !p.regex) p.find = p.from;
    if (p.replace != null && p.code == null && p.to == null) p.code = p.replace;
    if (p.expect != null && p.expectedMatches == null) p.expectedMatches = p.expect;
    if (p.type && !p.operation) {
      if (p.type === "before") p.operation = "insertBefore";
      else if (p.type === "after") p.operation = "insertAfter";
      else p.operation = p.type;
    }
    if (p.operation === "asset" || p.type === "asset") {
      const dest = p.assetPath || p.from || p.code;
      if (dest && fs.existsSync(String(dest))) {
        assetOverrides.set(p.file, path.resolve(String(dest)));
        log("asset " + p.id + " → " + p.file);
      }
    }
    queued.push(p);
    log("queued " + p.id + " → " + p.file);
    return p.id;
  }

  function addNamed(file, patchObj, modId) {
    const tag = patchObj && patchObj.id ? patchObj.id : crypto.randomUUID();
    return add(
      Object.assign({ file, id: tag }, patchObj, {
        find: patchObj.from || patchObj.find,
        code: patchObj.to != null ? patchObj.to : patchObj.code,
      }),
      modId,
    );
  }

  function unpatch(id) {
    if (sealed) throw sfError(CODES.PATCH_SEALED, "Patcher is sealed");
    const i = queued.findIndex((p) => p.id === id);
    if (i !== -1) {
      const p = queued[i];
      if (p && p.file) assetOverrides.delete(p.file);
      queued.splice(i, 1);
    }
    const t = transforms.findIndex((x) => x.id === id);
    if (t !== -1) transforms.splice(t, 1);
  }

  function removeByMod(modId) {
    const id = String(modId || "");
    queued
      .filter((p) => p.modId === id)
      .forEach((p) => {
        try {
          unpatch(p.id);
        } catch (_) {}
      });
    transforms
      .filter((t) => t.modId === id)
      .slice()
      .forEach((t) => {
        try {
          unpatch(t.id);
        } catch (_) {}
      });
  }

  function addTransform(file, fn, opts, modId) {
    if (sealed) throw sfError(CODES.PATCH_SEALED, "Patcher is sealed");
    const spec = {
      id: (opts && opts.id) || (modId || "loader") + ":transform:" + crypto.randomUUID(),
      file: normalizeFile(file),
      fn,
      phase: opts && opts.phase === "early" ? "early" : "late",
      modId: modId || "loader",
    };
    transforms.push(spec);
    return spec.id;
  }

  function loadJsonFile(mod, fileName) {
    const file = path.join(mod.dir, fileName);
    if (!fs.existsSync(file)) return;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      log("skip " + fileName + " in " + mod.id + " (" + (e && e.message) + ")");
      return;
    }
    const list = Array.isArray(parsed) ? parsed : parsed && parsed.patches;
    if (!Array.isArray(list)) return;
    list.forEach((p) => {
      const row = Object.assign({}, p);
      if ((row.operation === "asset" || row.type === "asset") && row.from) {
        row.assetPath = path.resolve(mod.dir, String(row.from));
      }
      add(row, mod.id);
    });
  }

  function loadFromMods(mods) {
    (mods || [])
      .filter((m) => m && m.enabled)
      .forEach((mod) => {
        loadJsonFile(mod, "anvil.json");
        loadJsonFile(mod, "sandforge-patches.json");
      });
  }

  function sorted(phase, file) {
    return queued
      .filter((p) => p.phase === phase && (!file || p.file === file))
      .sort((a, b) => b.priority - a.priority);
  }

  function applyList(src, list, file) {
    let next = src;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      try {
        if (typeof p.func === "function") {
          next = p.func(next);
          results.push({ id: p.id, ok: true, file });
          continue;
        }
        if (p.operation === "overwrite" || p.type === "overwrite") {
          next = p.contents != null ? String(p.contents) : next;
          results.push({ id: p.id, ok: true, file });
          continue;
        }
        const out = applyStringOp(next, p);
        if (!out.ok) {
          log("skipped " + p.id + " (match_count_mismatch, matches=" + out.matches + " expected=" + out.expected + ")");
          results.push({ id: p.id, ok: false, reason: out.reason, matches: out.matches, file });
          continue;
        }
        next = out.content;
        results.push({ id: p.id, ok: true, matches: out.matches, file });
        log("applied " + p.id);
      } catch (e) {
        log("skipped " + p.id + " (" + (e && e.message) + ")");
        results.push({ id: p.id, ok: false, reason: String(e && e.message), file });
      }
    }
    return next;
  }

  function applyTransforms(src, file, phase) {
    let next = src;
    transforms
      .filter((t) => t.file === file && t.phase === phase)
      .forEach((t) => {
        try {
          const out = t.fn(next, { file, modId: t.modId, id: t.id });
          if (typeof out === "string") next = out;
        } catch (e) {
          log("transform skipped " + t.id + " (" + (e && e.message) + ")");
        }
      });
    return next;
  }

  function applyMainSource(rel, src) {
    const file = normalizeFile(rel);
    let next = src;
    next = applyTransforms(next, file, "early");
    next = applyList(next, sorted("early", file), file);
    next = applyList(next, sorted("late", file), file);
    next = applyTransforms(next, file, "late");
    return { content: next };
  }

  function hasMainPatches(rel) {
    const file = normalizeFile(rel);
    if (file.startsWith("js/") || file.startsWith("css/") || file === "index.html") {
      return false;
    }
    return queued.some((p) => p.file === file) || transforms.some((t) => t.file === file);
  }

  function isRendererFile(file) {
    const n = normalizeFile(file);
    return n.startsWith("js/") || n.startsWith("css/") || n === "index.html";
  }

  function getRendererStringPatches(phase) {
    return sorted(phase).filter((p) => isRendererFile(p.file) && typeof p.func !== "function");
  }

  function getRendererFiles() {
    const set = new Set();
    queued.forEach((p) => {
      if (isRendererFile(p.file)) set.add(p.file);
    });
    transforms.forEach((t) => {
      if (isRendererFile(t.file)) set.add(t.file);
    });
    return [...set];
  }

  function hasRendererWork() {
    return getRendererFiles().length > 0;
  }

  function readOriginal(rel) {
    return fs.readFileSync(asarPath(ctx.gameAsar, rel), "utf8");
  }

  function ensureRendererSources(sources, uiDir) {
    getRendererFiles().forEach((file) => {
      if (sources.has(file)) return;
      const abs = uiDir
        ? path.join(uiDir, file.replace(/^js\//, "js/").replace(/^css\//, "css/"))
        : asarPath(ctx.gameAsar, file);
      try {
        if (file === "index.html") {
          sources.set(file, fs.readFileSync(path.join(uiDir || path.join(ctx.gameAsar, "dist"), "index.html"), "utf8"));
        } else {
          sources.set(file, fs.readFileSync(abs, "utf8"));
        }
      } catch (e) {
        log("could not load " + file + " (" + (e && e.message) + ")");
      }
    });
  }

  function applyRendererTransforms(sources, phase) {
    getRendererFiles().forEach((file) => {
      if (!sources.has(file)) return;
      let next = sources.get(file);
      next = applyTransforms(next, file, phase);
      if (!normalizeFile(file).startsWith("js/")) {
        next = applyList(next, sorted(phase, file), file);
      }
      sources.set(file, next);
    });
  }

  function toSandkitPatches(phase) {
    return getRendererStringPatches(phase)
      .filter((p) => normalizeFile(p.file).startsWith("js/") && normalizeFile(p.file).endsWith(".js"))
      .map((p) => ({
      id: p.id,
      modId: p.modId,
      file: normalizeFile(p.file).startsWith("js/")
        ? normalizeFile(p.file)
        : normalizeFile(p.file),
      find: p.find,
      regex: p.regex,
      operation:
        p.operation === "prefix"
          ? "insertBefore"
          : p.operation === "postfix" || p.operation === "bodyPrefix"
            ? "insertAfter"
            : p.operation === "before"
              ? "insertBefore"
              : p.operation === "after"
                ? "insertAfter"
                : p.operation || "replace",
      code: p.code != null ? p.code : p.to,
      before: p.before,
      after: p.after,
      expectedMatches: p.expectedMatches == null ? 1 : p.expectedMatches,
    }));
  }

  function fluent(file) {
    const state = {
      file: normalizeFile(file),
      id: "",
      find: "",
      regex: null,
      operation: "",
      code: "",
      before: "",
      after: "",
      expectedMatches: 1,
      occurrence: "all",
      atomicGroup: "",
      priority: 0,
      phase: "late",
    };
    const api = {
      id(v) {
        state.id = v;
        return api;
      },
      find(v) {
        state.find = v;
        return api;
      },
      regex(pattern, flags) {
        state.regex = { pattern, flags: flags || "" };
        return api;
      },
      prefix(code) {
        state.operation = "insertBefore";
        state.code = code;
        return api;
      },
      postfix(code) {
        state.operation = "insertAfter";
        state.code = code;
        return api;
      },
      bodyPrefix(code) {
        state.operation = "bodyPrefix";
        state.code = code;
        return api;
      },
      replace(code) {
        state.operation = "replace";
        state.code = code;
        return api;
      },
      wrap(before, after) {
        state.operation = "wrap";
        state.before = before;
        state.after = after;
        return api;
      },
      remove() {
        state.operation = "remove";
        return api;
      },
      expect(n) {
        state.expectedMatches = n;
        return api;
      },
      occurrence(v) {
        state.occurrence = v;
        return api;
      },
      atomic(v) {
        state.atomicGroup = v;
        return api;
      },
      priority(n) {
        state.priority = n;
        return api;
      },
      phase(v) {
        state.phase = v;
        return api;
      },
      apply() {
        return add(state, state.modId);
      },
    };
    return api;
  }

  return {
    add,
    addNamed,
    unpatch,
    removeByMod,
    addTransform,
    getAssetOverride(rel) {
      const n = normalizeFile(rel);
      return assetOverrides.get(n) || assetOverrides.get(rel) || "";
    },
    assetFiles() {
      return [...assetOverrides.keys()];
    },
    loadFromMods,
    seal() {
      sealed = true;
    },
    unseal() {
      sealed = false;
    },
    isSealed() {
      return sealed;
    },
    applyMainSource,
    hasMainPatches,
    getRendererStringPatches,
    getRendererFiles,
    hasRendererWork,
    ensureRendererSources,
    applyRendererTransforms,
    toSandkitPatches,
    read: readOriginal,
    preview(file, find, around) {
      const src = readOriginal(file);
      const i = src.indexOf(find);
      const n = around || 80;
      let count = 0;
      let from = 0;
      while (from <= src.length) {
        const j = src.indexOf(find, from);
        if (j === -1) break;
        count += 1;
        from = j + Math.max(String(find).length, 1);
      }
      return {
        found: i !== -1,
        count,
        index: i,
        snippet: i === -1 ? "" : src.slice(Math.max(0, i - n), i + String(find).length + n),
        length: src.length,
      };
    },
    dump(file) {
      const destDir = path.join(ctx.sandustryData, "meta", "sandforge-patch-dump");
      fs.mkdirSync(destDir, { recursive: true });
      const dest = path.join(destDir, normalizeFile(file).replace(/\//g, "_"));
      fs.writeFileSync(dest, readOriginal(file), "utf8");
      return dest;
    },
    list() {
      return queued.slice();
    },
    status() {
      return {
        sealed,
        queued: queued.map((p) => ({ id: p.id, file: p.file, phase: p.phase })),
        results,
      };
    },
    fluent,
    normalizeFile,
  };
}

module.exports = { createPatcher, normalizeFile };
