# SandForge API

SandForge exposes related APIs in three runtimes:

- Electron: `module.exports = function (api)`
- Game renderer: `window.sandforge`
- Game workers: `self.sandforge`

Shared methods use the same names and arguments where possible, but each
runtime has different capabilities. Calls that cross from the game or a worker
into Electron return a **Promise**. Electron methods are not IPC-wrapped, but
their native return values may still be promises (for example network and
dialog methods).

In a game entrypoint, capture the API when your entry runs
(`const api = window.sandforge`). `api.bind(modId)` returns a copy whose
`store` / `settings` / `assets` stay on that id. Do not read
`window.__SF_CURRENT_MOD__`.

Detect: `window.SandforgeLoader.has()` (the loader sets this). Also `window.__SF_HOST__`.

Official Sandkit still works. This API sits on top of it.

## Runtime overview

| Capability | Electron | Game | Worker |
| --- | --- | --- | --- |
| Sandkit/game APIs | No | Direct | Worker Sandkit API |
| Files, network, Steam | Direct API | Async IPC | Async RPC subset |
| Store and settings | Direct API | Async IPC | Raw RPC only |
| Windows and dialogs | Direct API | Async IPC | Raw RPC only |
| Anvil patcher | Full API | Async subset | Raw RPC for string patches |
| Node.js / `require()` | Yes | No | No |

