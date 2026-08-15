(function () {
  var api = self.sandforge || self.SandforgeWorker;
  if (api && api.log) api.log("info", "worker entry loaded " + api.version);
  else console.log("[sandforge.example] worker entry loaded");
  if (api && typeof api.sendGameMessage === "function") {
    api.sendGameMessage("sandforge.example:worker", { ok: true, at: Date.now() });
  }
})();
