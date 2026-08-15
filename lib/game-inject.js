"use strict";

function wrapGameEntry(modId, code, opts) {
  const id = JSON.stringify(String(modId || ""));
  const persist = !!(opts && opts.persist);
  const restore = persist
    ? ""
    : "window.__SF_CURRENT_MOD__=\"\";" +
      "if(window.SandforgeGame){window.sandforge=window.SandforgeGame;window.sandforgeAPI=window.SandforgeGame;}";
  const safeId = String(modId || "mod").replace(/[^\w.-]+/g, "_");
  return (
    "(function(){\n" +
    "var __id=" +
    id +
    ";\n" +
    "var __api=(window.SandforgeGame&&typeof window.SandforgeGame.bind===\"function\")" +
    "?window.SandforgeGame.bind(__id):window.sandforge;\n" +
    "window.__SF_CURRENT_MOD__=__id;\n" +
    "window.sandforge=__api;\n" +
    "window.sandforgeAPI=__api;\n" +
    "try{\n" +
    String(code || "") +
    "\n}finally{\n" +
    restore +
    "\n}\n" +
    "})();\n//# sourceURL=sandforge-game/" +
    safeId +
    "\n"
  );
}

module.exports = { wrapGameEntry };
