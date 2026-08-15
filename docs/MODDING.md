# SandForge Loader — modding

Workshop items and local mods use the same layout. Official Sandkit fields still work. Extra fields unlock full control **only when this loader is installed**.

Full method list: [API.md](API.md). Example: `examples/sandforge-example`.

## Manifest

```json
{
  "manifestVersion": 1,
  "id": "author.my-mod",
  "modID": "author.my-mod",
  "name": "My Mod",
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "you",
  "description": "What it does",
  "entry": "main.js",
  "electronEntrypoint": "entry.electron.js",
  "gameEntrypoint": "entry.game.js",
  "workerEntrypoint": "entry.worker.js",
  "workerEntrypoints": {
    "manager": "entry.manager.js",
    "simulation": "entry.sim.js"
  },
  "depends": ["other.mod"],
  "loadOrder": 10,
  "configSchema": {
    "enabled": { "type": "boolean", "default": true }
  }
}
```

`id` is the Sandkit field. `modID` / `modId` are aliases; they should match.

If you omit an entrypoint field, the loader still picks these filenames when they exist:

| Field | Default files |
| --- | --- |
| `electronEntrypoint` | `entry.electron.js`, then `sandforge-main.js` |
| `gameEntrypoint` | `entry.game.js` |
| `workerEntrypoint` | `entry.worker.js` (both workers) |
| `workerEntrypoints` | `{ both, manager, simulation }` — omit keys you do not use |

`depends` (or `dependencies`) loads those ids first (with `loadOrder`). Missing deps warn. Set `dependsRequired: true` to skip the mod instead. Lower `loadOrder` runs first.

Without the loader, Steam still loads `entry` / `patches.json` / maps as usual. Electron / game / worker entrypoints and Anvil JSON are ignored.

## When your code runs

1. **Electron** — `module.exports = function (api)` in the Steam-launched main process, **before** `app.asar` `main.js` compiles. Full Node. Queue Anvil patches here; the patcher seals after all electron plugins load.
2. **Game** — `entry.game.js` injected after the window’s `did-finish-load`. Sandkit / React are available. Loader IPC (`fs`, `store`, `net`, …) is **async**.
3. **Worker** — `workerEntrypoint` is appended to **both** workers. `workerEntrypoints.manager` / `.simulation` target one. Keep it small. There is no Node and no Anvil API here.

Detect the loader with `window.SandforgeLoader.has()` or `window.__SF_HOST__`. In the page, `window.sandforge` (also `window.SandforgeGame`). In Electron, `api` is the argument; `global.sandforge` is set while that plugin loads.

Capture `const api = window.sandforge` in `entry.game.js`. Each entry is bound to its own id so `store` / `settings` / `assets` cannot leak to another mod.

## Workshop ecosystem

The loader is **not** a Workshop item. Workshop mods must keep working in official Sandkit.

- Detect: `window.SandforgeLoader.has()` or `window.__SF_HOST__`.
- Required features (enable/disable, maps larger than 3840, Electron windows): prompt and link to GitHub. Do not hard-crash.
- Optional upgrades: prompt once, then continue. SandForge Toolkit does this for menus and the editor.
- Map-only packs (`map` in `modinfo.json`, no `entry`) belong in **Maps**, not **Mods**. Code mods stay in Mods. Hybrids can appear in both.
- Shared GitHub URL: `https://github.com/sandforge/sandforge-loader`

Companion Workshop items: **SandForge** (`sandforge.example`) for status/docs, **SandForge Toolkit** (`sandustry.sandforge-tk`) for menus and the editor.

## Assets in the game page (`file://` vs `sandforge://`)

With the loader, the game runs as `sandforge-ui://game/…`. Chromium **blocks** `file://` from that origin (`Not allowed to load local resource`). `sandkit.api.assets.getUrl()` still returns a disk URL. Do not `fetch` / `<img src>` / CSS `url()` that.

**In the page, use a privileged URL or `mods.read`:**

```js
function assetUrl(rel) {
  var sf = window.sandforge || window.SandforgeGame;
  if (sf && sf.assets && typeof sf.assets.url === "function") {
    return sf.assets.url(rel); // sandforge://<thisMod>/rel
  }
  try {
    return sandkit.api.assets.getUrl(rel); // file:// — only works without the loader
  } catch (_) {}
  return "";
}

function readModText(rel) {
  var sf = window.sandforge || window.SandforgeGame;
  var url = assetUrl(rel);
  if (url && !/^file:/i.test(url)) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(rel);
      return res.text();
    });
  }
  if (sf && sf.mods && typeof sf.mods.read === "function") {
    return Promise.resolve(sf.mods.read(sf.modId || "author.my-mod", rel));
  }
  return fetch(url).then(function (res) { return res.text(); });
}
```

