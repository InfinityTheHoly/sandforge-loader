"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const MAX_GET = 8 * 1024 * 1024;
const MAX_DOWNLOAD = 32 * 1024 * 1024;

function parseUrl(urlString) {
  const parsed = new URL(String(urlString || ""));
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  return parsed;
}

function request(urlString, opts) {
  opts = opts || {};
  const parsed = parseUrl(urlString);
  const lib = parsed.protocol === "https:" ? https : http;
  const method = String(opts.method || "GET").toUpperCase();
  const limit = Number(opts.limit) || (method === "GET" ? MAX_GET : MAX_GET);
  const headers = Object.assign({}, opts.headers || {});
  let body = opts.body;
  if (body != null && typeof body !== "string" && !Buffer.isBuffer(body)) {
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    body = JSON.stringify(body);
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(
      parsed,
      { method, headers, timeout: Number(opts.timeout) || 20000 },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > limit) {
            req.destroy();
            reject(new Error("Response too large"));
          } else {
            chunks.push(c);
          }
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(opts.encoding || "utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    if (body != null) req.write(body);
    req.end();
  });
}

function httpGet(urlString, limit) {
  return request(urlString, { method: "GET", limit: limit || MAX_GET });
}

function httpPost(urlString, body, opts) {
  return request(urlString, Object.assign({ method: "POST", body }, opts || {}));
}

function download(urlString, destAbs, limit) {
  const parsed = parseUrl(urlString);
  const lib = parsed.protocol === "https:" ? https : http;
  const max = Number(limit) || MAX_DOWNLOAD;
  return new Promise((resolve, reject) => {
    const req = lib.get(parsed, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        download(res.headers.location, destAbs, max).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        req.destroy();
        reject(new Error("HTTP " + res.statusCode));
        return;
      }
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      const out = fs.createWriteStream(destAbs);
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        if (size > max) {
          req.destroy();
          out.destroy();
          try {
            fs.unlinkSync(destAbs);
          } catch (_) {}
          reject(new Error("Download too large"));
        }
      });
      res.pipe(out);
      out.on("finish", () => resolve({ path: destAbs, bytes: size, status: res.statusCode }));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

module.exports = { request, httpGet, httpPost, download, MAX_GET, MAX_DOWNLOAD };
