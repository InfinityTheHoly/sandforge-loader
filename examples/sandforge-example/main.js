const MOD_ID = "sandforge.example";
const GITHUB_URL = "https://github.com/InfinityTheHoly/sandforge-loader";
const AUTHOR_URL = "https://github.com/InfinityTheHoly";

try {
  if (typeof sandkit !== "undefined") window.sandkit = sandkit;
} catch (_) {}

function onLoaderPage() {
  try {
    var href = String((window.location && window.location.href) || "");
    if (/^sandforge-ui:/i.test(href) || /^sandforge:/i.test(href) || /^blob:/i.test(href)) {
      return true;
    }
  } catch (_) {}
  try {
    if (window.__SF_HOST__ || window.__SANDFORGE_GAME_API__ || window.SandforgeGame) return true;
  } catch (_) {}
  return false;
}

function canFetchUrl(url) {
  if (!url) return false;
  if (/^file:/i.test(String(url))) return !onLoaderPage();
  return true;
}

function assetUrl(rel) {
  var rest = String(rel || "").replace(/^\/+/, "");
  try {
    var sf = window.SandforgeGame || window.sandforge;
    if (sf && sf.assets && typeof sf.assets.url === "function") {
      var fromApi = sf.assets.url(rest, MOD_ID);
      if (fromApi && canFetchUrl(fromApi)) return fromApi;
    }
  } catch (_) {}
  if (onLoaderPage()) {
    return "sandforge://" + encodeURIComponent(MOD_ID) + "/" + rest;
  }
  try {
    var fromKit = sandkit.api.assets.getUrl(rest);
    if (fromKit && canFetchUrl(fromKit)) return fromKit;
  } catch (_) {}
  return "sandforge://" + encodeURIComponent(MOD_ID) + "/" + rest;
}

function readModText(rel) {
  var rest = String(rel || "").replace(/^\/+/, "");
  function viaRead() {
    var sf = window.SandforgeGame || window.sandforge;
    if (sf && sf.mods && typeof sf.mods.read === "function") {
      return Promise.resolve(sf.mods.read(MOD_ID, rest));
    }
    return Promise.reject(new Error("No mods.read for " + rest));
  }
  var url = "";
  try {
    url = assetUrl(rest);
  } catch (_) {}
  if (url && canFetchUrl(url)) {
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + rest);
        return res.text();
      })
      .catch(function () {
        return viaRead();
      });
  }
  return viaRead();
}

function runSource(code, label) {
  (0, eval)(code + "\n//# sourceURL=sandforge-example/" + label);
}

function looksLikeLoader(sf) {
  if (!sf) return false;
  try {
    if (sf.isWrapper === true || sf.isLoader === true) return true;
    if (typeof sf.isLoader === "function" && sf.isLoader()) return true;
    if (typeof sf.setDisabled === "function") return true;
    if (typeof sf.getDisabled === "function") return true;
    if (typeof sf.relaunch === "function") return true;
    if (typeof sf.listMods === "function") return true;
    if (typeof sf.invoke === "function") return true;
  } catch (_) {}
  return false;
}

function probeLoader() {
  try {
    if (window.__SF_HOST__) return true;
    if (window.__SANDFORGE_LOADER__) return true;
    if (window.__SANDFORGE_GAME_API__) return true;
    if (window.SandforgeGame || window.sandforgeGame) return true;
    if (looksLikeLoader(window.sandforge) || looksLikeLoader(window.sandforgeAPI)) return true;
  } catch (_) {}
  return false;
}

function isLoaderPresent() {
  try {
    var gate = window.SandforgeLoader;
    if (gate && typeof gate.has === "function" && gate.has !== isLoaderPresent) {
      return !!gate.has();
    }
  } catch (_) {}
  return probeLoader();
}

if (!window.SandforgeLoader) {
  window.SandforgeLoader = {
    has: isLoaderPresent,
    GITHUB_URL: GITHUB_URL,
    openGithub: function () {
      openGithub();
    },
  };
}

