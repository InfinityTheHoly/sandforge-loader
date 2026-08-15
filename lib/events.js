"use strict";

class EventBus {
  constructor() {
    this.events = Object.create(null);
  }

  registerEvent(name) {
    const e = String(name || "");
    if (!e) throw new Error("Event name required");
    if (this.events[e]) throw new Error("Event already registered: " + e);
    this.events[e] = [];
  }

  on(name, fn) {
    const e = String(name || "");
    if (!this.events[e]) {
      this.events[e] = [];
    }
    if (typeof fn !== "function") throw new Error("Listener must be a function");
    this.events[e].push(fn);
  }

  off(name, fn) {
    const list = this.events[String(name || "")];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  once(name, fn) {
    const wrap = (data) => {
      this.off(name, wrap);
      return fn(data);
    };
    this.on(name, wrap);
    return () => this.off(name, wrap);
  }

  async trigger(name, data) {
    const list = this.events[String(name || "")] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      await list[i](data);
    }
  }

  emit(name, data) {
    return this.trigger(name, data);
  }
}

module.exports = { EventBus };
