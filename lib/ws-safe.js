"use strict";

const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");

const OP_TEXT = 1;
const OP_BIN = 2;
const OP_CLOSE = 8;
const OP_PING = 9;
const OP_PONG = 10;

function connect(urlString, opts) {
  const u = new URL(String(urlString || ""));
  if (u.protocol !== "ws:" && u.protocol !== "wss:") {
    throw new Error("Only ws/wss URLs are allowed");
  }
  const secure = u.protocol === "wss:";
  const key = crypto.randomBytes(16).toString("base64");
  const emitter = new EventEmitter();
  let socket = null;
  let closed = false;
  let buf = Buffer.alloc(0);

  const headers = Object.assign(
    {
      Host: u.host,
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Key": key,
      "Sec-WebSocket-Version": "13",
    },
    (opts && opts.headers) || {},
  );

  const req = (secure ? https : http).request(
    {
      protocol: secure ? "https:" : "http:",
      hostname: u.hostname,
      port: Number(u.port) || (secure ? 443 : 80),
      path: (u.pathname || "/") + u.search,
      method: "GET",
      headers,
      timeout: Number(opts && opts.timeout) || 20000,
    },
  );

  const api = {
    url: u.toString(),
    on(ev, fn) {
      emitter.on(ev, fn);
      return api;
    },
    off(ev, fn) {
      emitter.off(ev, fn);
      return api;
    },
    send(data) {
      if (!socket || closed) throw new Error("Socket closed");
      const isBuf = Buffer.isBuffer(data);
      const payload = isBuf ? data : Buffer.from(String(data ?? ""), "utf8");
      socket.write(frame(isBuf ? OP_BIN : OP_TEXT, payload));
    },
    close(code, reason) {
      if (closed) return;
      closed = true;
      try {
        if (socket) {
          const r = Buffer.from(String(reason || ""), "utf8");
          const body = Buffer.alloc(2 + r.length);
          body.writeUInt16BE(Number(code) || 1000, 0);
          r.copy(body, 2);
          socket.write(frame(OP_CLOSE, body));
          socket.end();
        }
      } catch (_) {}
      emitter.emit("close", { code: Number(code) || 1000, reason: reason || "" });
    },
  };

  req.on("upgrade", (_res, sock) => {
    socket = sock;
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      buf = consume(buf, (op, payload) => {
        if (op === OP_PING) {
          try {
            sock.write(frame(OP_PONG, payload));
          } catch (_) {}
          return;
        }
        if (op === OP_CLOSE) {
          api.close();
          return;
        }
        if (op === OP_TEXT) emitter.emit("message", payload.toString("utf8"));
        if (op === OP_BIN) emitter.emit("message", payload);
      });
    });
    sock.on("close", () => api.close());
    sock.on("error", (e) => emitter.emit("error", e));
    emitter.emit("open");
  });
  req.on("error", (e) => emitter.emit("error", e));
  req.on("response", (res) => {
    emitter.emit("error", new Error("WebSocket upgrade failed " + res.statusCode));
    req.destroy();
  });
  req.end();
  return api;
}

function frame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(6);
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(8);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(14);
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  header[0] = 0x80 | opcode;
  const mask = crypto.randomBytes(4);
  mask.copy(header, header.length - 4);
  const out = Buffer.alloc(header.length + len);
  header.copy(out);
  for (let i = 0; i < len; i++) out[header.length + i] = payload[i] ^ mask[i & 3];
  return out;
}

function consume(buf, onMessage) {
  while (buf.length >= 2) {
    const op = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (buf.length < 4) break;
      len = buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (buf.length < 10) break;
      const hi = buf.readUInt32BE(2);
      const lo = buf.readUInt32BE(6);
      if (hi) throw new Error("WebSocket frame too large");
      len = lo;
      off = 10;
    }
    const maskOff = masked ? off : 0;
    if (masked) off += 4;
    if (buf.length < off + len) break;
    let payload = buf.slice(off, off + len);
    if (masked) {
      const mask = buf.slice(maskOff, maskOff + 4);
      const next = Buffer.alloc(len);
      for (let i = 0; i < len; i++) next[i] = payload[i] ^ mask[i & 3];
      payload = next;
    }
    buf = buf.slice(off + len);
    onMessage(op, payload);
  }
  return buf;
}

module.exports = { connect };
