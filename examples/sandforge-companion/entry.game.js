(function () {
  var api = window.sandforge || window.SandforgeGame;
  if (!api) {
    console.warn("[sandustry.sandforge-companion] loader API missing");
    return;
  }
  console.log("[sandustry.sandforge-companion] game entry loaded", api.version);
  window.__SF_COMPANION_GAME__ = true;

  function markWorkerReady() {
    if (window.__SF_COMPANION_WORKER__) return;
    window.__SF_COMPANION_WORKER__ = true;
    if (window.SandforgeCompanion && window.SandforgeCompanion.markWorker) {
      window.SandforgeCompanion.markWorker();
    }
  }

  if (api.workers && typeof api.workers.on === "function") {
    api.workers.on(function (channel) {
      if (channel === "sandustry.sandforge-companion:worker") markWorkerReady();
    });
  }

  function pollWorkerReady(attempt) {
    if (!api.registry || typeof api.registry.get !== "function") return;
    api.registry
      .get("sandustry.sandforge-companion", "workerReady", false)
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
    api.invoke("sandustry.sandforge-companion:status").catch(function () {});
  }

  if (window.SandforgeCompanion && typeof window.SandforgeCompanion.refresh === "function") {
    window.SandforgeCompanion.refresh();
  }
})();