function isMainMenuScene() {
  try {
    var sp = new URLSearchParams(window.location.search);
    if (
      sp.has("new_game") ||
      sp.has("load") ||
      sp.has("db_load") ||
      sp.has("file_load") ||
      sp.has("external_map")
    ) {
      return false;
    }
  } catch (_) {}
  try {
    var active = sandkit.api.scene.getActive();
    var scenes = sandkit.enums && sandkit.enums.Scene;
    if (scenes && scenes.MainMenu != null) return active === scenes.MainMenu;
    if (active === "MainMenu" || active === "mainmenu" || active === 1) return true;
    if (active != null && active !== "") return false;
  } catch (_) {}
  return !!document.querySelector(".w-60.relative.group.cursor-pointer");
}

function openExternal(url) {
  try {
    if (window.electron && typeof window.electron.openExternalBrowser === "function") {
      window.electron.openExternalBrowser(url);
      return;
    }
  } catch (_) {}
  try {
    var overlay = window.electron && window.electron.platform && window.electron.platform.overlay;
    if (overlay && typeof overlay.openUrl === "function") {
      overlay.openUrl(url);
      return;
    }
  } catch (_) {}
  try {
    var sf = window.sandforge || window.SandforgeGame;
    if (sf && sf.shell && typeof sf.shell.openUrl === "function") {
      sf.shell.openUrl(url);
      return;
    }
  } catch (_) {}
  try {
    window.open(url, "_blank");
  } catch (_) {}
}

function openGithub() {
  openExternal(GITHUB_URL);
}

