# SandForge

Copy this folder to `%AppData%\Roaming\sandustry\mods\sandforge-example` (or upload it to Workshop). Official Sandkit can load this item on its own.

- **Without the loader** — main menu shows **SandForge not active** and a GitHub link. Badge and docs still work.
- **With the loader** — **SandForge Active**, live statuses, API docs, and Ctrl-click the badge (or Arcade in the panel) to open a **select menu**: Vein Snake, Puddle Tank, Shaft Sweeper, Silt Sort, and Klondike. Scores are stored by the loader.

This folder is safe to upload. **Do not upload the loader** (`sandforge-loader` / `resources/app`). Do not include leftover nested copies of this folder.

Created and maintained by [InfinityTheHoly](https://github.com/InfinityTheHoly).

Install the loader from GitHub: https://github.com/InfinityTheHoly/sandforge-loader

## Ecosystem

Workshop mods should keep working in Sandkit. Detect the loader with `window.SandforgeLoader.has()` or `window.__SF_HOST__`, then degrade and link to GitHub.

With the loader, the game page cannot `fetch` `file://`. Use
`sandforge://<modId>/path` or `api.assets.url(rel)`. See
[Assets in the game page](../../docs/MODDING.md#assets-in-the-game-page-file-vs-sandforge).

**SandForge Toolkit** (`sandustry.sandforge-tk`) is a separate Workshop item. It does not require the loader. It hijacks the built-in Mods and Maps menus (code mods vs map packs) and prompts when the loader is required or would just make a feature better.
