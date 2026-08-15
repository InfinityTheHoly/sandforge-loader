# SandForge Loader

In-process mod loader for Sandustry. Unofficial — not affiliated with the game or Steam.

Steam still launches `Sandustry.exe`. Install moves the stock `app.asar` to `resources/vanilla/app.asar` (not modified) and points `resources/app` at this folder. Electron 33 loads `app.asar` first when both exist, so leaving the asar in place meant the loader never ran.

**Windows only. Do not upload this folder to Steam Workshop.** Install it locally. Workshop *mods* load automatically once the loader is installed.

## Install

Clone this repo anywhere, then:

1. Fully quit Sandustry (all `Sandustry.exe` processes). The scripts refuse to run while the game is open — a junction created then is ignored until the next launch.
2. Run `install.cmd` (may ask for Administrator). It finds the Steam install, moves `resources\app.asar` to `resources\vanilla\app.asar`, and points `resources\app` at this folder. If `app.asar` is still next to `app`, Electron ignores the loader.
3. Launch **from Steam**.

Uninstall: `uninstall.cmd` (also refuses if the game is running). That restores `app.asar` from `resources/vanilla`. Steam verify / a game update may put `app.asar` back; run install again.

**F6** relaunches the loader after you change a mod.

## Where mods come from

| Source | Path |
| --- | --- |
| Workshop | `steamapps/workshop/content/2764460/<itemId>/` |
| Local | `%AppData%\Roaming\sandustry\mods\<folder>/` |

Local wins if the same `id` / `modID` exists in both.

A mod is any folder with `modinfo.json`. Official Sandkit still runs (`entry` / `main.js`, `patches.json` under `js/`, maps, assets). The loader adds:

- `electronEntrypoint` — Node, Electron main, before the asar compiles
- `gameEntrypoint` — renderer, after the window loads
- `workerEntrypoint` — same file appended to both game workers
- `workerEntrypoints` — `{ manager, simulation, both }` to target one worker
- `anvil.json` / `sandforge-patches.json` — in-memory patches for asar text files

See [docs/MODDING.md](docs/MODDING.md) and the full **[docs/API.md](docs/API.md)**. Example: `examples/sandforge-example` (copy into local mods, or upload *that* folder — not this loader).

## Config

`%AppData%\Roaming\sandustry\loader-config.json`

```json
{
  "maxMapDimension": 15360,
  "disabled": []
}
```

`disabled` is a list of mod ids. `api.mods.disable` unloads that mod and reloads game windows immediately. Worker files still need F6.

Optional: set `SANDFORGE_MODS_PATH` to use a different local mods folder.

## Logs

- Loader / plugin `console.log` — Electron main (Steam’s game log / console)
- `api.logFile.write` — `%AppData%\Roaming\sandustry\meta\sandforge-loader.log`

## What this is not

- Not a second game exe
- Not a Workshop item
- Not affiliated with Sandustry