function openAuthor() {
  openExternal(AUTHOR_URL);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeStyle(active) {
  return {
    position: "fixed",
    left: "12px",
    top: "10px",
    zIndex: 90,
    pointerEvents: "auto",
    fontFamily: '"Segoe UI","Noto Sans",system-ui,sans-serif',
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    lineHeight: "1.25",
    textTransform: "uppercase",
    textAlign: "left",
    color: active ? "#ffe700" : "#cbd5e1",
    background: "rgba(0,0,0,0.78)",
    border: "1px solid " + (active ? "#ffe700" : "rgba(203,213,225,0.7)"),
    borderRadius: "2px 10px 2px 10px",
    padding: "7px 12px",
    cursor: "pointer",
  };
}

function StatusBadge() {
  var React = sandkit.react;
  var vis = React.useState(isMainMenuScene());
  var visible = vis[0];
  var setVisible = vis[1];
  var act = React.useState(isLoaderPresent());
  var active = act[0];
  var setActive = act[1];
  React.useEffect(function () {
    var t = setInterval(function () {
      setVisible(isMainMenuScene());
      setActive(isLoaderPresent());
    }, 250);
    return function () {
      clearInterval(t);
    };
  }, []);
  if (!visible) return null;
  return React.createElement(
    "button",
    {
      type: "button",
      title: active
        ? "SandForge loader is running. Ctrl-click for Arcade."
        : "SandForge loader is not installed",
      onClick: function (e) {
        if ((e.ctrlKey || e.metaKey) && window.SandforgeExample) {
          e.preventDefault();
          e.stopPropagation();
          window.SandforgeExample.play();
          return;
        }
        if (window.SandforgeExample) window.SandforgeExample.open();
      },
      style: badgeStyle(active),
    },
    active ? "SandForge Active" : "SandForge not active",
  );
}

var FALLBACK_CSS =
  "#sf-example-overlay{position:fixed;inset:0;z-index:100060;display:none;align-items:center;justify-content:center;background:rgba(5,7,10,0.78);font-family:'Segoe UI','Noto Sans',system-ui,sans-serif;color:#fff;}" +
  "#sf-example-overlay.open{display:flex;}" +
  "#sf-example-overlay .sf-ex-panel{width:min(720px,calc(100vw - 32px));max-height:min(84vh,760px);display:flex;flex-direction:column;background:rgba(0,0,0,0.94);border:1px solid rgba(203,213,225,0.86);border-radius:2px 12px 2px 12px;padding:20px 22px 16px;overflow:hidden;}" +
  "#sf-example-overlay .sf-ex-header{display:flex;justify-content:space-between;gap:12px;}" +
  "#sf-example-overlay .sf-ex-header h2{margin:0;color:#ffe700;letter-spacing:.08em;text-transform:uppercase;font-size:18px;}" +
  "#sf-example-overlay .sf-ex-sub{margin:6px 0 0;color:#cbd5e1;font-size:13px;}" +
  "#sf-example-overlay .sf-ex-close,#sf-example-overlay .sf-ex-btn,#sf-example-overlay .sf-ex-tab{cursor:pointer;border:1px solid rgba(203,213,225,0.86);background:#0c1016;color:#fff;border-radius:2px 10px 2px 10px;padding:8px 12px;font-weight:700;}" +
  "#sf-example-overlay .sf-ex-btn.primary,#sf-example-overlay .sf-ex-tab.active{background:#ffe700;border-color:#ffe700;color:#080804;}" +
  "#sf-example-overlay .sf-ex-body{margin-top:14px;overflow:auto;flex:1;}" +
  "#sf-example-overlay .sf-ex-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}";

function injectCss(text) {
  var id = text && text !== FALLBACK_CSS ? "sf-example-css" : "sf-example-css-fallback";
  if (document.getElementById(id)) return;
  var style = document.createElement("style");
  style.id = id;
  style.textContent = text;
  document.head.appendChild(style);
}

function ensureOverlay() {
  if (document.getElementById("sf-example-overlay")) return;
  var wrap = document.createElement("div");
  wrap.id = "sf-example-overlay";
  wrap.innerHTML =
    '<div class="sf-ex-panel" role="dialog" aria-label="SandForge">' +
    '<div class="sf-ex-header">' +
    '<div><div class="sf-ex-title-row"><h2 id="sf-ex-title">SandForge</h2>' +
    '<span class="sf-ex-api-badge">API v1</span></div>' +
    '<p class="sf-ex-sub" id="sf-ex-sub"></p></div>' +
    '<button type="button" class="sf-ex-close" id="sf-ex-close" title="Close">✕</button>' +
    "</div>" +
    '<div class="sf-ex-tabs" id="sf-ex-tabs"></div>' +
    '<div class="sf-ex-body" id="sf-ex-body"></div>' +
    '<div class="sf-ex-footer" id="sf-ex-footer"></div>' +
    "</div>";
  document.body.appendChild(wrap);
  wrap.addEventListener("click", function (e) {
    if (e.target === wrap) closePanel();
  });
  document.getElementById("sf-ex-close").onclick = closePanel;
}

function statCard(label, value, kind) {
  return (
    '<div class="sf-ex-stat"><div class="k">' +
    escapeHtml(label) +
    '</div><div class="v ' +
    (kind || "") +
    '">' +
    escapeHtml(value) +
    "</div></div>"
  );
}

function renderDocs(sectionId) {
  var docs = window.SandforgeExampleDocs || [];
  var section = null;
  for (var i = 0; i < docs.length; i++) {
    if (docs[i].id === sectionId) {
      section = docs[i];
      break;
    }
  }
  if (!section) {
    return "<p class=\"sf-ex-sub\">API docs failed to load.</p>";
  }
  var html = '<p class="sf-ex-sub">' + escapeHtml(section.blurb) + "</p>";
  (section.groups || []).forEach(function (group) {
    html += '<div class="sf-ex-group"><h3>' + escapeHtml(group.title) + "</h3>";
    (group.items || []).forEach(function (item) {
      html +=
        '<div class="sf-ex-item"><code>' +
        escapeHtml(item.name) +
        "</code><p>" +
        escapeHtml(item.desc) +
        "</p></div>";
    });
    html += "</div>";
  });
  return html;
}

function renderInactive() {
  return (
    '<p class="sf-ex-sub">Official Sandkit loaded this Workshop item. The SandForge loader is a local GitHub install — it is not on the Workshop.</p>' +
    '<div class="sf-ex-group"><h3>What still works</h3>' +
    '<div class="sf-ex-item"><p>This badge, this panel, and the GitHub link. Ctrl-click Arcade needs the loader.</p></div></div>' +
    '<div class="sf-ex-group"><h3>Ecosystem</h3>' +
    '<div class="sf-ex-item"><p><strong>SandForge Toolkit</strong> is a separate Workshop item. It does not require the loader. It hijacks Mods and Maps (code mods vs map packs) and prompts when the loader is required or would just make a feature better.</p></div>' +
    '<div class="sf-ex-item"><p>Workshop mods should keep working in Sandkit. Detect <code>window.SandforgeLoader.has()</code> or <code>window.__SF_HOST__</code>, then degrade and link here.</p></div>' +
    '<div class="sf-ex-item"><p>Created and maintained by <strong>InfinityTheHoly</strong>.</p></div></div>'
  );
}

function renderStatus(status) {
  var electron = status.electron ? "Ready" : "Waiting";
  var game = status.gameApi ? "Ready" : "Waiting";
  var worker = status.worker ? "Ready" : "Loads in-game";
  return (
    '<div class="sf-ex-grid">' +
    statCard("Loader", status.version || "1.0.0", "ok") +
    statCard("Electron plugin", electron, status.electron ? "ok" : "wait") +
    statCard("Game API", game, status.gameApi ? "ok" : "wait") +
    statCard("Workers", worker, status.worker ? "ok" : "wait") +
    statCard("Mods", String(status.enabled) + " / " + String(status.mods), "ok") +
    statCard("Anvil patches", String(status.patches), "ok") +
    statCard("Boots", String(status.boots || 0), "ok") +
    statCard("Platform", status.platform || "—", "wait") +
    statCard("Electron ver.", status.electronVersion || "—", "wait") +
    statCard("PID", status.pid != null ? String(status.pid) : "—", "wait") +
    "</div>"
  );
}

var panelTab = "status";

function setTab(id) {
  panelTab = id;
  var tabs = document.querySelectorAll("#sf-ex-tabs .sf-ex-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === id);
  }
  paintBody();
}

function paintTabs(active) {
  var tabs = document.getElementById("sf-ex-tabs");
  if (!tabs) return;
  if (!active) {
    tabs.innerHTML = "";
    return;
  }
  var items = [
    ["status", "Status"],
    ["electron", "Electron API"],
    ["game", "Game API"],
    ["worker", "Worker API"],
  ];
  tabs.innerHTML = items
    .map(function (row) {
      return (
        '<button type="button" class="sf-ex-tab' +
        (panelTab === row[0] ? " active" : "") +
        '" data-tab="' +
        row[0] +
        '">' +
        row[1] +
        "</button>"
      );
    })
    .join("");
  tabs.onclick = function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-tab]") : null;
    if (btn) setTab(btn.getAttribute("data-tab"));
  };
}

