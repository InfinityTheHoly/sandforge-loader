(function () {
  var api = self.sandforge || self.SandforgeWorker;
  if (api && api.log) api.log("info", "worker entry loaded " + api.version);
  else console.log("[sandforge.example] worker entry loaded");

  function announce(attempt) {
    if (!api || typeof api.rpc !== "function") return;
    api
      .rpc("registry", "set", ["sandforge.example", "workerReady", true])
      .then(function () {
        if (typeof api.sendGameMessage === "function") {
          return api.sendGameMessage("sandforge.example:worker", {
            ok: true,
            at: Date.now(),
          });
        }
      })
      .catch(function () {
        if (attempt < 20) setTimeout(function () { announce(attempt + 1); }, 500);
      });
  }
  announce(0);
})();
