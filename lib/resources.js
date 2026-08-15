"use strict";

function createResourceTracker() {
  const byMod = new Map();

  function bag(modId) {
    const id = String(modId || "");
    if (!byMod.has(id)) {
      byMod.set(id, {
        ipc: new Set(),
        windows: new Set(),
        shortcuts: new Set(),
        watchers: [],
        timers: [],
        trays: [],
        notifications: [],
        sockets: [],
      });
    }
    return byMod.get(id);
  }

  function dispose(modId) {
    const id = String(modId || "");
    const b = byMod.get(id);
    if (!b) return { ok: true, id, closed: 0 };
    let closed = 0;
    b.windows.forEach((win) => {
      try {
        if (win && !win.isDestroyed()) {
          win.close();
          closed += 1;
        }
      } catch (_) {}
    });
    b.shortcuts.forEach((acc) => {
      try {
        require("electron").globalShortcut.unregister(acc);
      } catch (_) {}
    });
    b.watchers.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
    b.timers.forEach((timer) => {
      try {
        clearTimeout(timer);
        clearInterval(timer);
      } catch (_) {}
    });
    b.trays.forEach((tray) => {
      try {
        tray.destroy();
      } catch (_) {}
    });
    b.notifications.forEach((n) => {
      try {
        n.close();
      } catch (_) {}
    });
    b.sockets.forEach((sock) => {
      try {
        sock.close();
      } catch (_) {}
    });
    byMod.delete(id);
    return { ok: true, id, closed };
  }

  return {
    bag,
    trackIpc(modId, channel) {
      bag(modId).ipc.add(String(channel || ""));
    },
    ipcChannels(modId) {
      const b = byMod.get(String(modId || ""));
      return b ? [...b.ipc] : [];
    },
    trackWindow(modId, win) {
      if (!win) return;
      const b = bag(modId);
      b.windows.add(win);
      try {
        win.on("closed", () => b.windows.delete(win));
      } catch (_) {}
    },
    trackShortcut(modId, accelerator) {
      bag(modId).shortcuts.add(String(accelerator || ""));
    },
    untrackShortcut(modId, accelerator) {
      const b = byMod.get(String(modId || ""));
      if (b) b.shortcuts.delete(String(accelerator || ""));
    },
    trackWatcher(modId, unwatch) {
      if (typeof unwatch === "function") bag(modId).watchers.push(unwatch);
    },
    trackTimer(modId, timer) {
      bag(modId).timers.push(timer);
      return timer;
    },
    trackTray(modId, tray) {
      if (tray) bag(modId).trays.push(tray);
    },
    trackNotification(modId, n) {
      if (n) bag(modId).notifications.push(n);
    },
    trackSocket(modId, sock) {
      if (sock) bag(modId).sockets.push(sock);
    },
    dispose,
    disposeAll() {
      [...byMod.keys()].forEach(dispose);
    },
  };
}

module.exports = { createResourceTracker };