function paintFooter(active) {
  var footer = document.getElementById("sf-ex-footer");
  if (!footer) return;
  footer.innerHTML =
    '<button type="button" class="sf-ex-btn author" id="sf-ex-author">InfinityTheHoly</button>' +
    '<button type="button" class="sf-ex-btn" id="sf-ex-github">Loader repo</button>' +
    (active
      ? '<button type="button" class="sf-ex-btn" id="sf-ex-arcade">Arcade</button>' +
        '<button type="button" class="sf-ex-btn primary" id="sf-ex-relaunch">Relaunch (F6)</button>'
      : '<button type="button" class="sf-ex-btn primary" id="sf-ex-github-primary">Get the loader</button>');
  var author = document.getElementById("sf-ex-author");
  if (author) author.onclick = openAuthor;
  var gh = document.getElementById("sf-ex-github");
  if (gh) gh.onclick = openGithub;
  var ghp = document.getElementById("sf-ex-github-primary");
  if (ghp) ghp.onclick = openGithub;
  var arcadeBtn = document.getElementById("sf-ex-arcade");
  if (arcadeBtn) arcadeBtn.onclick = playEgg;
  var rel = document.getElementById("sf-ex-relaunch");
  if (rel) {
    rel.onclick = function () {
      var sf = window.sandforge || window.SandforgeGame;
      if (sf && typeof sf.relaunch === "function") sf.relaunch();
    };
  }
}

var lastStatus = {
  electron: false,
  gameApi: false,
  worker: false,
  mods: 0,
  enabled: 0,
  patches: 0,
  boots: 0,
  version: "",
  platform: "",
  electronVersion: "",
  pid: null,
};

