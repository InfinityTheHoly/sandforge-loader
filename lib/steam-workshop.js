"use strict";

const fs = require("fs");
const path = require("path");

const APP_ID = 2764460;

function toId(value) {
  if (typeof value === "bigint") return value;
  return BigInt(String(value));
}

function toPlain(value) {
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((k) => {
      out[k] = toPlain(value[k]);
    });
    return out;
  }
  return value;
}

function findSteamworks(paths) {
  const guesses = [];
  if (paths && paths.gameAsar) guesses.push(paths.gameAsar + ".unpacked");
  if (paths && paths.gameRoot) {
    guesses.push(path.join(paths.gameRoot, "resources", "vanilla", "app.asar.unpacked"));
    guesses.push(path.join(paths.gameRoot, "resources", "app.asar.unpacked"));
  }
  for (let i = 0; i < guesses.length; i++) {
    const file = path.join(guesses[i], "node_modules", "steamworks.js", "index.js");
    if (fs.existsSync(file)) return file;
  }
  return "";
}

function createSteamWorkshop(paths) {
  let client = null;
  let hooked = false;

  function hook() {
    if (hooked) return;
    const file = findSteamworks(paths);
    if (!file) return;
    hooked = true;
    try {
      const sw = require(file);
      const orig = sw.init;
      if (typeof orig !== "function") return;
      sw.init = function (appId) {
        if (client) return client;
        client = orig.call(this, appId);
        return client;
      };
    } catch (e) {
      console.warn("[sandforge-loader] steamworks hook failed", e);
    }
  }

  function ensure() {
    hook();
    if (client) return client;
    const file = findSteamworks(paths);
    if (!file) throw new Error("steamworks.js not found");
    const sw = require(file);
    try {
      client = sw.init(APP_ID);
    } catch (e) {
      if (client) return client;
      throw new Error("Steam client unavailable: " + (e && e.message ? e.message : e));
    }
    return client;
  }

  function workshop() {
    const c = ensure();
    if (!c || !c.workshop) throw new Error("Steam workshop API unavailable");
    return c.workshop;
  }

  return {
    hook,
    info() {
      return {
        appId: String((paths && paths.steamAppId) || APP_ID),
        workshopRoots: (paths && paths.workshopRoots) || [],
        gameRoot: (paths && paths.gameRoot) || "",
        ready: !!client,
      };
    },
    async subscribe(itemId) {
      await workshop().subscribe(toId(itemId));
      return { ok: true, id: String(itemId) };
    },
    async unsubscribe(itemId) {
      await workshop().unsubscribe(toId(itemId));
      return { ok: true, id: String(itemId) };
    },
    download(itemId, highPriority) {
      const ok = workshop().download(toId(itemId), !!highPriority);
      return { ok: !!ok, id: String(itemId) };
    },
    state(itemId) {
      return { id: String(itemId), state: workshop().state(toId(itemId)) };
    },
    installInfo(itemId) {
      return toPlain(workshop().installInfo(toId(itemId)));
    },
    downloadInfo(itemId) {
      return toPlain(workshop().downloadInfo(toId(itemId)));
    },
    subscribed() {
      return (workshop().getSubscribedItems() || []).map((id) => String(id));
    },
    async getItem(itemId) {
      return toPlain(await workshop().getItem(toId(itemId)));
    },
    async getItems(ids) {
      const list = (ids || []).map(toId);
      return toPlain(await workshop().getItems(list));
    },
    async query(opts) {
      const o = opts || {};
      const page = Number(o.page) || 1;
      const queryType = o.queryType == null ? 1 : Number(o.queryType);
      const itemType = o.itemType == null ? 0 : Number(o.itemType);
      const appId = Number(o.appId) || APP_ID;
      return toPlain(
        await workshop().getAllItems(page, queryType, itemType, appId, appId, {
          searchText: o.search || o.searchText || undefined,
          requiredTags: o.tags || o.requiredTags,
          includeMetadata: true,
        }),
      );
    },
  };
}

module.exports = { createSteamWorkshop, findSteamworks, APP_ID };
