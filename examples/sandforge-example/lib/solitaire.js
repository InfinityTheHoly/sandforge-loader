/**
 * Opens the SandForge arcade (select menu + minigames) in its own window.
 */
(function (root) {
  var pending = false;

  function api() {
    return root.SandforgeGame || root.sandforgeGame || root.sandforge || root.sandforgeAPI || null;
  }

  function toast(msg) {
    try {
      if (root.sandkit && root.sandkit.api && root.sandkit.api.ui) {
        root.sandkit.api.ui.toast(msg);
        return;
      }
    } catch (_) {}
    var sf = api();
    if (sf && sf.ui && sf.ui.toast) sf.ui.toast(msg);
  }

  function play() {
    var sf = api();
    if (!sf || typeof sf.invoke !== "function") {
      toast("Arcade needs the SandForge loader.");
      return Promise.resolve(false);
    }
    if (pending) return Promise.resolve(true);
    pending = true;
    return sf
      .invoke("sandforge.example:arcade-popout")
      .then(function (res) {
        pending = false;
        if (res && res.ok) {
          toast(res.reused ? "Arcade is already open." : "Arcade — pick a game.");
          return true;
        }
        toast("Could not open Arcade.");
        return false;
      })
      .catch(function () {
        pending = false;
        toast("Could not open Arcade.");
        return false;
      });
  }

  root.SandforgeArcade = { play: play };
})(typeof window !== "undefined" ? window : this);
