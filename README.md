# SandForge Loader

Unofficial extra mod support for the Windows version of Sandustry. Steam still
launches the game as usual. After a one-time install, SandForge can load more
powerful mods, keep disabled mods on disk, and run maps larger than the
stock 3840 limit.

**Windows only.** Unofficial. Not affiliated with Sandustry, its developers,
or Steam.

Subscribing is not enough. You have to run the installer once.

## Install

1. Subscribe to this item and wait for Steam to finish downloading it.
2. Fully quit Sandustry. Check Task Manager for any leftover `Sandustry.exe`.
3. Open this item’s folder. Steam Workshop items live under
   `steamapps\workshop\content\2764460\`. Local copies live in
   `%AppData%\sandustry\mods\sandforge-loader`.
4. Run `install.cmd`. Windows may ask for Administrator permission.
5. Launch Sandustry from Steam.

The installer keeps a backup of the original game files. It does not edit
that backup.

If the SandForge Companion badge is installed, it should read **SandForge
Active** after a successful install.

## What you get

- Workshop and local mods keep working
- Mods can use extra tools (files, windows, workers, in-memory patches)
- Disabled mods stay installed instead of being deleted
- Maps can go beyond 3840 on a side
- **F6** restarts the game after you change a mod
- **F12** opens developer tools

Only install mods you trust. Some mods can run with full access to your PC.

## Update

Quit the game, let Steam update this item (or replace the folder), then run
`install.cmd` again.

A Sandustry update can turn SandForge off. If the game looks stock again,
quit and rerun `install.cmd`.

## Uninstall

Quit the game and run `uninstall.cmd` in this folder. That removes the
SandForge link and puts the original game files back.

## Troubleshooting

**The installer says the game is still running.**  
Close Sandustry, then check Task Manager for `Sandustry.exe`.

**The installer cannot find the game.**  
Launch Sandustry once from Steam, quit, and run `install.cmd` again.

**SandForge stopped working after a game update.**  
Steam may have restored the original game files. Quit and run `install.cmd`
again.

**A mod does not show up.**  
Put the mod in `%AppData%\sandustry\mods\` as its own folder with a
`modinfo.json`. Local copies override Workshop items with the same id.

## Other SandForge items

- **SandForge Companion** — main-menu badge, status, and arcade
- **SandForge Toolkit** — Mods list, Maps list, and the map editor

Those items work through official Sandkit. This loader is what turns the
deeper SandForge features on.

Mod authors: see [docs/MODDING.md](docs/MODDING.md) and
[docs/API.md](docs/API.md).

## License

MIT. See [LICENSE](LICENSE).