function paintBody() {
  var body = document.getElementById("sf-ex-body");
  var title = document.getElementById("sf-ex-title");
  var sub = document.getElementById("sf-ex-sub");
  if (!body || !title) return;
  var active = isLoaderPresent();
  body.classList.toggle("api-view", active && panelTab !== "status");
  title.textContent = active ? "SandForge Active" : "SandForge not active";
  title.className = active ? "" : "inactive";
  if (sub) {
    sub.textContent = active
      ? "Loader is running. Statuses below are live from this session."
      : "Install the SandForge loader from GitHub, then launch Sandustry from Steam.";
  }
  if (!active) {
    body.innerHTML = renderInactive();
    return;
  }
  if (panelTab === "status") body.innerHTML = renderStatus(lastStatus);
  else body.innerHTML = renderDocs(panelTab);
}

function collectStatus() {
  var sf = window.sandforge || window.sandforgeAPI || window.SandforgeGame;
  lastStatus.gameApi = !!(window.__SANDFORGE_GAME_API__ || window.SandforgeGame);
  lastStatus.worker = !!(window.__SF_EXAMPLE_WORKER__);
  lastStatus.version = (sf && sf.version) || lastStatus.version || "";
  if (!sf || typeof sf.invoke !== "function") {
    paintBody();
    return Promise.resolve(lastStatus);
  }
  return sf
    .invoke("sandforge.example:status")
    .then(function (ping) {
      if (!ping || !ping.ok) return lastStatus;
      lastStatus.electron = true;
      lastStatus.version = ping.loader || lastStatus.version;
      lastStatus.mods = ping.mods || 0;
      lastStatus.enabled = ping.enabled != null ? ping.enabled : lastStatus.mods;
      lastStatus.boots = ping.boots || 0;
      lastStatus.patches =
        (ping.patcher && ping.patcher.queued && ping.patcher.queued.length) || 0;
      if (ping.app) {
        lastStatus.platform = ping.app.platform || "";
        lastStatus.electronVersion = ping.app.electron || "";
        lastStatus.pid = ping.app.pid;
      }
      if (ping.worker) lastStatus.worker = true;
      return lastStatus;
    })
    .catch(function () {
      return lastStatus;
    })
    .then(function () {
      paintBody();
      return lastStatus;
    });
}

function openPanel() {
  ensureOverlay();
  var overlay = document.getElementById("sf-example-overlay");
  if (!overlay) return;
  if (!isLoaderPresent()) panelTab = "status";
  paintTabs(isLoaderPresent());
  paintFooter(isLoaderPresent());
  paintBody();
  overlay.classList.add("open");
  collectStatus();
}

function closePanel() {
  var overlay = document.getElementById("sf-example-overlay");
  if (overlay) overlay.classList.remove("open");
}

function whenReady(callback) {
  if (isMainMenuScene()) {
    callback();
    return;
  }
  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (isMainMenuScene() || tries > 300) {
      clearInterval(timer);
      callback();
    }
  }, 200);
}

function playEgg() {
  var game = window.SandforgeArcade;
  if (game && typeof game.play === "function") {
    closePanel();
    return game.play();
  }
  try {
    sandkit.api.ui.toast(
      isLoaderPresent()
        ? "Arcade is still loading."
        : "Arcade needs the SandForge loader.",
    );
  } catch (_) {}
  return false;
}

window.SandforgeExample = {
  open: openPanel,
  close: closePanel,
  refresh: collectStatus,
  play: playEgg,
  markWorker: function () {
    window.__SF_EXAMPLE_WORKER__ = true;
    collectStatus();
  },
};

window.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  closePanel();
});

whenReady(function () {
  injectCss(FALLBACK_CSS);
  Promise.all([
    readModText("ui/panel.css").catch(function () {
      return "";
    }),
    readModText("lib/docs.js").catch(function () {
      return "";
    }),
    readModText("lib/solitaire.js").catch(function () {
      return "";
    }),
  ])
    .then(function (parts) {
      if (parts[0]) injectCss(parts[0]);
      if (parts[1]) runSource(parts[1], "lib/docs.js");
      if (parts[2]) runSource(parts[2], "lib/solitaire.js");
    })
    .catch(function (e) {
      console.warn("[sandforge.example] assets failed", e);
    })
    .then(function () {
      try {
        sandkit.api.ui.inject("sandforge-example-badge", StatusBadge);
      } catch (e) {
        console.warn("[sandforge.example] badge inject failed", e);
      }
      console.log("[sandforge.example] ready", isLoaderPresent() ? "loader" : "sandkit-only");
    });
});
