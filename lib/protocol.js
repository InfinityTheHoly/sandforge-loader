"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileUrl, isInside } = require("./safe-io");

function mimeFor(rel) {
  const n = String(rel || "").toLowerCase();
  if (/\.html?$/.test(n)) return "text/html; charset=utf-8";
  if (/\.js$/.test(n)) return "application/javascript; charset=utf-8";
  if (/\.mjs$/.test(n)) return "application/javascript; charset=utf-8";
  if (/\.css$/.test(n)) return "text/css; charset=utf-8";
  if (/\.json$/.test(n)) return "application/json; charset=utf-8";
  if (/\.png$/.test(n)) return "image/png";
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (/\.gif$/.test(n)) return "image/gif";
  if (/\.webp$/.test(n)) return "image/webp";
  if (/\.svg$/.test(n)) return "image/svg+xml";
  if (/\.ico$/.test(n)) return "image/x-icon";
  if (/\.woff2$/.test(n)) return "font/woff2";
  if (/\.woff$/.test(n)) return "font/woff";
  if (/\.ttf$/.test(n)) return "font/ttf";
  if (/\.otf$/.test(n)) return "font/otf";
  if (/\.wasm$/.test(n)) return "application/wasm";
  if (/\.mp3$/.test(n)) return "audio/mpeg";
  if (/\.ogg$/.test(n)) return "audio/ogg";
  if (/\.wav$/.test(n)) return "audio/wav";
  if (/\.mp4$/.test(n)) return "video/mp4";
  if (/\.webm$/.test(n)) return "video/webm";
  if (/\.map$/.test(n)) return "application/json";
  return "application/octet-stream";
}

function registerPrivilegedSchemes() {
  let protocol;
  try {
    protocol = require("electron").protocol;
    if (!protocol || typeof protocol.registerSchemesAsPrivileged !== "function") {
      return;
    }
    protocol.registerSchemesAsPrivileged([
      {
        scheme: "sandforge",
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      },
      {
        scheme: "sandforge-ui",
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
          allowServiceWorkers: true,
        },
      },
      {
        scheme: "sandustry-patch",
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          corsEnabled: true,
        },
      },
    ]);
  } catch (e) {
    console.warn("[sandforge-loader] registerSchemesAsPrivileged", e);
  }
  try {
    if (protocol) protocol.registerSchemesAsPrivileged = function () {};
  } catch (_) {}
}

function findMod(ctx, key) {
  const h = String(key || "");
  if (!h) return null;
  return (
    ctx.mods.find(
      (x) =>
        x.id === h ||
        x.folderName === h ||
        String(x.workshopId || "") === h,
    ) || null
  );
}

function resolveSandforgeUrl(ctx, urlString) {
  const u = new URL(String(urlString || ""));
  if (u.protocol !== "sandforge:") throw new Error("Not a sandforge URL");
  const host = decodeURIComponent(u.hostname || "");
  const parts = decodeURIComponent(u.pathname || "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error("Invalid path");
  }

  let root;
  let relParts;
  if (host === "mod" || host === "mods") {
    const id = parts[0];
    const m = findMod(ctx, id);
    if (!m) throw new Error("Unknown mod " + id);
    root = m.dir;
    relParts = parts.slice(1);
  } else if (host === "data") {
    root = ctx.paths.sandustryData;
    relParts = parts;
  } else if (host === "loader") {
    root = ctx.paths.loaderDir;
    relParts = parts;
  } else {
    const m = findMod(ctx, host);
    if (!m) throw new Error("Unknown host " + host);
    root = m.dir;
    relParts = parts;
  }
  const abs = path.resolve(root, ...relParts);
  if (!isInside(root, abs)) throw new Error("Path outside allowed folders");
  return abs;
}

function assetUrl(modId, rel) {
  const id = encodeURIComponent(String(modId || ""));
  const rest = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== ".." && p !== ".")
    .map(encodeURIComponent)
    .join("/");
  return "sandforge://" + id + "/" + rest;
}

function resolveGameUiRel(urlString) {
  const u = new URL(String(urlString || ""));
  if (u.protocol !== "sandforge-ui:") throw new Error("Not a sandforge-ui URL");
  const host = decodeURIComponent(u.hostname || "");
  if (host && host !== "game") throw new Error("Unknown UI host " + host);
  const parts = decodeURIComponent(u.pathname || "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (host !== "game" && parts[0] === "game") parts.shift();
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error("Invalid path");
  }
  return parts.join("/");
}

function readGameUi(ctx, rel) {
  const n = String(rel || "").replace(/\\/g, "/");
  if (ctx.patcher && typeof ctx.patcher.getAssetOverride === "function") {
    const override = ctx.patcher.getAssetOverride(n);
    if (override && fs.existsSync(override)) return fs.readFileSync(override);
  }
  const patched = global.__SANDFORGE_PATCHED_UI__;
  if (patched && typeof patched.get === "function" && patched.has(n)) {
    const content = patched.get(n);
    if (Buffer.isBuffer(content)) return content;
    return Buffer.from(String(content), "utf8");
  }
  const dist = ctx.paths.uiDir || path.join(ctx.paths.gameAsar, "dist");
  const abs = path.resolve(dist, n);
  if (!isInside(dist, abs) && !isInside(ctx.paths.gameAsar, abs)) {
    throw new Error("Path outside game UI");
  }
  return fs.readFileSync(abs);
}

