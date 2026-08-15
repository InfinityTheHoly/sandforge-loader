(function () {
  var api = window.sandforge || window.SandforgeGame;
  if (!api) {
    console.warn("[sandforge.example] loader API missing");
    return;
  }
  console.log("[sandforge.example] game entry loaded", api.version);
  window.__SF_EXAMPLE_GAME__ = true;

  function markWorkerReady() {
    if (window.__SF_EXAMPLE_WORKER__) return;
    window.__SF_EXAMPLE_WORKER__ = true;
    if (window.SandforgeExample && window.SandforgeExample.markWorker) {
      window.SandforgeExample.markWorker();
    }
  }

  if (api.workers && typeof api.workers.on === "function") {
    api.workers.on(function (channel) {
      if (channel === "sandforge.example:worker") markWorkerReady();
    });
  }

  function pollWorkerReady(attempt) {
    if (!api.registry || typeof api.registry.get !== "function") return;
    api.registry
      .get("sandforge.example", "workerReady", false)
      .then(function (ready) {
        if (ready) {
          markWorkerReady();
          return;
        }
        if (attempt < 120) {
          setTimeout(function () { pollWorkerReady(attempt + 1); }, 500);
        }
      })
      .catch(function () {
        if (attempt < 120) {
          setTimeout(function () { pollWorkerReady(attempt + 1); }, 500);
        }
      });
  }
  pollWorkerReady(0);

  if (typeof api.invoke === "function") {
    api.invoke("sandforge.example:status").catch(function () {});
  }

  if (window.SandforgeExample && typeof window.SandforgeExample.refresh === "function") {
    window.SandforgeExample.refresh();
  }
})();
