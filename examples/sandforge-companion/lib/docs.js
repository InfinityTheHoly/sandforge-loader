/**
 * In-game SandForge API reference (shown when the loader is active).
 */
(function (root) {
  root.SandforgeCompanionDocs = [
    {
      id: "electron",
      label: "Electron",
      blurb: "entry.electron.js — Node, before app.asar compiles. module.exports = function (api) { … }",
      groups: [
        {
          title: "Identity",
          items: [
            { name: "api.version / api.apiVersion", desc: "Current loader and API versions." },
            { name: "api.environment", desc: "\"electron\"." },
            { name: "api.modId / api.mod", desc: "This mod's id and { id, name, version, author, dir, source, workshopId }." },
            { name: "api.log(level, message)", desc: "Console (optional tag as second arg)." },
            { name: "window.SandforgeLoader.has()", desc: "Workshop-safe detect. Also window.__SF_HOST__. Degrade if false; do not hard-crash." },
          ],
        },
        {
          title: "App / paths",
          items: [
            { name: "api.app", desc: "version, platform, arch, electron, chrome, node, pid, maxMapDimension, relaunch(), quit()." },
            { name: "api.paths", desc: "loader, game, asar, ui, mods, data, workshop, saves, steamAppId." },
          ],
        },
        {
          title: "Mods / store / settings",
          items: [
            { name: "api.mods.list() / disable(ids) / getDisabled()", desc: "Discovered mods. setDisabled is an alias of disable." },
            { name: "api.store", desc: "Per-mod JSON. get(key, fallback), set(key, value)." },
            { name: "api.settings", desc: "configSchema from modinfo.json. get(), set(), patch()." },
          ],
        },
        {
          title: "Filesystem (sandboxed)",
          items: [
            { name: "api.fs", desc: "exists, readText, readJson, write, writeJson, list, mkdir, remove, copy, hash. Local mods / Workshop / AppData only." },
          ],
        },
        {
          title: "Anvil patcher",
          items: [
            { name: "api.patcher.add({ id, file, find, replace, expect })", desc: "Canonical patch. Also replace/prefix/postfix/wrap/remove/transform." },
            { name: "anvil.json", desc: "Or sandforge-patches.json in the mod folder." },
          ],
        },
        {
          title: "IPC / bus",
          items: [
            { name: "api.handle(channel, fn)", desc: "Renderer api.invoke(channel, …args) calls this. handleGameIPC is an alias." },
            { name: "api.emit(channel, data)", desc: "Renderer api.on(channel, fn). sendGameEvent is an alias." },
            { name: "api.bus / api.events", desc: "Process-wide pub/sub. sf:game-started, sf:window-created, …" },
            { name: "api.registry", desc: "Shared in-memory bag. set(ns, key, value), get(ns, key)." },
          ],
        },
        {
          title: "OS helpers",
          items: [
            { name: "api.dialog / api.clipboard / api.notify", desc: "Native dialogs, clipboard, OS notifications." },
            { name: "api.shell.openUrl(url)", desc: "http/https only. openPath is limited to allowed folders." },
            { name: "api.net.fetch / get / post / download", desc: "http/https, size-capped." },
            { name: "api.windows", desc: "list, reload, openDevTools, executeJavaScript, setTitle, capturePage." },
          ],
        },
      ],
    },
    {
      id: "game",
      label: "Game",
      blurb: "entry.game.js — renderer after the window loads. window.sandforge / window.SandforgeGame.",
      groups: [
        {
          title: "Sandkit",
          items: [
            { name: "api.sandkit / api.react / api.enums", desc: "Official Sandkit objects." },
            { name: "api.game.*", desc: "Lazy proxies for every sandkit.api namespace (ui, hooks, scene, world, …)." },
            { name: "api.hooks.intercept / modify", desc: "sandkit.api.hooks." },
            { name: "api.scene.get() / onChange / isMenu()", desc: "Current scene." },
            { name: "api.world.player() / cell(x,y) / setCell", desc: "World helpers." },
          ],
        },
        {
          title: "UI / time",
          items: [
            { name: "api.ui.toast / alert / confirm / prompt", desc: "Simple prompts." },
            { name: "api.ui.inject(id, Component)", desc: "Sandkit React overlay." },
            { name: "api.ui.css / overlay / panel / remove", desc: "DOM helpers." },
            { name: "api.tick.every / next / onFrame", desc: "Timers." },
            { name: "api.commands.register(name, fn, help)", desc: "Ctrl+` command prompt. Built-in: mods, scene, toast, help, relaunch." },
          ],
        },
        {
          title: "Loader IPC (async)",
          items: [
            { name: "api.bind(modId)", desc: "Copy whose store/settings/assets stay on that id. Capture const api = window.sandforge in the entry." },
            { name: "api.invoke(channel, …args)", desc: "Calls Electron api.handle." },
            { name: "api.on(channel, fn)", desc: "Messages broadcast from Electron with api.emit / sendGameEvent." },
            { name: "api.events.on(name, fn)", desc: "Renderer-local loader lifecycle events." },
            { name: "api.fs / store / mods / paths.get()", desc: "Same names as Electron, all Promises." },
            { name: "api.app.info() / api.relaunch()", desc: "Loader info, configured maxMapDimension, and F6-style relaunch." },
            { name: "api.patcher.status()", desc: "Queued Anvil patches." },
            { name: "api.shell.openUrl(url)", desc: "Open http/https in the system browser." },
          ],
        },
        {
          title: "Assets",
          items: [
            { name: "api.assets.url(rel, modId?)", desc: "sandforge://… for <img>, fetch, CSS." },
            { name: "sandforge://<modId>/path", desc: "Also sandforge://data/… and sandforge://loader/…." },
          ],
        },
      ],
    },
    {
      id: "worker",
      label: "Worker",
      blurb: "entry.worker.js — appended to manager + simulation workers. self.sandforge / self.SandforgeWorker.",
      groups: [
        {
          title: "Surface",
          items: [
            { name: "api.version / api.environment", desc: "Current loader version / \"worker\"." },
            { name: "api.sandkit / api.api", desc: "Worker Sandkit when present." },
            { name: "api.on / off / once", desc: "Listen for SandForge worker channels. listenGameMessage is an alias of on." },
            { name: "api.emit / sendGameMessage", desc: "Post a channel and payload back to the game renderer." },
            { name: "api.rpc(ns, method, args)", desc: "Loader RPC. api.dispatch is an alias. api.api is Sandkit, not RPC." },
            { name: "api.fs", desc: "Async exists, readText, readJson, write, writeJson, list, mkdir, remove, copy, and hash." },
            { name: "api.net.request(opts)", desc: "Async loader-backed HTTP request." },
            { name: "api.log / api.now / api.util", desc: "log(level, message), clamp, lerp." },
          ],
        },
      ],
    },
  ];
})(typeof window !== "undefined" ? window : this);