| Do | Do not |
| --- | --- |
| `api.assets.url("ui/panel.css")` | `file:///` + disk path |
| `sandforge://author.my-mod/img/x.png` | `electron.localMods.getFolder()` then `file://` |
| `api.mods.read(id, "modinfo.json")` | `api.mods.fileUrl` expecting a disk path **in the page** |
| `sandkit.api.assets.getUrl` only when the page is not `sandforge-ui:` | XHR/`fetch` a `file://` as a fallback |

`fileUrl` in the **game** API is an alias of `assetUrl` (`sandforge://`). In **Electron** main, `api.mod.fileUrl` is still a real disk `file://` for Node.

The loader also rewrites leftover `file://` on images, scripts, CSS, and audio at dom-ready, and wraps Sandkit `getUrl`. Do not rely on that for new code — build `sandforge://` yourself.

Another mod’s files: `sandforge://<theirId-or-folder>/map/terrain.png` (or `api.assets.url("map/terrain.png", otherId)`).

Popout windows created with `api.windows.create({ file: "ui/x.html" })` load as `sandforge://<mod>/ui/x.html`. Relative assets in that HTML resolve under the mod folder.

Full URL table: [API.md — sandforge:// assets](API.md#sandforge-assets).

## Electron (`entry.electron.js`)

```js
module.exports = function (api) {
  api.log("info", "hello");

  api.patcher.add({
    id: "author.my-mod:x",
    file: "js/bundle.js",
    find: "old snippet",
    replace: "new snippet",
    expect: 1,
  });

  api.handle("author.my-mod:ping", () => ({ ok: true }));
};
```

Electron plugins are **not** sandboxed. `api.fs` / `api.shell` / `api.net` are. You can still `require()` anything Node can see.

### Anvil (`api.patcher`)

| Call | Effect |
| --- | --- |
| `replace` | Swap the match |
| `prefix` / `insertBefore` | Insert before |
| `postfix` / `insertAfter` | Insert after |
| `wrap` | `before + match + after` |
| `remove` | Delete match |
| `transform(file, fn)` | Full-file function |
| `file("js/bundle.js").find(...).replace(...).expect(1).apply()` | Fluent |

**Works:** `js/bundle.js`, workers, `index.html`, `css/…`, `main.js`, `workshop-mods.js`.

**Also:** `preload.js` (applied to the extracted stock preload; the loader chain still runs). Binary `{ "operation": "asset", "from": "file.png" }` replacements.

JSON: `anvil.json` or `sandforge-patches.json` (array, or `{ "patches": [ … ] }`). Same objects as `api.patcher.add`.

```json
[
  {
    "id": "author.my-mod:loading",
    "file": "js/bundle.js",
    "find": "old snippet",
    "replace": "new snippet",
    "expect": 1,
    "phase": "late",
    "priority": 0
  }
]
```

Named form: `{ "type": "replace", "from": "a", "to": "b $", "token": "$", "expectedMatches": 1 }`.

`expectedMatches` default `1`. `0` / `-1` / `"any"` = all matches. `phase` is `early` or `late` (default `late`). Higher `priority` runs first.

Official Sandkit `patches.json` is unchanged and still `js/*.js` only.

## Game (`entry.game.js`)

Runs in the renderer after the window loads. `runtime/game-api.js` is injected first.

```js
const api = window.sandforge;
api.invoke("author.my-mod:ping").then(console.log);
api.ui.toast("hello");
api.commands.register("ping", () => api.ui.toast("pong"), "toast pong");
// api.modId / api.store / api.settings stay on this mod
```

Sandkit namespaces are on `api.game.*`. **Ctrl+`** opens the command prompt.

`api.bind(id)` is how the loader attaches that id. Do not read `window.__SF_CURRENT_MOD__` after the entry returns.

## Worker (`entry.worker.js`)

String `workerEntrypoint` is the same source on both workers. Use `workerEntrypoints` to split. Talk to the page with `{ __sf: 1, channel, payload }`:

```js
const api = self.sandforge;
api.log("info", "worker " + api.version);
api.on("author.my-mod:ask", (data) => {
  api.sendGameMessage("author.my-mod:reply", { ok: true, data: data });
});
```

In the game: `api.workers.on((channel, payload) => { … })`. Workers can `api.invoke` / `api.dispatch` / `api.fs` through the loader RPC. `mods.reload` re-evals worker plugins in place.

## Events

Electron (`api.events` / `api.bus`): `sf:mod-loaded`, `sf:all-mods-loaded`, `sf:game-started`, `sf:game-closed`, `sf:mod-config-changed`, `sf:window-created`.

Game: `sf:scene-loaded` (local, when Sandkit’s active scene changes). `api.on` also receives Electron `sendGameEvent` / `bus.emit`.

## Settings and disable

| What | Where |
| --- | --- |
| Per-mod settings | `%AppData%\Roaming\sandustry\mods\config\<id>.json` (`api.settings` / `api.modConfig`) |
| Per-mod store | `%AppData%\Roaming\sandustry\mod-store\<id>.json` |
| Disable a mod | `loader-config.json` → `"disabled": ["author.my-mod"]` |

F6 relaunches after changes.