function fileUrlToPath(urlString) {
  const u = new URL(String(urlString || ""));
  if (u.protocol !== "file:") return "";
  let filePath = decodeURIComponent(u.pathname || "");
  if (process.platform === "win32") {
    if (filePath.startsWith("/") && /^\/[A-Za-z]:/.test(filePath)) {
      filePath = filePath.slice(1);
    }
    filePath = filePath.replace(/\//g, "\\");
  }
  return path.normalize(filePath);
}

function redirectFilePath(ctx, filePath) {
  if (!filePath) return "";
  const abs = path.resolve(filePath);
  const dist = ctx.paths.uiDir;
  if (dist && isInside(dist, abs)) {
    const rel = path.relative(dist, abs).replace(/\\/g, "/");
    if (!rel || rel.indexOf("..") === 0) return "";
    return "sandforge-ui://game/" + rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }
  const asar = ctx.paths.gameAsar;
  if (asar && isInside(asar, abs)) {
    let rel = path.relative(asar, abs).replace(/\\/g, "/");
    if (rel.indexOf("dist/") === 0) rel = rel.slice(5);
    if (!rel || rel.indexOf("..") === 0) return "";
    return "sandforge-ui://game/" + rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }
  const mods = ctx.mods || [];
  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    if (!m || !m.dir || !isInside(m.dir, abs)) continue;
    const rel = path.relative(m.dir, abs).replace(/\\/g, "/");
    if (!rel || rel.indexOf("..") === 0) continue;
    return assetUrl(m.id, rel);
  }
  return "";
}

function installFileRedirect(ctx) {
  global.__SANDFORGE_REDIRECT_FILE__ = function (filePath) {
    try {
      return redirectFilePath(ctx, filePath) || "";
    } catch (_) {
      return "";
    }
  };
}

async function handleLoaderRpc(ctx, request) {
  const u = new URL(String(request.url || ""));
  const host = decodeURIComponent(u.hostname || "");
  const rel = decodeURIComponent(u.pathname || "").replace(/^\/+/, "");
  if (host !== "loader" || (rel !== "rpc" && rel !== "api")) {
    return new Response("Not an RPC endpoint", { status: 404 });
  }
  let payload = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch (_) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    let result;
    if (payload.kind === "invoke") {
      if (typeof ctx.invokeIpc !== "function") throw new Error("invoke unavailable");
      result = await ctx.invokeIpc(payload.channel, payload.args || []);
    } else {
      if (typeof ctx.dispatch !== "function") throw new Error("dispatch unavailable");
      result = await ctx.dispatch(payload.ns, payload.method, payload.args || []);
    }
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
}

function installProtocol(ctx) {
  const { protocol, net, app } = require("electron");
  installFileRedirect(ctx);

  function attach() {
    const resolve = (url) => resolveSandforgeUrl(ctx, url);
    if (typeof protocol.handle === "function") {
      protocol.handle("sandforge", async (request) => {
        try {
          if (String(request.method || "GET").toUpperCase() === "POST") {
            return handleLoaderRpc(ctx, request);
          }
          const abs = resolve(request.url);
          if (typeof net.fetch === "function") {
            return net.fetch(pathToFileUrl(abs));
          }
          const body = fs.readFileSync(abs);
          return new Response(body, { status: 200 });
        } catch (e) {
          return new Response(String(e.message || e), { status: 404 });
        }
      });
      protocol.handle("sandforge-ui", (request) => {
        try {
          const rel = resolveGameUiRel(request.url);
          const body = readGameUi(ctx, rel);
          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": mimeFor(rel),
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-cache",
            },
          });
        } catch (e) {
          return new Response(String(e.message || e), { status: 404 });
        }
      });
      return;
    }
    if (typeof protocol.registerFileProtocol === "function") {
      protocol.registerFileProtocol("sandforge", (request, callback) => {
        try {
          callback({ path: resolve(request.url) });
        } catch (_) {
          callback({ error: -6 });
        }
      });
    }
  }

  if (app.isReady()) attach();
  else app.whenReady().then(attach).catch((e) => {
    console.warn("[sandforge-loader] protocol attach failed", e);
  });

  return { resolveUrl: (url) => resolveSandforgeUrl(ctx, url), assetUrl };
}

module.exports = {
  registerPrivilegedSchemes,
  resolveSandforgeUrl,
  resolveGameUiRel,
  assetUrl,
  fileUrlToPath,
  redirectFilePath,
  installFileRedirect,
  installProtocol,
};
