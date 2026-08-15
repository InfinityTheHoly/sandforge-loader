(function () {
  var api = window.sandforge || window.SandforgeGame;
  if (!api) {
    console.warn("[sandforge.example] loader API missing");
    return;
  }
  console.log("[sandforge.example] game entry loaded", api.version);
  window.__SF_EXAMPLE_GAME__ = true;

  if (api.workers && typeof api.workers.on === "function") {
    api.workers.on(function (channel) {
      if (channel === "sandforge.example:worker") {
        window.__SF_EXAMPLE_WORKER__ = true;
        if (window.SandforgeExample && window.SandforgeExample.refresh) {
          window.SandforgeExample.refresh();
        }
      }
    });
  }

  if (api.on) {
    api.on("sandforge.example:worker", function () {
      window.__SF_EXAMPLE_WORKER__ = true;
      if (window.SandforgeExample && window.SandforgeExample.refresh) {
        window.SandforgeExample.refresh();
      }
    });
  }

  if (typeof api.invoke === "function") {
    api.invoke("sandforge.example:status").catch(function () {});
  }

  if (window.SandforgeExample && typeof window.SandforgeExample.refresh === "function") {
    window.SandforgeExample.refresh();
  }
})();
