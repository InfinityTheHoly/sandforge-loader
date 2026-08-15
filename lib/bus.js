"use strict";

/**
 * Process-wide inter-mod bus. Electron plugins share one instance.
 * Emits also fan out to every renderer as sandforge-event.
 */
function createBus(sendGameEvent) {
  const listeners = Object.create(null);

  function on(channel, fn) {
    const ch = String(channel || "");
    if (!ch || typeof fn !== "function") return function () {};
    if (!listeners[ch]) listeners[ch] = [];
    listeners[ch].push(fn);
    return function () {
      off(ch, fn);
    };
  }

  function off(channel, fn) {
    const list = listeners[String(channel || "")];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  function once(channel, fn) {
    const wrap = function (data) {
      off(channel, wrap);
      fn(data);
    };
    return on(channel, wrap);
  }

  function emit(channel, data, opts) {
    const ch = String(channel || "");
    const list = (listeners[ch] || []).slice();
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (e) {
        console.error("[sandforge-bus]", ch, e);
      }
    }
    if (!opts || opts.broadcast !== false) {
      try {
        sendGameEvent(ch, data);
      } catch (_) {}
    }
    return list.length;
  }

  function channels() {
    return Object.keys(listeners);
  }

  return { on, off, once, emit, channels };
}

module.exports = { createBus };
