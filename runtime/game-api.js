/**
 * Page-world SandForge API. Injected before game entrypoints.
 * Wraps official Sandkit plus loader IPC.
 */
(function () {
  if (window.__SANDFORGE_GAME_API__) return;
  window.__SANDFORGE_GAME_API__ = true;
  try {
    window.__SF_HOST__ = window.__SF_HOST__ || { loader: true, version: "1.0.0" };
    window.__SANDFORGE_LOADER__ = window.__SANDFORGE_LOADER__ || window.__SF_HOST__;
  } catch (_) {}

  var VERSION = "1.0.0";
  var GITHUB_URL = "https://github.com/sandforge/sandforge-loader";
  var listeners = {};
  var commands = {};
  var tickers = [];
  var sceneWatchers = [];
  var lastScene = null;
  var cssIds = {};

  function installDetect() {
    try {
      window.__SF_HOST__ = window.__SF_HOST__ || { loader: true, version: VERSION };
      window.__SANDFORGE_LOADER__ = window.__SF_HOST__;
      var gate = window.SandforgeLoader || {};
      gate.has = function () {
        return true;
      };
      gate.GITHUB_URL = gate.GITHUB_URL || GITHUB_URL;
      if (typeof gate.openGithub !== "function") {
        gate.openGithub = function () {
          try {
            if (window.sandforge && window.sandforge.shell && window.sandforge.shell.openUrl) {
              window.sandforge.shell.openUrl(GITHUB_URL);
              return;
            }
          } catch (_) {}
          try {
            window.open(GITHUB_URL, "_blank");
          } catch (_) {}
        };
      }
      window.SandforgeLoader = gate;
    } catch (_) {}
  }
  installDetect();

  function bridge() {
    return window.sandforge || window.sandforgeAPI || null;
  }

  function sk() {
    try {
      return typeof sandkit !== "undefined" && sandkit.api ? sandkit.api : null;
    } catch (_) {
      return null;
    }
  }

  function engine() {
    try {
      return typeof sandkit !== "undefined" ? sandkit.engine : null;
    } catch (_) {
      return null;
    }
  }

  function call(ns, method, args) {
    var b = bridge();
    if (!b || typeof b.api !== "function") {
      return Promise.reject(new Error("Loader bridge missing"));
    }
    return b.api(ns, method, args || []);
  }

  function onEvent(channel, fn) {
    var ch = String(channel || "");
    if (!listeners[ch]) listeners[ch] = [];
    listeners[ch].push(fn);
    return function () {
      listeners[ch] = (listeners[ch] || []).filter(function (x) {
        return x !== fn;
      });
    };
  }

  function emitLocal(channel, data) {
    var list = listeners[String(channel || "")] || [];
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](data);
      } catch (e) {
        console.error("[sandforge-game] event", channel, e);
      }
    }
  }

  if (bridge() && typeof bridge().handleElectronEvent === "function") {
    try {
      var orig = bridge().handleElectronEvent.bind(bridge());
      bridge().handleElectronEvent = function (channel, handler) {
        onEvent(channel, handler);
        return orig(channel, handler);
      };
    } catch (_) {}
  }

  function wrapNs(obj, names) {
    var out = {};
    names.forEach(function (name) {
      Object.defineProperty(out, name, {
        enumerable: true,
        get: function () {
          var a = sk();
          return a && a[name] ? a[name] : null;
        },
      });
    });
    return out;
  }

  var sandkitNames = [
    "action",
    "assets",
    "authorization",
    "building",
    "camera",
    "collector",
    "cooldown",
    "discoveries",
    "effects",
    "elements",
    "energy",
    "excavation",
    "events",
    "fire",
    "gameConfig",
    "grid",
    "hooks",
    "i18n",
    "input",
    "items",
    "lights",
    "maps",
    "mods",
    "patterns",
    "player",
    "processing",
    "progression",
    "projectiles",
    "random",
    "raycast",
    "reactions",
    "rendering",
    "resources",
    "schedule",
    "scene",
    "settings",
    "signals",
    "sound",
    "sprites",
    "storage",
    "structureBehaviors",
    "structures",
    "tech",
    "time",
    "tools",
    "terrains",
    "triggers",
    "ui",
    "upgrades",
    "utils",
    "world",
    "shared",
    "workers",
  ];

  var game = wrapNs({}, sandkitNames);
  game.sandkit = function () {
    return sk();
  };
  game.engine = function () {
    return engine();
  };
  game.debug = function () {
    return window.__debug || null;
  };
  game.instance = function () {
    if (window.__debug) return window.__debug;
    var e = engine();
    return e && e.state ? e : null;
  };

  var ui = {
    toast: function (msg, opts) {
      var a = sk();
      if (a && a.ui && a.ui.toast) return a.ui.toast(msg, opts);
      console.log("[sandforge]", msg);
    },
    alert: function (msg, title) {
      var a = sk();
      if (a && a.ui && a.ui.alert) return a.ui.alert(msg, title);
      window.alert(msg);
      return Promise.resolve();
    },
    confirm: function (msg, title) {
      var a = sk();
      if (a && a.ui && a.ui.confirm) return a.ui.confirm(msg, title);
      return Promise.resolve(window.confirm(msg));
    },
    prompt: function (msg, def) {
      var a = sk();
      if (a && a.ui && a.ui.prompt) return a.ui.prompt(msg, def);
      return Promise.resolve(window.prompt(msg, def));
    },
    inject: function (id, component) {
      var a = sk();
      if (a && a.ui && a.ui.inject) return a.ui.inject(id, component);
      throw new Error("sandkit.api.ui.inject unavailable");
    },
    css: function (id, css) {
      var el = document.getElementById("sf-css-" + id);
      if (!el) {
        el = document.createElement("style");
        el.id = "sf-css-" + id;
        document.head.appendChild(el);
      }
      el.textContent = String(css || "");
      cssIds[id] = el;
      return function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        delete cssIds[id];
      };
    },
    overlay: function (id, html) {
      var el = document.getElementById("sf-overlay-" + id);
      if (!el) {
        el = document.createElement("div");
        el.id = "sf-overlay-" + id;
        el.setAttribute(
          "style",
          "position:fixed;inset:0;z-index:2147483000;pointer-events:none;",
        );
        document.body.appendChild(el);
      }
      el.innerHTML = String(html || "");
      return {
        el: el,
        remove: function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        },
        html: function (next) {
          el.innerHTML = String(next || "");
        },
      };
    },
    panel: function (id, opts) {
      opts = opts || {};
      var el = document.getElementById("sf-panel-" + id);
      if (!el) {
        el = document.createElement("div");
        el.id = "sf-panel-" + id;
        el.setAttribute(
          "style",
          "position:fixed;z-index:2147483001;pointer-events:auto;background:rgba(0,0,0,0.86);color:#fff;border:1px solid #94a3b8;padding:10px 12px;font:13px/1.4 Segoe UI,sans-serif;" +
            (opts.style || ""),
        );
        document.body.appendChild(el);
      }
      if (opts.html != null) el.innerHTML = opts.html;
      return el;
    },
    remove: function (id) {
      ["sf-css-", "sf-overlay-", "sf-panel-"].forEach(function (p) {
        var el = document.getElementById(p + id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    },
  };

  var input = {
    bind: function (id, keys, handlers) {
      var a = sk();
      if (!a || !a.input || !a.input.registerBinding) {
        throw new Error("sandkit.api.input unavailable");
      }
      return a.input.registerBinding(id, keys, {
        category: (handlers && handlers.category) || "Mod",
        handlers: handlers || {},
      });
    },
    mouseCell: function () {
      var a = sk();
      return a && a.input ? a.input.getMouseCellPosition() : null;
    },
    onKey: function (code, fn) {
      function handler(e) {
        if (e.code === code || e.key === code) fn(e);
      }
      window.addEventListener("keydown", handler);
      return function () {
        window.removeEventListener("keydown", handler);
      };
    },
  };

  var scene = {
    get: function () {
      var a = sk();
      if (a && a.scene && a.scene.getActive) return a.scene.getActive();
      return null;
    },
    onChange: function (fn) {
      sceneWatchers.push(fn);
      return function () {
        sceneWatchers = sceneWatchers.filter(function (x) {
          return x !== fn;
        });
      };
    },
    isMenu: function () {
      var s = this.get();
      return s === 1 || s === "MainMenu" || s === "mainmenu";
    },
  };

  var tick = {
    every: function (ms, fn) {
      var id = setInterval(fn, ms);
      tickers.push(id);
      return function () {
        clearInterval(id);
      };
    },
    next: function (fn) {
      var a = sk();
      if (a && a.schedule && a.schedule.nextTick) return a.schedule.nextTick(fn);
      return requestAnimationFrame(fn);
    },
    onFrame: function (fn) {
      var live = true;
      function loop() {
        if (!live) return;
        try {
          fn();
        } catch (e) {
          console.error(e);
        }
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      return function () {
        live = false;
      };
    },
  };

  var cmd = {
    register: function (name, fn, help) {
      commands[String(name)] = { fn: fn, help: help || "" };
    },
    run: function (name, args) {
      var c = commands[String(name)];
      if (!c) throw new Error("Unknown command " + name);
      return c.fn(args || []);
    },
    list: function () {
      return Object.keys(commands).map(function (k) {
        return { name: k, help: commands[k].help };
      });
    },
  };

  var hooks = {
    intercept: function (id, fn, opts) {
      var a = sk();
      if (!a || !a.hooks) throw new Error("sandkit.api.hooks unavailable");
      return a.hooks.intercept(id, fn, opts);
    },
    modify: function (id, fn, opts) {
      var a = sk();
      if (!a || !a.hooks) throw new Error("sandkit.api.hooks unavailable");
      return a.hooks.modify(id, fn, opts);
    },
  };

  function pickFn(obj, names) {
    if (!obj) return null;
    for (var i = 0; i < names.length; i++) {
      if (typeof obj[names[i]] === "function") return obj[names[i]].bind(obj);
    }
    return null;
  }

  var world = {
    player: function () {
      var a = sk();
      if (!a || !a.player) return null;
      var fn = pickFn(a.player, ["get", "getPlayer", "current"]);
      return fn ? fn() : a.player;
    },
    camera: function () {
      var a = sk();
      if (!a || !a.camera) return null;
      var fn = pickFn(a.camera, ["get", "getCamera", "current"]);
      return fn ? fn() : a.camera;
    },
    cell: function (x, y) {
      var a = sk();
      if (!a || !a.grid) return null;
      var fn = pickFn(a.grid, ["get", "getCell", "at"]);
      return fn ? fn(x, y) : null;
    },
    setCell: function (x, y, value) {
      var a = sk();
      if (!a || !a.grid) throw new Error("sandkit.api.grid unavailable");
      var fn = pickFn(a.grid, ["set", "setCell", "put"]);
      if (!fn) throw new Error("grid setter unavailable");
      return fn(x, y, value);
    },
    mouseCell: function () {
      return input.mouseCell();
    },
  };

  var i18nOverlay = {};
  var i18n = {
    add: function (key, value, locale) {
      var loc = locale || "*";
      if (!i18nOverlay[loc]) i18nOverlay[loc] = {};
      i18nOverlay[loc][key] = value;
      var a = sk();
      if (a && a.i18n && typeof a.i18n.add === "function") {
        try {
          a.i18n.add(key, value, locale);
        } catch (_) {}
      }
    },
    t: function (key, fallback) {
      var a = sk();
      if (a && a.i18n) {
        var fn = pickFn(a.i18n, ["t", "translate", "get"]);
        if (fn) {
          try {
            var v = fn(key);
            if (v != null && v !== key) return v;
          } catch (_) {}
        }
      }
      if (i18nOverlay["*"] && i18nOverlay["*"][key] != null) return i18nOverlay["*"][key];
      return fallback != null ? fallback : key;
    },
  };

  var audio = {
    play: function (src, opts) {
      opts = opts || {};
      if (typeof src === "string" && window.__SF_rewriteFileUrls) {
        src = window.__SF_rewriteFileUrls(src);
      } else if (typeof src === "string" && /^file:/i.test(src) && window.__SF_fileUrlToSandforge) {
        src = window.__SF_fileUrlToSandforge(src);
      }
      var el = new Audio(src);
      el.volume = opts.volume == null ? 1 : Number(opts.volume);
      el.loop = !!opts.loop;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
      return el;
    },
  };

  function makeAssets(ownerFn) {
    var out = {
      url: function (rel, modId) {
        var id = ownerFn(modId);
        return "sandforge://" + encodeURIComponent(id) + "/" + String(rel || "").replace(/^\/+/, "");
      },
      image: function (rel, modId) {
        var img = new Image();
        img.src = out.url(rel, modId);
        return img;
      },
      audio: function (rel, modId) {
        return new Audio(out.url(rel, modId));
      },
      fileUrl: function (rel, modId) {
        return out.url(rel, modId);
      },
    };
    return out;
  }

  var workers = {
    reload: function () { return call("workers", "reload", []); },
    on: function (fn) {
      function handler(ev) {
        var data = ev && ev.data;
        if (!data || data.__sf !== 1) return;
        fn(data.channel, data.payload);
      }
      window.addEventListener("message", handler);
      return function () {
        window.removeEventListener("message", handler);
      };
    },
  };

  var util = {
    clamp: function (n, min, max) {
      return Math.max(min, Math.min(max, n));
    },
    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },
    deepClone: function (v) {
      return JSON.parse(JSON.stringify(v));
    },
    uid: function () {
      if (crypto.randomUUID) return crypto.randomUUID();
      return "sf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    },
    debounce: function (fn, ms) {
      var t;
      return function () {
        var args = arguments;
        var ctx = this;
        clearTimeout(t);
        t = setTimeout(function () {
          fn.apply(ctx, args);
        }, ms);
      };
    },
  };

  var sandkitAssetsWrapped = false;
  function fileUrlToSandforge(url) {
    var raw = String(url || "");
    if (!/^file:/i.test(raw)) return raw;
    try {
      var path = decodeURIComponent(raw.replace(/^file:\/+/i, "")).replace(/\\/g, "/");
      var mods = path.match(/\/mods\/([^/]+)\/(.+)$/i);
      if (mods) {
        return "sandforge://" + encodeURIComponent(mods[1]) + "/" + mods[2];
      }
      var workshop = path.match(/\/workshop\/content\/\d+\/(\d+)\/(.+)$/i);
      if (workshop) {
        return "sandforge://" + encodeURIComponent(workshop[1]) + "/" + workshop[2];
      }
    } catch (_) {}
    return raw;
  }

  function wrapSandkitAssets() {
    if (sandkitAssetsWrapped || window.__SF_ASSETS_WRAPPED__) {
      sandkitAssetsWrapped = true;
      return;
    }
    var a = sk();
    if (!a || !a.assets || typeof a.assets.getUrl !== "function") return;
    var orig = a.assets.getUrl.bind(a.assets);
    a.assets.getUrl = function (rel) {
      var url = orig(rel);
      var rewritten = (window.__SF_fileUrlToSandforge || fileUrlToSandforge)(url);
      if (rewritten && rewritten !== url) return rewritten;
      try {
        if (window.__SF_CURRENT_MOD__ && (!url || /^file:/i.test(String(url)))) {
          return (
            "sandforge://" +
            encodeURIComponent(window.__SF_CURRENT_MOD__) +
            "/" +
            String(rel || "").replace(/^\/+/, "")
          );
        }
      } catch (_) {}
      return url;
    };
    sandkitAssetsWrapped = true;
    window.__SF_ASSETS_WRAPPED__ = true;
  }

  var sandkitModsWrapped = false;
  function wrapSandkitMods() {
    if (sandkitModsWrapped) return;
    var a = sk();
    if (!a || !a.mods) return;
    var names = ["list", "getAll", "getMods", "getInstalled"];
    var i;
    for (i = 0; i < names.length; i++) {
      if (typeof a.mods[names[i]] === "function") {
        (function (name) {
          var orig = a.mods[name].bind(a.mods);
          a.mods[name] = function () {
            var rows = orig.apply(a.mods, arguments);
            var off = window.__SF_DISABLED__ || [];
            if (!off.length || !Array.isArray(rows)) return rows;
            return rows.filter(function (m) {
              var id = m && (m.id || m.modID || (m.info && m.info.id) || (m.manifest && m.manifest.id));
              return !id || off.indexOf(String(id)) === -1;
            });
          };
        })(names[i]);
        sandkitModsWrapped = true;
      }
    }
  }

  setInterval(function () {
    wrapSandkitAssets();
    wrapSandkitMods();
    var now = scene.get();
    if (now !== lastScene) {
      var prev = lastScene;
      lastScene = now;
      sceneWatchers.forEach(function (fn) {
        try {
          fn(now, prev);
        } catch (e) {
          console.error(e);
        }
      });
      emitLocal("sf:scene-loaded", now);
      var b = bridge();
      if (b && typeof b.handleElectronEvent === "function") {
        /* already local */
      }
    }
  }, 200);

  window.addEventListener("keydown", function (e) {
    if (e.key === "`" && e.ctrlKey) {
      var names = cmd.list().map(function (c) {
        return c.name + (c.help ? " — " + c.help : "");
      });
      var pick = window.prompt("SandForge command:\n" + names.join("\n"));
      if (!pick) return;
      var parts = pick.trim().split(/\s+/);
      try {
        var result = cmd.run(parts[0], parts.slice(1));
        console.log("[sandforge-cmd]", parts[0], result);
      } catch (err) {
        console.error("[sandforge-cmd]", err);
      }
    }
  });

  function buildApi(boundModId) {
    boundModId = String(boundModId || "");
    function owner(explicit) {
      return String(explicit || boundModId || "");
    }
    var ownedAssets = makeAssets(owner);
  var api = {
    version: VERSION,
    apiVersion: VERSION,
    apiLevel: 1,
    environment: "game",
    isLoader: true,
    isWrapper: true,
    get modId() {
      return owner();
    },
    bind: function (id) {
      return publishApi(buildApi(id));
    },
    get sandkit() {
      return typeof sandkit !== "undefined" ? sandkit : null;
    },
    get react() {
      try {
        return sandkit && sandkit.react;
      } catch (_) {
        return null;
      }
    },
    get enums() {
      try {
        return sandkit && sandkit.enums;
      } catch (_) {
        return null;
      }
    },
    game: game,
    ui: ui,
    input: input,
    scene: scene,
    tick: tick,
    commands: cmd,
    hooks: hooks,
    world: world,
    i18n: i18n,
    audio: audio,
    assets: ownedAssets,
    workers: workers,
    util: util,
    events: {
      on: onEvent,
      emit: emitLocal,
    },
    invoke: function (channel) {
      var args = Array.prototype.slice.call(arguments, 1);
      var b = bridge();
      if (!b || typeof b.invoke !== "function") {
        return Promise.reject(new Error("invoke unavailable"));
      }
      return b.invoke.apply(b, [channel].concat(args));
    },
    send: function (channel, data) {
      return call("windows", "broadcast", [channel, data]);
    },
    on: onEvent,
    emit: function (channel, data) {
      return call("windows", "broadcast", [channel, data]);
    },
    rpc: function (ns, method, args) {
      return call(ns, method, args);
    },
    api: function (ns, method, args) {
      return call(ns, method, args);
    },
    fs: {
      exists: function (rel) { return call("fs", "exists", [rel]); },
      stat: function (rel) { return call("fs", "stat", [rel]); },
      readText: function (rel) { return call("fs", "readText", [rel]); },
      readJson: function (rel, fallback) { return call("fs", "readJson", [rel, fallback]); },
      write: function (rel, data) { return call("fs", "write", [rel, data]); },
      writeJson: function (rel, value) { return call("fs", "writeJson", [rel, value]); },
      append: function (rel, text) { return call("fs", "append", [rel, text]); },
      list: function (rel) { return call("fs", "list", [rel]); },
      mkdir: function (rel) { return call("fs", "mkdir", [rel]); },
      remove: function (rel) { return call("fs", "remove", [rel]); },
      copy: function (from, to) { return call("fs", "copy", [from, to]); },
      hash: function (rel, algo) { return call("fs", "hash", [rel, algo]); },
      readBinary: function (rel) { return call("fs", "readBinary", [rel]); },
    },
    store: {
      get: function (key, fallback) {
        return call("store", "get", [owner() || "shared", key, fallback]);
      },
      set: function (key, value) {
        return call("store", "set", [owner() || "shared", key, value]);
      },
      remove: function (key) {
        return call("store", "remove", [owner() || "shared", key]);
      },
      clear: function () {
        return call("store", "clear", [owner() || "shared"]);
      },
    },
    settings: {
      get: function () {
        return call("settings", "get", [owner() || "shared"]);
      },
      set: function (value) {
        return call("settings", "set", [owner() || "shared", value]);
      },
      patch: function (partial) {
        return call("settings", "patch", [owner() || "shared", partial]);
      },
      schema: function (modId) {
        return call("settings", "schema", [modId || owner() || ""]);
      },
      panel: function (id) {
        var modId = id || owner() || "shared";
        return Promise.all([
          call("settings", "schema", [modId]),
          call("settings", "get", [modId]),
        ]).then(function (pair) {
          var schema = pair[0] || {};
          var cur = pair[1] || {};
          var keys = Object.keys(schema);
          var html =
            "<div style='min-width:260px;max-width:420px;background:rgba(0,0,0,0.94);color:#fff;border:1px solid #94a3b8;padding:16px 18px;font:13px/1.4 Segoe UI,sans-serif'>" +
            "<div style='display:flex;justify-content:space-between;gap:12px;align-items:center'>" +
            "<b>" + String(modId) + "</b>" +
            "<button type='button' id='sf-settings-close'>Close</button></div>" +
            "<form id='sf-settings-form' style='margin-top:12px'>";
          keys.forEach(function (k) {
            var spec = schema[k] || {};
            var val = cur[k] != null ? cur[k] : spec.default;
            var type = spec.type || typeof val;
            html += "<label style='display:block;margin:6px 0'>" + k + "<br/>";
            if (type === "boolean") {
              html += "<input type='checkbox' name='" + k + "'" + (val ? " checked" : "") + " />";
            } else if (type === "number") {
              html += "<input type='number' name='" + k + "' value='" + String(val == null ? "" : val) + "' />";
            } else {
              html += "<input type='text' name='" + k + "' value='" + String(val == null ? "" : val).replace(/"/g, "&quot;") + "' />";
            }
            html += "</label>";
          });
          html += "<button type='submit'>Save</button></form></div>";
          var wrap = ui.overlay("settings-" + modId, html);
          wrap.el.style.pointerEvents = "auto";
          wrap.el.style.display = "flex";
          wrap.el.style.alignItems = "center";
          wrap.el.style.justifyContent = "center";
          wrap.el.style.background = "rgba(5,7,10,0.78)";
          var box = wrap.el.firstChild;
          var form = wrap.el.querySelector("#sf-settings-form");
          var closeBtn = wrap.el.querySelector("#sf-settings-close");
          function close() {
            wrap.remove();
          }
          if (closeBtn) closeBtn.onclick = close;
          wrap.el.addEventListener("click", function (ev) {
            if (ev.target === wrap.el) close();
          });
          if (form) {
            form.addEventListener("submit", function (ev) {
              ev.preventDefault();
              var next = Object.assign({}, cur);
              keys.forEach(function (k) {
                var spec = schema[k] || {};
                var input = form.elements[k];
                if (!input) return;
                if (spec.type === "boolean") next[k] = !!input.checked;
                else if (spec.type === "number") next[k] = Number(input.value);
                else next[k] = input.value;
              });
              call("settings", "set", [modId, next]).then(close);
            });
          }
          return box;
        });
      },
    },
    mods: {
      list: function () { return call("mods", "list", []); },
      assetUrl: function (modId, rel) {
        return ownedAssets.url(rel, modId);
      },
      fileUrl: function (modId, rel) {
        return ownedAssets.url(rel, modId);
      },
      read: function (modId, rel) { return call("mods", "read", [modId, rel]); },
      getDisabled: function () { return call("mods", "getDisabled", []); },
      disable: function (ids) { return call("mods", "setDisabled", [ids]); },
      setDisabled: function (ids) { return call("mods", "setDisabled", [ids]); },
      reload: function (id) { return call("mods", "reload", [id || owner() || ""]); },
      unload: function (id) { return call("mods", "unload", [id || owner() || ""]); },
    },
    paths: {
      get: function () { return call("paths", "get", []); },
    },
    net: {
      fetch: function (url) { return call("net", "fetch", [url]); },
      get: function (url) { return call("net", "get", [url]); },
      post: function (url, body, opts) { return call("net", "post", [url, body, opts]); },
      getJson: function (url) { return call("net", "getJson", [url]); },
      download: function (url, destRel) { return call("net", "download", [url, destRel]); },
      request: function (url, opts) { return call("net", "request", [url, opts]); },
      ws: function (url, opts) {
        return call("net", "wsOpen", [url, opts || {}]).then(function (row) {
          var id = row && row.id;
          var listeners = { open: [], message: [], close: [], error: [] };
          function listen(ev, fn) {
            if (listeners[ev]) listeners[ev].push(fn);
            return sock;
          }
          var offOpen = onEvent("sf:ws:open", function (data) {
            if (!data || data.id !== id) return;
            listeners.open.forEach(function (fn) { fn(data); });
          });
          var offMsg = onEvent("sf:ws:message", function (data) {
            if (!data || data.id !== id) return;
            listeners.message.forEach(function (fn) { fn(data.data, data); });
          });
          var offClose = onEvent("sf:ws:close", function (data) {
            if (!data || data.id !== id) return;
            listeners.close.forEach(function (fn) { fn(data); });
          });
          var offErr = onEvent("sf:ws:error", function (data) {
            if (!data || data.id !== id) return;
            listeners.error.forEach(function (fn) { fn(data); });
          });
          var sock = {
            id: id,
            on: listen,
            send: function (data) { return call("net", "wsSend", [id, data]); },
            close: function () {
              offOpen(); offMsg(); offClose(); offErr();
              return call("net", "wsClose", [id]);
            },
          };
          return sock;
        });
      },
    },
    dialog: {
      open: function (opts) { return call("dialog", "open", [opts]); },
      save: function (opts) { return call("dialog", "save", [opts]); },
      message: function (opts) { return call("dialog", "message", [opts]); },
      error: function (title, content) { return call("dialog", "error", [title, content]); },
    },
    clipboard: {
      readText: function () { return call("clipboard", "readText", []); },
      writeText: function (text) { return call("clipboard", "writeText", [text]); },
      readImage: function () { return call("clipboard", "readImage", []); },
      writeImagePng: function (buf) { return call("clipboard", "writeImagePng", [buf]); },
      writePage: function (id) { return call("clipboard", "writePage", [id]); },
    },
    shell: {
      openPath: function (target) { return call("shell", "openPath", [target]); },
      openUrl: function (url) { return call("shell", "openUrl", [url]); },
      showItemInFolder: function (target) { return call("shell", "showItemInFolder", [target]); },
    },
    windows: {
      list: function () { return call("windows", "list", []); },
      show: function (id) { return call("windows", "show", [id]); },
      hide: function (id) { return call("windows", "hide", [id]); },
      focus: function (id) { return call("windows", "focus", [id]); },
      reload: function (id) { return call("windows", "reload", [id]); },
      openDevTools: function (id) { return call("windows", "openDevTools", [id]); },
      executeJavaScript: function (code, id) { return call("windows", "executeJavaScript", [code, id]); },
      insertCSS: function (css, id) { return call("windows", "insertCSS", [css, id]); },
      setTitle: function (title, id) { return call("windows", "setTitle", [title, id]); },
      setSize: function (w, h, id) { return call("windows", "setSize", [w, h, id]); },
      setFullScreen: function (flag, id) { return call("windows", "setFullScreen", [flag, id]); },
      isFullScreen: function (id) { return call("windows", "isFullScreen", [id]); },
      setZoom: function (factor, id) { return call("windows", "setZoom", [factor, id]); },
      getZoom: function (id) { return call("windows", "getZoom", [id]); },
      getBounds: function (id) { return call("windows", "getBounds", [id]); },
      setBounds: function (bounds, id) { return call("windows", "setBounds", [bounds, id]); },
      minimize: function (id) { return call("windows", "minimize", [id]); },
      maximize: function (id) { return call("windows", "maximize", [id]); },
      unmaximize: function (id) { return call("windows", "unmaximize", [id]); },
      setAlwaysOnTop: function (flag, id) { return call("windows", "setAlwaysOnTop", [flag, id]); },
      capturePage: function (id) { return call("windows", "capturePage", [id]); },
      captureToClipboard: function (id) { return call("windows", "captureToClipboard", [id]); },
      captureRegion: function (rect, id) { return call("windows", "captureRegion", [rect, id]); },
      printToPDF: function (opts, id) { return call("windows", "printToPDF", [opts, id]); },
      close: function (id) { return call("windows", "close", [id]); },
      create: function (opts) {
        var o = Object.assign({}, opts || {});
        if (!o.modId) o.modId = owner();
        return call("windows", "create", [o]);
      },
      broadcast: function (channel, data) { return call("windows", "broadcast", [channel, data]); },
    },
    notify: {
      show: function (title, body, opts) { return call("notify", "show", [title, body, opts || {}]); },
    },
    screen: {
      displays: function () { return call("screen", "displays", []); },
      primary: function () { return call("screen", "primary", []); },
    },
    saves: {
      list: function () { return call("saves", "list", []); },
      maps: function () { return call("saves", "maps", []); },
    },
    crypto: {
      hash: function (text, algo) { return call("crypto", "hash", [text, algo]); },
      randomId: function () { return call("crypto", "randomId", []); },
    },
    registry: {
      get: function (ns, key, fallback) { return call("registry", "get", [ns, key, fallback]); },
      set: function (ns, key, value) { return call("registry", "set", [ns, key, value]); },
      list: function (ns) { return call("registry", "list", [ns]); },
    },
    bus: {
      on: onEvent,
      emit: function (channel, data) { return call("bus", "emit", [channel, data]); },
    },
    steam: {
      info: function () { return call("steam", "info", []); },
      subscribe: function (id) { return call("steam", "subscribe", [id]); },
      unsubscribe: function (id) { return call("steam", "unsubscribe", [id]); },
      download: function (id, high) { return call("steam", "download", [id, high]); },
      state: function (id) { return call("steam", "state", [id]); },
      installInfo: function (id) { return call("steam", "installInfo", [id]); },
      downloadInfo: function (id) { return call("steam", "downloadInfo", [id]); },
      subscribed: function () { return call("steam", "subscribed", []); },
      getItem: function (id) { return call("steam", "getItem", [id]); },
      getItems: function (ids) { return call("steam", "getItems", [ids]); },
      query: function (opts) { return call("steam", "query", [opts]); },
    },
    logFile: {
      write: function (line) { return call("logFile", "write", [line]); },
    },
    patcher: {
      status: function () { return call("patcher", "status", []); },
      unseal: function () { return call("patcher", "unseal", []); },
      isSealed: function () { return call("patcher", "isSealed", []); },
      add: function (patch) {
        return call("patcher", "add", [patch, owner()]);
      },
      applyPreload: function () { return call("patcher", "applyPreload", []); },
    },
    app: {
      info: function () { return call("app", "info", []); },
      relaunch: function () { return call("app", "relaunch", []); },
      quit: function () { return call("app", "quit", []); },
    },
    relaunch: function () {
      return call("app", "relaunch", []);
    },
    log: function (level, message) {
      console.log("[sandforge-game][" + (level || "info") + "] " + message);
    },
  };
    api.listMods = function () { return api.mods.list(); };
    api.getDisabled = function () { return api.mods.getDisabled(); };
    api.setDisabled = function (ids) { return api.mods.disable(ids); };
    api.disable = function (ids) { return api.mods.disable(ids); };
    return api;
  }

  function publishApi(api) {
    var raw = bridge();
    var b = {};
    if (raw) {
      try {
        for (var key in raw) {
          try {
            b[key] = raw[key];
          } catch (_) {}
        }
      } catch (_) {}
    }
    Object.keys(api).forEach(function (k) {
      if (b[k] == null) b[k] = api[k];
    });
    [
      "game",
      "ui",
      "scene",
      "tick",
      "commands",
      "hooks",
      "world",
      "i18n",
      "audio",
      "assets",
      "workers",
      "util",
      "fs",
      "store",
      "settings",
      "mods",
      "net",
      "dialog",
      "clipboard",
      "shell",
      "windows",
      "notify",
      "screen",
      "saves",
      "crypto",
      "registry",
      "bus",
      "steam",
      "logFile",
      "patcher",
      "app",
      "input",
      "bind",
      "emit",
      "rpc",
      "listMods",
      "getDisabled",
      "setDisabled",
      "disable",
    ].forEach(function (k) {
      if (api[k] != null) b[k] = api[k];
    });
    b.isLoader = true;
    b.isWrapper = true;
    b.bind = api.bind;
    return b;
  }

  var api = buildApi("");
  var published = publishApi(api);
  published.bind = function (id) {
    return publishApi(buildApi(id));
  };
  api.bind = published.bind;
  window.SandforgeGame = published;
  window.sandforgeGame = published;
  try {
    window.sandforge = published;
  } catch (_) {}
  try {
    window.sandforgeAPI = published;
  } catch (_) {}

  cmd.register("mods", function () {
    return api.mods.list();
  }, "list loaded mods");
  cmd.register("scene", function () {
    return scene.get();
  }, "current scene");
  cmd.register("toast", function (args) {
    ui.toast(args.join(" ") || "hello");
  }, "show a toast");
  cmd.register("help", function () {
    return cmd.list();
  }, "list commands");
  cmd.register("relaunch", function () {
    return api.relaunch();
  }, "relaunch the game");
  cmd.register("reload", function (args) {
    return api.mods.reload(args && args[0]);
  }, "reload a mod (electron + game entry)");

  wrapSandkitAssets();
  wrapSandkitMods();

  console.log("[sandforge-loader] game API " + VERSION);
})();
