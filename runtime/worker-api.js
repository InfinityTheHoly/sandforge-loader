/**
 * Worker-world SandForge API. Prepended to manager + simulation workers.
 */
(function () {
  if (typeof self !== "undefined" && self.__SANDFORGE_WORKER_API__) return;
  if (typeof self !== "undefined") self.__SANDFORGE_WORKER_API__ = true;

  var listeners = {};
  function on(channel, fn) {
    var ch = String(channel || "");
    if (!ch || typeof fn !== "function") return function () {};
    if (!listeners[ch]) listeners[ch] = [];
    listeners[ch].push(fn);
    return function () {
      off(ch, fn);
    };
  }

  function off(channel, fn) {
    var list = listeners[String(channel || "")];
    if (!list) return;
    var i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  function once(channel, fn) {
    var wrap = function (data) {
      off(channel, wrap);
      fn(data);
    };
    return on(channel, wrap);
  }

  if (typeof self !== "undefined" && self.addEventListener) {
    self.addEventListener("message", function (ev) {
      var data = ev && ev.data;
      if (!data || data.__sf !== 1) return;
      var list = listeners[String(data.channel || "")] || [];
      for (var i = 0; i < list.length; i++) {
        try {
          list[i](data.payload);
        } catch (e) {
          console.error("[sandforge-worker] event", e);
        }
      }
    });
  }

  function sk() {
    try {
      return typeof sandkit !== "undefined" ? sandkit : null;
    } catch (_) {
      return null;
    }
  }

  function rpc(payload) {
    return fetch("sandforge://loader/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (!data || data.ok === false) {
        throw new Error((data && data.error) || "RPC failed");
      }
      return data.result;
    });
  }

  var api = {
    version: "1.0.0",
    apiVersion: "1.0.0",
    apiLevel: 1,
    environment: "worker",
    isLoader: true,
    invoke: function (channel) {
      var args = Array.prototype.slice.call(arguments, 1);
      return rpc({ kind: "invoke", channel: channel, args: args });
    },
    rpc: function (ns, method, args) {
      return rpc({ ns: ns, method: method, args: args || [] });
    },
    dispatch: function (ns, method, args) {
      return api.rpc(ns, method, args);
    },
    fs: {
      exists: function (rel) { return rpc({ ns: "fs", method: "exists", args: [rel] }); },
      readText: function (rel) { return rpc({ ns: "fs", method: "readText", args: [rel] }); },
      readJson: function (rel, fallback) { return rpc({ ns: "fs", method: "readJson", args: [rel, fallback] }); },
      write: function (rel, data) { return rpc({ ns: "fs", method: "write", args: [rel, data] }); },
      list: function (rel) { return rpc({ ns: "fs", method: "list", args: [rel] }); },
    },
    on: on,
    off: off,
    once: once,
    listenGameMessage: on,
    sendGameMessage: function (channel, payload) {
      try {
        self.postMessage({ __sf: 1, channel: String(channel || ""), payload: payload });
      } catch (e) {
        console.error("[sandforge-worker] send failed", e);
      }
    },
    emit: function (channel, payload) {
      api.sendGameMessage(channel, payload);
    },
    log: function (level, message) {
      console.log("[sandforge-worker][" + (level || "info") + "] " + message);
    },
    get sandkit() {
      return sk();
    },
    get api() {
      var s = sk();
      return s && s.api ? s.api : null;
    },
    now: function () {
      return Date.now();
    },
    util: {
      clamp: function (n, min, max) {
        return Math.max(min, Math.min(max, n));
      },
      lerp: function (a, b, t) {
        return a + (b - a) * t;
      },
    },
  };

  var workerGen = 0;
  function pollWorkerReload() {
    if (typeof fetch !== "function") return;
    rpc({ ns: "workers", method: "boot", args: [self.__SF_WORKER_KIND__ || ""] })
      .then(function (boot) {
        if (!boot || boot.generation === workerGen) return;
        workerGen = boot.generation;
        var rows = boot.entries || [];
        for (var i = 0; i < rows.length; i++) {
          try {
            (0, eval)(rows[i].source + "\n//# sourceURL=sandforge-worker/" + rows[i].id);
          } catch (e) {
            console.error("[sandforge-worker] reload", rows[i].id, e);
          }
        }
      })
      .catch(function () {});
  }
  if (typeof setInterval === "function") {
    setInterval(pollWorkerReload, 4000);
  }

  if (typeof self !== "undefined") {
    self.sandforge = api;
    self.sandforgeAPI = api;
    self.SandforgeWorker = api;
  }
})();
