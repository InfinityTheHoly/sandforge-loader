"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sfError, CODES } = require("./errors");

function allowedRoots(paths) {
  const roots = [paths.localModsRoot, paths.sandustryData, paths.loaderDir];
  (paths.workshopRoots || []).forEach((r) => roots.push(r));
  return roots.filter(Boolean);
}

function isInside(root, target) {
  const r = path.resolve(root) + path.sep;
  const t = path.resolve(target);
  return t === path.resolve(root) || t.toLowerCase().startsWith(r.toLowerCase());
}

function resolveAllowed(paths, relPath, extraRoots) {
  const rel = String(relPath || "").replace(/\\/g, "/");
  if (!rel || rel.includes("\0")) throw sfError(CODES.PATH_INVALID, "Invalid path");
  let abs;
  if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
    abs = path.resolve(rel);
  } else {
    abs = path.resolve(paths.localModsRoot, rel);
  }
  const roots = allowedRoots(paths).concat(extraRoots || []);
  for (let i = 0; i < roots.length; i++) {
    if (isInside(roots[i], abs)) return abs;
  }
  throw sfError(CODES.PATH_DENIED, "Path outside allowed folders");
}

function toBuffer(data) {
  if (data == null) throw new Error("Missing data");
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === "string") {
    if (data.indexOf("base64,") !== -1) {
      return Buffer.from(data.split("base64,")[1], "base64");
    }
    return Buffer.from(data, "utf8");
  }
  if (data && data.type === "Buffer" && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  if (typeof data === "object") return Buffer.from(JSON.stringify(data, null, 2), "utf8");
  throw new Error("Unsupported data");
}

function statInfo(abs) {
  const st = fs.statSync(abs);
  return {
    path: abs,
    size: st.size,
    isFile: st.isFile(),
    isDirectory: st.isDirectory(),
    mtimeMs: st.mtimeMs,
  };
}

function createFs(paths) {
  function resolve(rel) {
    return resolveAllowed(paths, rel);
  }
  return {
    resolve,
    exists(rel) {
      try {
        return fs.existsSync(resolve(rel));
      } catch (_) {
        return false;
      }
    },
    stat(rel) {
      return statInfo(resolve(rel));
    },
    readText(rel, encoding) {
      return fs.readFileSync(resolve(rel), encoding || "utf8");
    },
    readJson(rel, fallback) {
      try {
        return JSON.parse(fs.readFileSync(resolve(rel), "utf8"));
      } catch (_) {
        return fallback;
      }
    },
    readBinary(rel) {
      return fs.readFileSync(resolve(rel));
    },
    write(rel, data) {
      const dest = resolve(rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, toBuffer(data));
      return dest;
    },
    writeJson(rel, value) {
      return this.write(rel, JSON.stringify(value, null, 2));
    },
    append(rel, text) {
      const dest = resolve(rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.appendFileSync(dest, String(text ?? ""), "utf8");
      return dest;
    },
    mkdir(rel) {
      const dest = resolve(rel);
      fs.mkdirSync(dest, { recursive: true });
      return dest;
    },
    remove(rel) {
      const dest = resolve(rel);
      if (!fs.existsSync(dest)) return false;
      fs.rmSync(dest, { recursive: true, force: true });
      return true;
    },
    copy(from, to) {
      const src = resolve(from);
      const dest = resolve(to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      return dest;
    },
    list(rel) {
      const dest = rel ? resolve(rel) : paths.localModsRoot;
      return fs.readdirSync(dest, { withFileTypes: true }).map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory(),
        isFile: d.isFile(),
      }));
    },
    hash(rel, algo) {
      const buf = fs.readFileSync(resolve(rel));
      return crypto.createHash(algo || "sha256").update(buf).digest("hex");
    },
  };
}

function pathToFileUrl(p) {
  let s = String(p || "").replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(s)) return "file:///" + encodeURI(s);
  if (s.charAt(0) === "/") return "file://" + encodeURI(s);
  return "";
}

module.exports = {
  allowedRoots,
  isInside,
  resolveAllowed,
  toBuffer,
  createFs,
  pathToFileUrl,
};
