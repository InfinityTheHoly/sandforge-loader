/**
 * Sandkit / Workshop entry. Safe in the official host.
 * The Electron host is main.js and must not run here.
 */
(function () {
  var MOD_ID = "sandustry.sandforge-loader";

  function loaderLive() {
    try {
      if (window.__SF_HOST__ || window.__SANDFORGE_GAME_API__ || window.SandforgeGame) {
        return true;
      }
      if (window.SandforgeLoader && typeof window.SandforgeLoader.has === "function") {
        return !!window.SandforgeLoader.has();
      }
    } catch (_) {}
    return false;
  }

  function toast(message) {
    try {
      sandkit.api.ui.toast(message);
    } catch (_) {
      console.log("[sandforge-loader]", message);
    }
  }

  try {
    if (typeof sandkit === "undefined") return;
    sandkit.api.i18n.register("en", {
      "sandustry.sandforge-loader.name": "SandForge Loader",
      "sandustry.sandforge-loader.description":
        "Quit the game, then run install.cmd in this folder to turn SandForge on.",
    });
    if (loaderLive()) {
      toast("SandForge is active");
    } else {
      toast("SandForge: quit the game, then run install.cmd in this folder");
    }
  } catch (err) {
    console.warn("[sandforge-loader] sandkit entry failed", err);
  }

  window.__SANDFORGE_LOADER_MOD__ = {
    id: MOD_ID,
    host: true,
    active: loaderLive(),
  };
})();
