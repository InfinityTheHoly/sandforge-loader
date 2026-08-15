"use strict";

function isGameRenderer(win) {
  if (!win || win.isDestroyed()) return false;
  if (win.__SF_POPOUT__) return !!win.__SF_INJECT_GAME__;
  try {
    const url = String(win.webContents.getURL() || "");
    if (!url) return true;
    if (/^sandforge-ui:|^sandustry-patch:/i.test(url)) return true;
    if (/app\.asar[/\\]dist[/\\]index\.html/i.test(url)) return true;
    if (/^file:/i.test(url)) return false;
  } catch (_) {}
  return true;
}

module.exports = { isGameRenderer };
