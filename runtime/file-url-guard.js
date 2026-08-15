/**
 * Rewrite file:// mod/workshop/game-ui URLs to sandforge:// before Chromium blocks them.
 * Injected on dom-ready so Sandkit getUrl is patched as soon as it appears.
 */
(function () {
  if (window.__SF_FILE_URL_GUARD__) return;
  window.__SF_FILE_URL_GUARD__ = true;

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
      var dist = path.match(/\/(?:app\.asar\/)?dist\/(.+)$/i);
      if (dist) return "sandforge-ui://game/" + dist[1];
    } catch (_) {}
    return raw;
  }

  function rewriteAny(value) {
    return String(value == null ? "" : value).replace(/file:\/\/[^\s'")]+/gi, function (m) {
      var next = fileUrlToSandforge(m);
      return next || m;
    });
  }

  window.__SF_fileUrlToSandforge = fileUrlToSandforge;
  window.__SF_rewriteFileUrls = rewriteAny;

  function wrapGetUrl() {
    if (window.__SF_ASSETS_WRAPPED__) return true;
    var a;
    try {
      a = typeof sandkit !== "undefined" && sandkit.api && sandkit.api.assets;
    } catch (_) {
      return false;
    }
    if (!a || typeof a.getUrl !== "function") return false;
    var orig = a.getUrl.bind(a);
    a.getUrl = function (rel) {
      var url = orig(rel);
      var rewritten = fileUrlToSandforge(url);
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
    window.__SF_ASSETS_WRAPPED__ = true;
    return true;
  }

  function patchSetter(proto, prop) {
    if (!proto) return;
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (!desc || typeof desc.set !== "function" || desc.__sfPatched) return;
    var set = desc.set;
    var get = desc.get;
    Object.defineProperty(proto, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get: get,
      set: function (v) {
        set.call(this, typeof v === "string" ? rewriteAny(v) : v);
      },
    });
  }

  function patchStyle() {
    var proto = window.CSSStyleDeclaration && CSSStyleDeclaration.prototype;
    if (!proto || proto.__sfPatched) return;
    proto.__sfPatched = true;
    if (typeof proto.setProperty === "function") {
      var orig = proto.setProperty;
      proto.setProperty = function (name, value, priority) {
        if (typeof value === "string" && /file:/i.test(value)) value = rewriteAny(value);
        return orig.call(this, name, value, priority);
      };
    }
    patchSetter(proto, "backgroundImage");
    patchSetter(proto, "cssText");
  }

  function patchElements() {
    patchSetter(window.HTMLImageElement && HTMLImageElement.prototype, "src");
    patchSetter(window.HTMLScriptElement && HTMLScriptElement.prototype, "src");
    patchSetter(window.HTMLLinkElement && HTMLLinkElement.prototype, "href");
    patchSetter(window.HTMLSourceElement && HTMLSourceElement.prototype, "src");
    patchSetter(window.HTMLAudioElement && HTMLAudioElement.prototype, "src");
    patchSetter(window.HTMLVideoElement && HTMLVideoElement.prototype, "src");
    patchSetter(window.HTMLIFrameElement && HTMLIFrameElement.prototype, "src");
    patchStyle();
  }

  patchElements();
  wrapGetUrl();
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (wrapGetUrl() || tries > 200) clearInterval(timer);
  }, 25);
})();