Jump to [Electron](#electron-entryelectronjs),
[Game](#game-entrygamejs), [Worker](#worker-entryworkerjs),
[`sandforge://` assets](#sandforge-assets), or
[manifest fields](#manifest-extras).

**Canonical names** (aliases still work, do not use them in new code):

| Job | Use |
| --- | --- |
| Mod id | `id` |
| Dependencies | `depends` |
| List / disable | `api.mods.list`, `api.mods.disable`, `api.mods.getDisabled` |
| Settings | `api.settings` |
| Paths | `api.paths` |
| Events | `api.on` / `api.emit` / `api.handle` |
| Loader RPC | `api.rpc(ns, method, args)` (workers). Game: same, or `api.invoke` for your own channels. |
| Patch | `api.patcher.add({ id, file, find, replace, expect })` or `anvil.json` |

**Electron plugins have full Node.** `api.fs`, `api.shell`, and `api.net` are sandboxed to local mods, Workshop folders, `%AppData%\sandustry`, and the loader directory. Network is http/https only (8 MB GET, 32 MB download). Game-world copies of those methods go through IPC and are async.

Loader errors are `SandforgeError` instances with an `err.code` value:
`PATCH_SEALED`, `PATCH_NEEDS_FIND`, `MATCH_COUNT`, `PATH_DENIED`,
`PATH_INVALID`, `UNKNOWN_MOD`, `UNKNOWN_API`, `NO_WINDOW`, `NO_HANDLER`,
`IPC_INVOKE`, or `RELOAD`.

---

## Electron (`entry.electron.js`)

```js
module.exports = function (api) {
  api.log("info", api.mod.id);
};
```

`api` is also `global.sandforge` while that plugin loads. `api.help()` returns the top-level key names. `api.apiLevel` is `1`. `api.handle` / `api.emit` / `api.on` are the event trio (`handleGameIPC` / `sendGameEvent` still work).

### Identity

| | |
| --- | --- |
| `api.version` / `api.apiVersion` | `"1.0.0"` |
| `api.environment` | `"electron"` |
| `api.modId` | this mod's id |
| `api.mod` | `{ id, name, version, author, dir, source, workshopId, info, fileUrl, read, readJson, write, list }` |
| `api.log(level, message)` | console |
| `api.log(level, tag, message)` | tagged console |

`api.mod.source` is `"local"` or `"workshop"`. `write` / `list` stay inside
that mod’s folder; `list` returns `{ name, isDirectory, isFile }[]`.

### `api.app`

`version`, `loaderVersion`, `platform`, `arch`, `electron`, `chrome`, `node`,
`pid`, `maxMapDimension`, `isPackaged`, `getLocale()`, `whenReady()`,
`relaunch()`, `quit()`. Renderer `api.app.info()` resolves to the runtime
identity fields plus the configured `maxMapDimension`.

### `api.paths`

`loader`, `game`, `asar`, `ui`, `mods`, `data`, `workshop`, `saves`, `maps`, `meta`, `store`, `steamAppId`, `get()`.

`workshop` is an array of roots. `saves` / `maps` / `meta` / `store` are under `%AppData%\sandustry`.
`get()` returns the portable subset: `loader`, `game`, `asar`, `ui`, `mods`,
`data`, `workshop`, and `steamAppId`.

### `api.fs` (sandboxed)

`resolve`, `exists`, `stat`, `readText`, `readJson`, `readBinary`, `write`, `writeJson`, `append`, `mkdir`, `remove`, `copy`, `list`, `hash`.

Relative paths resolve under the local mods folder. Absolute paths must stay inside allowed roots. `remove` is recursive.
`list()` returns `{ name, isDirectory, isFile }[]`.

### `api.store`

Per-mod JSON at `%AppData%\sandustry\mod-store\<id>.json`.

`get(key, fallback)`, `get()` whole object, `set(key, value)`, `set(object)`, `remove(key)`, `clear()`.

Bulk `set(object)` is available in Electron. The game IPC facade uses
`set(key, value)` only.

### `api.settings`

`schema()` from `modinfo.json` `configSchema`, `get()`, `set(obj)`, `patch(partial)`. Files: `%AppData%\sandustry\mods\config\<id>.json` (same as `api.modConfig`).

### `api.mods`

`list()`, `get(id)`, `enabled()`, `disable(ids)`, `getDisabled()`,
`assetUrl(modId, rel)` → `sandforge://…`, `fileUrl(modId, rel)`,
`read(modId, rel)`, `reload(id?)`, `unload(id?)`, `missingDeps()`.

In Electron, `mods.fileUrl` returns a disk `file://` URL while
`mods.assetUrl` returns `sandforge://`. In the game, both names return a
`sandforge://` URL.

`disable` writes `loader-config.json`, unloads that mod’s electron resources, rebuilds renderer patches, and reloads game windows. Sandkit’s in-page mod list is filtered immediately. `setDisabled` is an alias.

`reload(id)` unloads first (IPC, extra windows, shortcuts, watchers, timers, trays, sockets), then re-requires the electron entry and re-injects the game entry. Worker files still need F6.

`unload(id)` tears those resources down without loading again.

### `api.patcher` (Anvil)

Queue patches **before** the patcher seals (after all electron plugins). After seal, `add` / `unpatch` throw until `unseal()`.

`unseal()` / `isSealed()` / `applyPreload()` — late Anvil. Renderer files need `windows.reload()` after you queue more patches. Main-process files (`main.js`, `workshop-mods.js`) still need a relaunch.

Canonical: `add({ id, file, find, replace, expect })`. `expect` default `1`.
Also `set`, `replace`, `prefix`, `postfix`, `bodyPrefix`, `wrap`, `remove`,
`transform`, `transpiler`, and
`file(path).find(…).replace(…).expect(1).apply()`, plus `unpatch`, `read`,
`preview`, `dump`, `list`, `status`, `unseal`, `isSealed`, `applyPreload`.
Compatibility helpers include `addPatch`, `setPatch`, `removePatch`,
`patchExists`, `addMappedPatch`, and `setMappedPatch`.

`status()` includes `sealed`.

Fluent extras: `.regex(pattern, flags)`, `.occurrence(n|"all")`,
`.phase("early"|"late")`, `.priority(n)`, `.id(tag)`, `.atomic(value)`,
`.wrap(before, after)`, `.remove()`.

JSON: `anvil.json` or `sandforge-patches.json` in the mod folder. See [MODDING.md](MODDING.md#anvil-apipatcher).

| File kind | How it applies |
| --- | --- |
| `js/*.js` | Sandkit workshop patch pipeline (string ops) plus `transform` |
| `css/…`, `index.html` | In-memory renderer sources |
| `main.js`, `workshop-mods.js`, other asar `.js` | Main-process `require` hook |
| `preload.js` | Applied to the extracted stock preload (`stock-preload.patched.js`). Loader `preload-chain.js` still runs. Call `patcher.applyPreload()` after late adds, then `windows.reload()`. |
| Binary asar assets | `{ "file": "img/foo.png", "operation": "asset", "from": "override/foo.png" }` in `anvil.json` — served from the mod folder |

`read` / `preview` / `dump` use the **original** asar bytes. `dump` writes `%AppData%\sandustry\meta\sandforge-patch-dump\`.

### `api.windows`

`list`, `get(id)`, `current`, `create`, `close`, `show`, `hide`, `focus`, `reload`, `minimize`, `maximize`, `unmaximize`, `setTitle`, `setSize`, `setBounds`, `getBounds`, `setFullScreen`, `isFullScreen`, `setZoom`, `getZoom`, `setAlwaysOnTop`, `openDevTools`, `executeJavaScript`, `insertCSS`, `send`, `broadcast`, `capturePage` (PNG buffer), `captureRegion(rect, id?)`, `captureToClipboard`, `printToPDF(opts, id?)`.

`create({ file, html, path, width, height, title, alwaysOnTop, display, parent,
backgroundColor, maximizable, minimizable, fullscreenable, resizable,
autoHideMenuBar, injectGame })` loads HTML from this mod’s folder only.
`file` is the normal relative-path option; `path` is an alias, while `html`
supplies markup directly. `display` is a display id or index; the window is
centered on that monitor. `parent` defaults to the game window (`false` =
none). The window gets the loader preload + game API. `injectGame: true` also
runs this mod’s `entry.game.js` there.

Most methods take an optional window `id`. Omitted = first live window. `send` / `broadcast` fire `sandforge-event` in the renderer (`api.on` in the game).

### `api.dialog`

`open`, `save`, `message`, `error`. Electron dialog options objects.

### `api.clipboard`

`readText`, `writeText`, `readImage` (PNG `Buffer` or `null`), `writeImagePng`, `writePage(id?)` (same as `windows.captureToClipboard`).

### `api.shell`

`openPath` (allowed folders only), `openUrl` (http/https), `showItemInFolder`.

### `api.net`

`fetch` / `get` / `getJson` / `post` / `request` (http/https, 8 MB default, 20 s timeout), `download(url, destRel)` (32 MB, allowed folders), `ws(url)` (ws/wss only).

In Electron, `ws` returns `{ on, off, send, close }`. In the game,
`await api.net.ws()` returns `{ on, send, close }`; it has no `off` method.
Socket activity also arrives through `sf:ws:open`, `sf:ws:message`,
`sf:ws:close`, and `sf:ws:error`.

`get` / `fetch` resolve `{ status, headers, body }`.

### `api.crypto`

`randomId()`, `hash(text, algo?)` (default `sha256`), `hashFile(rel, algo?)`.

### `api.time`

`now()`, `iso()`, `sleep(ms)`.

### `api.notify`

`show(title, body, { actions, onClick, onAction, silent })` — OS notification. `actions` are `{ type, text }` buttons where the OS allows them. Clicks emit `sf:notify-click` / `sf:notify-action`.

### `api.tray`

`create({ icon, tooltip, menu, onClick })`. `icon` is a file inside the mod folder. Destroyed on `mods.unload`.

### `api.steam`

`appId` (`2764460`), `workshopRoots`, `gameRoot`, `info()`, `subscribe(id)`, `unsubscribe(id)`, `download(id, highPriority?)`, `state(id)`, `installInfo(id)`, `downloadInfo(id)`, `subscribed()`, `getItem(id)`, `getItems(ids)`, `query({ page, search, tags })`.

Uses the game’s `steamworks.js`. Item ids are strings. No Workshop upload.

### `api.saves`

`list()` filenames in `saves/`, `maps()` filenames in `custom_maps/`.

### `api.logFile`

`write(line)` → `%AppData%\sandustry\meta\sandforge-loader.log`.

### `api.bus`

Process-wide pub/sub. `emit` also broadcasts to every renderer.

`on(channel, fn)`, `off`, `once`, `emit(channel, data)`, `channels()`.

### `api.registry`

Shared in-memory bag for inter-mod services. Lost on relaunch.

`set(ns, key, value)`, `get(ns, key, fallback)`, `has`, `remove`, `list(ns)`, `keys`, `clear`, `namespaces`.

### `api.watch`

`dir(rel, fn)` → unwatch. `fn({ event, filename, dir })`. Allowed folders only.

### `api.screen`

`displays()`, `primary()`.

### `api.shortcuts`

Electron `globalShortcut`: `register(accelerator, fn)`, `unregister`, `unregisterAll`, `isRegistered`.

### `api.images`

`fromFile(rel)` PNG buffer, `fromPng(buf)` NativeImage, `resize(buf, w, h)` PNG, `size(buf)`.

### `api.timers`

`timeout`, `interval`, `clear`.

### `api.assets`

In Electron, `url(rel)` → `sandforge://<modId>/…` while `fileUrl(rel)` returns
a disk `file://` URL. `read` and `readBinary` read from the current mod. In the
game page, `fileUrl` is an alias of `url`.

### `api.util`

`join`, `basename`, `dirname`, `extname`, `fileUrl`, `assetUrl`, `clamp`, `lerp`, `deepClone`, `deepMerge`, `pick`, `omit`, `debounce`, `throttle`, `uid`, `base64Encode`, `base64Decode`, `parseJson`, `semverCompare`, `hexToRgb`, `rgbToHex`, `rng(seed)`.

### `api.events`

`on`, `off`, `once`, `trigger` / `emit`.

| Event | When |
| --- | --- |
| `sf:mod-loaded` | Each electron plugin finished |
| `sf:mod-unloaded` | An electron plugin was unloaded |
| `sf:all-mods-loaded` | After every electron plugin |
| `sf:game-started` | The game window was created |
| `sf:game-closed` | App quit |
| `sf:mod-config-changed` | `modConfig.set` / settings IPC |

These are Electron-local events. Renderer events use `api.on`: the loader
sends `sf:window-created`, `sf:mod-unloaded`, and `sf:mods-disabled`, and
`api.bus.emit` broadcasts custom channels. `sf:scene-loaded` is game-local
(see below). Notifications emit `sf:notify-click` / `sf:notify-action` on the
bus; game WebSockets emit the four `sf:ws:*` channels listed above.

### Events / game IPC

`api.handle(channel, handler)` — renderer `api.invoke(channel, …args)` calls it.

`api.emit(channel, data)` — renderer `api.on(channel, fn)`.

`handleGameIPC` / `sendGameEvent` / `api.ipc.handle` / `send` / `broadcast` are aliases. `api.ipc.invoke` throws (`IPC_INVOKE`) — that is not request/response.

### Path helpers

Aliases of `api.paths` / `api.mods`: `getModsPath`, `getGameBasePath`, `getGameAsarPath`, `getGameRoot`, `getTempBasePath`, `getTempExtractedPath`, `getUserDataPath`, `getAppPath`, `getInstalledMods`, `getLoadedMods`, `getEnabledMods`, `modConfig.get/set`.

---

## Game (`entry.game.js`)

Injected after `runtime/game-api.js`. Globals: `window.sandforge`,
`window.sandforgeAPI`, `window.SandforgeGame`, and the compatibility alias
`window.sandforgeGame`. Loader detection is available through
`window.SandforgeLoader.has()`, `openGithub()`, `window.__SF_HOST__`, and
`window.__SANDFORGE_LOADER__`.

Each game entry is injected with `api.bind(id)` so `api.modId` / `store` / `settings` / `assets` stay on that mod. Capture `const api = window.sandforge` in the entry. `api.environment === "game"`, `api.isLoader`. `window.__SF_CURRENT_MOD__` is only set while the entry runs; do not read it later.

Loader IPC methods return **Promises**. Electron-only surfaces stay off the page: `shortcuts`, `images`, `watch`, `timers`, `tray`, `help`. Everything else below is on the game object.

The merged preload bridge also retains legacy methods: `getModsPath`,
`getPaths`, `writeFile`, `invokeElectronIPC`, `handleElectronEvent`,
`gameEntrypoints`, and `modConfig.get/set`. New code should use `api.paths`,
`api.fs`, `api.invoke` / `api.on`, and `api.settings`.

### Sandkit

`api.sandkit`, `api.react`, `api.enums`, `api.game.<namespace>` lazy-proxies every official `sandkit.api` namespace (`elements`, `structures`, `world`, `grid`, `player`, `camera`, `ui`, `hooks`, `input`, `scene`, …).

`api.game.sandkit()`, `api.game.engine()`, `api.game.debug()`, `api.game.instance()`.

`api.hooks.intercept` / `modify` → `sandkit.api.hooks`.

`api.world.player()`, `camera()`, `cell(x,y)`, `setCell(x,y,value)`, `mouseCell()`.

`api.input.bind(id, keys, handlers)`, `mouseCell()`, `onKey(code, fn)`.

`api.scene.get()`, `onChange(fn)`, `isMenu()`.

`api.i18n.add(key, value, locale?)`, `t(key, fallback)`.

### UI

`api.ui.toast`, `alert`, `confirm`, `prompt`, `inject` (Sandkit React), `css(id, css)` → remover, `overlay(id, html)`, `panel(id, { html, style })`, `remove(id)`.

### Time / commands

`api.tick.every(ms, fn)`, `next(fn)`, `onFrame(fn)`.

`api.commands.register(name, fn, help)`, `run`, `list`. **Ctrl + backtick**
opens a prompt.

Built-in: `mods`, `scene`, `toast`, `help`, `relaunch`, `reload [id]`.

### Loader IPC

`api.fs.*` (including `readBinary`; no `resolve`), `store`
(`get(key)`, `set(key, value)`, `remove`, `clear`), `settings`
(`get`/`set`/`patch`/`schema`/`panel()`), `mods` (`list`, `assetUrl`,
`fileUrl`, `read`, `getDisabled`, `disable`/`setDisabled`, `reload`,
`unload`), `paths.get()`, `net`
(`fetch`/`get`/`post`/`getJson`/`download`/`request`/`ws`), `dialog`,
`clipboard`, `shell`, and `windows` (`list`, `create`, `close`, `show`,
`hide`, `focus`, `reload`, `openDevTools`, `executeJavaScript`, `insertCSS`,
`setTitle`, `setSize`, `setFullScreen`, `isFullScreen`, `setZoom`, `getZoom`,
`getBounds`, `setBounds`, `minimize`, `maximize`, `unmaximize`,
`setAlwaysOnTop`, captures, PDF, and `broadcast`). It also exposes `notify`,
`screen`, `saves`, `crypto`, partial `registry` (`get`/`set`/`list`), partial
`bus` (`on`/`emit`), `steam`, `logFile.write`, the patcher subset, `app`,
`relaunch()`, and `log`.

`windows.create` uses the bound `api.modId` if you omit `modId`. HTML still has to live in that mod folder. Created windows get the loader preload and `game-api.js` (so `invoke` / `store` / `fs` work). They do **not** run other mods’ `entry.game.js` unless you pass `injectGame: true`.

`settings.panel()` opens an overlay form from `configSchema`.

`api.invoke(channel, …args)` → Electron `handleGameIPC`.

`api.send(channel, data)` and `api.emit(channel, data)` are aliases that
broadcast to all windows.

`api.on(channel, fn)` receives channels sent from Electron by
`sendGameEvent`, `windows.broadcast`, or `bus.emit`.

`api.events.on(channel, fn)` is the game-local event bus and receives events
raised with `api.events.emit`, including `sf:scene-loaded`. It does not receive
Electron events.

`api.rpc(ns, method, args)` — raw dispatch (`"fs"`, `"readText"`, `[rel]`). `api.api` is an alias.

Scene changes also emit local `sf:scene-loaded`.

### Assets / audio / workers

`api.assets.url(rel, modId?)` and its `fileUrl` alias → `sandforge://…` (use
in `<img>`, `fetch`, CSS).

`api.assets.image`, `api.assets.audio`.

`api.audio.play(src, { volume, loop })`.

`api.workers.on(fn)` — `fn(channel, payload)` for `{ __sf: 1 }` worker messages.

`api.util.clamp`, `lerp`, `deepClone`, `uid`, `debounce`.

---

## Worker (`entry.worker.js`)

The worker API is **prepended**, then the stock worker, then your file.

`workerEntrypoint` (string) still means **both** workers. To target one:

```json
"workerEntrypoints": {
  "both": "entry.worker.js",
  "manager": "entry.manager.js",
  "simulation": "entry.sim.js"
}
```

Aliases: `workers`, `all`, `sim`, `managerWorker`, `simulationWorker`. Omit keys you do not use.

`self.sandforge` / `self.sandforgeAPI` / `self.SandforgeWorker`:

`version`, `environment: "worker"`, `isLoader`, `sandkit`, `api` (the
Sandkit worker API), `invoke`, `rpc` / `dispatch`, `fs`, `on` / `off` /
`once` / `listenGameMessage`, `sendGameMessage(channel, payload)`, `emit`,
`log`, `now`, `util.clamp` / `lerp`.

Messages use `{ __sf: 1, channel, payload }` and are bridged through the loader
bus. Game listens with `api.workers.on`; worker `sendGameMessage` / `emit`
return a Promise for bridge completion.

Worker `api.fs` contains only `exists`, `readText`, `readJson`, `write`, and
`list`. Other loader routes require `api.rpc(ns, method, args)` through
`sandforge://loader/rpc`. `api.invoke(channel, …args)` calls a mod IPC handler;
`api.api` is Sandkit’s worker API, not loader RPC. `dispatch` is an alias of
`rpc`. String Anvil patches can use
`api.rpc("patcher", "add", [patch])` after `unseal`; function transforms still
need an Electron entrypoint.

`mods.reload` / `setDisabled` bump a worker generation. Running workers re-eval their plugin sources within a few seconds. `api.workers.reload()` from the game does the same.

---

## `sandforge://` assets

The game window is `sandforge-ui://game/…`. Chromium blocks `file://` from that origin. Sandkit `assets.getUrl()` still returns a disk URL — do not fetch it.

| URL | Resolves to |
| --- | --- |
| `sandforge://<modId>/path` | that mod's folder |
| `sandforge://mod/<modId>/path` | same |
| `sandforge://mods/<modId>/path` | same |
| `sandforge://data/…` | `%AppData%\sandustry\…` |
| `sandforge://loader/…` | loader folder |

No `..`. Host can be the mod id, folder name, or Workshop item id. `fetch` and `<img src>` work. Dedicated `Worker` scripts should be loaded with `fetch(api.assets.url(rel))` or `api.mods.read` and a blob URL — Chromium often blocks `new Worker("file.js")` on custom schemes even when the HTML itself is `sandforge://`.

**Page (renderer):** `api.assets.url(rel)`, `api.mods.assetUrl(id, rel)`, or `api.mods.fileUrl` (same thing — `sandforge://`, never disk). Or `api.mods.read(id, rel)` for text.

**Electron main:** `api.mod.fileUrl(rel)` / `api.fs` are real disk paths. Node can read them. Do not send those strings into the game page.

**Sandkit-only (no loader):** `sandkit.api.assets.getUrl(rel)` is `file://` and works, because the stock page is not `sandforge-ui:`.

A dom-ready guard rewrites leftover `file://` on images, scripts, CSS, and audio, and wraps `getUrl`. New code should still build `sandforge://` itself. How-to and a copy-paste helper: [MODDING.md — Assets in the game page](MODDING.md#assets-in-the-game-page-file-vs-sandforge).

---

## Manifest extras

```json
{
  "id": "author.my-mod",
  "modID": "author.my-mod",
  "author": "you",
  "depends": ["other.mod"],
  "dependsRequired": false,
  "loadOrder": 10,
  "configSchema": { "enabled": { "type": "boolean", "default": true } },
  "electronEntrypoint": "entry.electron.js",
  "gameEntrypoint": "entry.game.js",
  "workerEntrypoint": "entry.worker.js",
  "workerEntrypoints": {
    "manager": "entry.manager.js",
    "simulation": "entry.sim.js"
  }
}
```

Also accepted: `modId`, `dependencies`, `hardDepends`, `workers`, and
`sandforge.electronEntrypoint`. Default filenames if fields are omitted:
`entry.electron.js` / `sandforge-main.js`, `entry.game.js`,
`entry.worker.js`.

Missing `depends` log a warning. `dependsRequired: true` skips the Electron
entrypoint when a dependency is missing, but game and worker entrypoints must
guard required dependencies themselves. Local mods override Workshop on the
same id. Folders named `node_modules`, `wrapper`, `runtime`, `loader`, `.git`,
or starting with `.` are not scanned.

---

## What this will not do

No arbitrary disk through `api.fs` / `api.shell` (Electron `require` is a different story). No `file://` shell to system folders. No cookies/credentials. Network is http/https/ws/wss only. No Workshop upload of the loader itself.

TypeScript types:
[`types/sandforge.d.ts`](../types/sandforge.d.ts) (`package.json` `"types"`).
