module.exports = function (api) {
  api.log("info", "electron entry loaded " + api.version);

  let arcadeId = null;

  function openArcade() {
    const wins = api.windows.list() || [];
    const live = arcadeId != null && wins.some(function (w) {
      return w.id === arcadeId;
    });
    if (live) {
      api.windows.focus(arcadeId);
      api.windows.setAlwaysOnTop(true, arcadeId);
      return { ok: true, id: arcadeId, reused: true };
    }
    const created = api.windows.create({
      file: "ui/arcade.html",
      width: 760,
      height: 720,
      title: "Arcade — SandForge Companion",
      backgroundColor: "#0a0c10",
      alwaysOnTop: true,
      maximizable: false,
      fullscreenable: false,
    });
    arcadeId = created && created.id;
    return { ok: true, id: arcadeId, reused: false };
  }

  const handle = api.handle || api.handleGameIPC;
  handle("sandustry.sandforge-companion:arcade-popout", openArcade);

  const boots = (api.store.get("boots", 0) || 0) + 1;
  api.store.set("boots", boots);
  api.logFile.write(api.mod.id + " boot #" + boots);

  api.registry.set("sandustry.sandforge-companion", "ready", true);
  api.registry.set("sandustry.sandforge-companion", "boots", boots);

  handle("sandustry.sandforge-companion:status", function () {
    const mods = api.mods.list() || [];
    const enabled = mods.filter(function (m) {
      return m && m.enabled !== false;
    });
    let patcher = { queued: [] };
    try {
      patcher = api.patcher.status() || patcher;
    } catch (_) {}
    return {
      ok: true,
      loader: api.version,
      apiVersion: api.apiVersion || api.version,
      environment: api.environment,
      modId: api.modId,
      boots: boots,
      mods: mods.length,
      enabled: enabled.length,
      electron: true,
      worker: api.registry.get("sandustry.sandforge-companion", "workerReady", false) === true,
      patcher: patcher,
      app: {
        version: api.app && api.app.version,
        platform: api.app && api.app.platform,
        electron: api.app && api.app.electron,
        pid: api.app && api.app.pid,
      },
    };
  });

  handle("sandustry.sandforge-companion:ping", function () {
    return { ok: true, loader: api.version, boots: boots };
  });

  function arcadeStats() {
    return {
      snakeBest: Number(api.store.get("snakeBest", 0)) || 0,
      puddleWins: Number(api.store.get("puddleWins", 0)) || 0,
      sweeperWins: Number(api.store.get("sweeperWins", 0)) || 0,
      sweeperBest: Number(api.store.get("sweeperBest", 0)) || 0,
      sortWins: Number(api.store.get("sortWins", 0)) || 0,
      soloWins: Number(api.store.get("soloWins", 0)) || 0,
      soloBestTime: Number(api.store.get("soloBestTime", 0)) || 0,
    };
  }

  handle("sandustry.sandforge-companion:arcade-boot", function () {
    return Object.assign({ ok: true }, arcadeStats());
  });

  handle("sandustry.sandforge-companion:solitaire-boot", function () {
    const s = arcadeStats();
    return { ok: true, wins: s.soloWins, bestTime: s.soloBestTime };
  });

  handle("sandustry.sandforge-companion:arcade-score", function (row) {
    const data = row && typeof row === "object" ? row : { game: row };
    const game = String(data.game || "");
    const stats = arcadeStats();
    if (game === "snake") {
      const score = Number(data.score) || 0;
      if (score > stats.snakeBest) {
        stats.snakeBest = score;
        api.store.set("snakeBest", score);
      }
    } else if (game === "puddle" && data.win) {
      stats.puddleWins += 1;
      api.store.set("puddleWins", stats.puddleWins);
    } else if (game === "sweeper" && data.win) {
      stats.sweeperWins += 1;
      api.store.set("sweeperWins", stats.sweeperWins);
      const t = Number(data.time) || 0;
      if (t > 0 && (!stats.sweeperBest || t < stats.sweeperBest)) {
        stats.sweeperBest = t;
        api.store.set("sweeperBest", t);
      }
    } else if (game === "sort" && data.win) {
      stats.sortWins += 1;
      api.store.set("sortWins", stats.sortWins);
    }
    try {
      api.logFile.write(api.mod.id + " arcade " + game + " " + JSON.stringify(data));
    } catch (_) {}
    return Object.assign({ ok: true }, stats);
  });

  handle("sandustry.sandforge-companion:solitaire-win", function (time, moves) {
    const stats = arcadeStats();
    const t = Number(time) || 0;
    stats.soloWins += 1;
    if (t > 0 && (!stats.soloBestTime || t < stats.soloBestTime)) stats.soloBestTime = t;
    api.store.set("soloWins", stats.soloWins);
    api.store.set("soloBestTime", stats.soloBestTime);
    try {
      api.notify.show("Klondike", "Cleared in " + t + "s · " + (Number(moves) || 0) + " moves");
    } catch (_) {}
    try {
      api.logFile.write(api.mod.id + " solitaire win " + t + "s " + moves + " moves");
    } catch (_) {}
    return { ok: true, wins: stats.soloWins, bestTime: stats.soloBestTime };
  });
};
