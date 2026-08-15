"use strict";

function createRegistry() {
  const bags = Object.create(null);

  function bag(ns) {
    const key = String(ns || "default");
    if (!bags[key]) bags[key] = Object.create(null);
    return bags[key];
  }

  return {
    set(ns, key, value) {
      bag(ns)[String(key)] = value;
      return value;
    },
    get(ns, key, fallback) {
      const b = bag(ns);
      const k = String(key);
      return Object.prototype.hasOwnProperty.call(b, k) ? b[k] : fallback;
    },
    has(ns, key) {
      return Object.prototype.hasOwnProperty.call(bag(ns), String(key));
    },
    remove(ns, key) {
      delete bag(ns)[String(key)];
    },
    list(ns) {
      const b = bag(ns);
      return Object.keys(b).map((k) => ({ key: k, value: b[k] }));
    },
    keys(ns) {
      return Object.keys(bag(ns));
    },
    clear(ns) {
      bags[String(ns || "default")] = Object.create(null);
    },
    namespaces() {
      return Object.keys(bags);
    },
  };
}

module.exports = { createRegistry };
