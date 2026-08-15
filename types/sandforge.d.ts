/** SandForge loader API. Electron: `module.exports = function (api)`. Game: `window.sandforge`. Worker: `self.sandforge`. */

export type SandforgeEnvironment = "electron" | "game" | "worker";

export interface SandforgeModInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  dir: string;
  source: "local" | "workshop";
  workshopId?: string | null;
  enabled?: boolean;
  depends?: string[];
  electronEntrypoint?: string | boolean;
  gameEntrypoint?: string | boolean;
  workerEntrypoint?: string | boolean;
  workerEntrypoints?: {
    both?: string;
    manager?: string;
    simulation?: string;
  };
  info?: Record<string, unknown>;
}

export interface SandforgeWindowCreateOpts {
  file?: string;
  path?: string;
  html?: string;
  width?: number;
  height?: number;
  title?: string;
  alwaysOnTop?: boolean;
  display?: number;
  parent?: boolean | number;
  backgroundColor?: string;
  maximizable?: boolean;
  minimizable?: boolean;
  fullscreenable?: boolean;
  resizable?: boolean;
  autoHideMenuBar?: boolean;
  injectGame?: boolean;
  modId?: string;
}

export interface SandforgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SandforgeDirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface SandforgeWs {
  id?: string;
  on(event: "open" | "message" | "close" | "error", fn: (...args: unknown[]) => void): SandforgeWs;
  off?(event: string, fn: (...args: unknown[]) => void): SandforgeWs;
  send(data: string | Uint8Array): void | Promise<unknown>;
  close(code?: number, reason?: string): void | Promise<unknown>;
}

export interface SandforgePatch {
  id?: string;
  file: string;
  find?: string;
  replace?: string;
  expect?: number | "any";
  phase?: "early" | "late";
  priority?: number;
  /** @deprecated use find */
  from?: string;
  /** @deprecated use replace */
  to?: string;
  /** @deprecated use replace */
  code?: string;
  /** @deprecated use expect */
  expectedMatches?: number | "any";
  operation?: string;
  type?: string;
  regex?: { pattern: string; flags?: string };
}

export interface SandforgeStore {
  get(key?: string, fallback?: unknown): unknown;
  set(key: string | object, value?: unknown): unknown;
  remove(key: string): void;
  clear(): void;
}

export interface SandforgeSettings {
  schema(modId?: string): unknown;
  get(): unknown;
  set(obj: object): unknown;
  patch(partial: object): unknown;
}

export interface SandforgeFs {
  resolve(rel: string): string;
  exists(rel: string): boolean;
  stat(rel: string): object;
  readText(rel: string): string;
  readJson(rel: string, fallback?: unknown): unknown;
  readBinary(rel: string): Uint8Array;
  write(rel: string, data: string | Uint8Array): unknown;
  writeJson(rel: string, value: unknown): unknown;
  append(rel: string, text: string): unknown;
  mkdir(rel: string): unknown;
  remove(rel: string): unknown;
  copy(from: string, to: string): unknown;
  list(rel?: string): SandforgeDirEntry[];
  hash(rel: string, algo?: string): string;
}

export interface SandforgeEvents {
  on(channel: string, fn: (data?: unknown) => void): void;
  off(channel: string, fn: (data?: unknown) => void): void;
  once(channel: string, fn: (data?: unknown) => void): () => void;
  trigger(channel: string, data?: unknown): Promise<void>;
  emit(channel: string, data?: unknown): Promise<void>;
}

export interface SandforgeBus {
  on(channel: string, fn: (data?: unknown) => void): () => void;
  off(channel: string, fn: (data?: unknown) => void): void;
  once(channel: string, fn: (data?: unknown) => void): () => void;
  emit(channel: string, data?: unknown): number;
  channels(): string[];
}

export interface SandforgeRegistry {
  set(ns: string, key: string, value: unknown): unknown;
  get(ns: string, key: string, fallback?: unknown): unknown;
  has(ns: string, key: string): boolean;
  remove(ns: string, key: string): unknown;
  list(ns: string): Array<{ key: string; value: unknown }>;
  keys(ns: string): string[];
  clear(ns: string): unknown;
  namespaces(): string[];
}

export type SandforgeAsync<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K];
};

export interface SandforgeMods {
  list(): SandforgeModInfo[];
  get(id: string): SandforgeModInfo | null;
  enabled(): SandforgeModInfo[];
  disable(ids: string[]): unknown;
  getDisabled(): string[];
  unload(id?: string): unknown;
  reload(id?: string): unknown;
  assetUrl(modId: string, rel: string): string;
  fileUrl(modId: string, rel: string): string;
  read(modId: string, rel: string): string;
  missingDeps?(): Array<{ id: string; missing: string[] }>;
  /** @deprecated use disable */
  setDisabled?(ids: string[]): unknown;
}

export interface SandforgeFluentPatch {
  id(value: string): SandforgeFluentPatch;
  find(text: string): SandforgeFluentPatch;
  regex(pattern: string, flags?: string): SandforgeFluentPatch;
  prefix(code: string): SandforgeFluentPatch;
  postfix(code: string): SandforgeFluentPatch;
  bodyPrefix(code: string): SandforgeFluentPatch;
  replace(text: string): SandforgeFluentPatch;
  wrap(before: string, after: string): SandforgeFluentPatch;
  remove(): SandforgeFluentPatch;
  expect(n: number | "any"): SandforgeFluentPatch;
  occurrence(value: number | "all"): SandforgeFluentPatch;
  atomic(value: string): SandforgeFluentPatch;
  priority(value: number): SandforgeFluentPatch;
  phase(value: "early" | "late"): SandforgeFluentPatch;
  apply(): string;
}

export interface SandforgePatcher {
  add(patch: SandforgePatch): string;
  set(patch: SandforgePatch): string;
  replace(file: string, find: string, code: string, opts?: object): string;
  prefix(file: string, find: string, code: string, opts?: object): string;
  postfix(file: string, find: string, code: string, opts?: object): string;
  bodyPrefix(file: string, find: string, code: string, opts?: object): string;
  transpiler(file: string, find: string, code: string, opts?: object): string;
  wrap(file: string, find: string, parts: { before?: string; after?: string }, opts?: object): string;
  remove(file: string, find: string, opts?: object): string;
  transform(file: string, fn: (source: string) => string, opts?: object): string;
  addPatch(file: string, patch: object): string;
  setPatch(file: string, tag: string, patch: object): string;
  removePatch(file: string, tag: string): void;
  patchExists(file: string, tag: string): boolean;
  addMappedPatch(fileMap: object, mapFn: (...args: unknown[]) => object | object[]): string;
  setMappedPatch(fileMap: object, tag: string, mapFn: (...args: unknown[]) => object | object[]): string;
  unpatch(id: string): void;
  unseal(): void;
  isSealed(): boolean;
  read(file: string): string;
  preview(file: string, find?: string, context?: number): unknown;
  dump(file: string): string;
  list(): object[];
  status(): object;
  applyPreload(): string;
  file(path: string): SandforgeFluentPatch;
}

export interface SandforgeElectronApi {
  version: string;
  apiVersion: string;
  apiLevel: number;
  environment: "electron";
  modId: string;
  mod: SandforgeModInfo & {
    fileUrl(rel: string): string;
    read(rel: string): string;
    readJson(rel: string, fallback?: unknown): unknown;
    write(rel: string, data: string | Uint8Array): unknown;
    list(rel?: string): SandforgeDirEntry[];
  };
  log(level: string, message: string): void;
  log(level: string, tag: string, message: string): void;
  help(): string[];
  handle(channel: string, handler: (...args: unknown[]) => unknown): void;
  emit(channel: string, data?: unknown): void;
  on(channel: string, fn: (data?: unknown) => void): unknown;
  /** @deprecated use handle */
  handleGameIPC(channel: string, handler: (...args: unknown[]) => unknown): void;
  /** @deprecated use emit */
  sendGameEvent(channel: string, data?: unknown): void;
  app: {
    version: string;
    loaderVersion: string;
    platform: string;
    arch: string;
    electron: string;
    chrome: string;
    node: string;
    pid: number;
    maxMapDimension: number;
    isPackaged: boolean;
    getLocale(): string;
    whenReady(): Promise<unknown>;
    relaunch(): void;
    quit(): void;
  };
  paths: {
    loader: string;
    game: string;
    asar: string;
    ui: string;
    mods: string;
    data: string;
    workshop: string[];
    saves: string;
    maps: string;
    meta: string;
    store: string;
    steamAppId: string;
    get(): object;
  };
  fs: SandforgeFs;
  store: SandforgeStore;
  settings: SandforgeSettings;
  modConfig: {
    get(modId?: string): unknown;
    set(modId: string | object, value?: object): unknown;
  };
  mods: SandforgeMods;
  listMods(): SandforgeModInfo[];
  getDisabled(): string[];
  disable(ids: string[]): unknown;
  /** @deprecated use disable */
  setDisabled(ids: string[]): unknown;
  getModsPath(): string;
  getGameBasePath(): string;
  getGameAsarPath(): string;
  getGameRoot(): string;
  getTempBasePath(): string;
  getTempExtractedPath(): string;
  getUserDataPath(): string;
  getAppPath(): string;
  getInstalledMods(): object[];
  getLoadedMods(): object[];
  getEnabledMods(): object[];
  patcher: SandforgePatcher;
  windows: {
    create(opts: SandforgeWindowCreateOpts): { ok: boolean; id: number };
    list(): object[];
    get(id?: number): object | null;
    current(): object | null;
    close(id?: number): { ok: boolean };
    show(id?: number): { ok: boolean };
    hide(id?: number): { ok: boolean };
    focus(id?: number): { ok: boolean };
    reload(id?: number): { ok: boolean };
    openDevTools(id?: number): { ok: boolean };
    capturePage(id?: number): Promise<Buffer>;
    captureRegion(rect: SandforgeRect, id?: number): Promise<Buffer>;
    captureToClipboard(id?: number): Promise<{ ok: boolean; bytes: number }>;
    printToPDF(opts?: object, id?: number): Promise<Buffer>;
    [key: string]: unknown;
  };
  net: {
    fetch(url: string, limit?: number): Promise<{ status: number; headers: object; body: string }>;
    get(url: string, limit?: number): Promise<{ status: number; headers: object; body: string }>;
    post(url: string, body?: unknown, opts?: object): Promise<{ status: number; headers: object; body: string }>;
    getJson(url: string): Promise<unknown>;
    download(url: string, destRel: string): Promise<object>;
    request(url: string, opts?: object): Promise<unknown>;
    ws(url: string, opts?: object): SandforgeWs;
  };
  steam: {
    appId: string;
    workshopRoots: string[];
    gameRoot: string;
    info(): object;
    subscribe(id: string | number): Promise<object>;
    unsubscribe(id: string | number): Promise<object>;
    download(id: string | number, highPriority?: boolean): object;
    state(id: string | number): object;
    installInfo(id: string | number): object | null;
    downloadInfo(id: string | number): object | null;
    subscribed(): string[];
    getItem(id: string | number): Promise<object | null>;
    getItems(ids: Array<string | number>): Promise<object>;
    query(opts?: object): Promise<object>;
  };
  notify: {
    show(title: string, body?: string, opts?: { actions?: Array<{ type?: string; text: string }>; onClick?: () => void; onAction?: (index: number) => void; silent?: boolean }): boolean;
  };
  dialog: {
    open(opts?: object): Promise<unknown>;
    save(opts?: object): Promise<unknown>;
    message(opts?: object): Promise<unknown>;
    error(title: string, content: string): void;
  };
  clipboard: {
    readText(): string;
    writeText(text: string): void;
    readImage(): Buffer | null;
    writeImagePng(buf: Uint8Array): unknown;
    writePage(id?: number): Promise<unknown>;
  };
  shell: {
    openPath(target: string): unknown;
    openUrl(url: string): unknown;
    showItemInFolder(target: string): unknown;
  };
  crypto: {
    randomId(): string;
    hash(text: string, algo?: string): string;
    hashFile(rel: string, algo?: string): string;
  };
  time: {
    now(): number;
    iso(): string;
    sleep(ms: number): Promise<void>;
  };
  tray: {
    create(opts?: object): { ok: boolean };
  };
  saves: {
    list(): string[];
    maps(): string[];
  };
  logFile: {
    write(line: string): void;
  };
  bus: SandforgeBus;
  registry: SandforgeRegistry;
  events: SandforgeEvents;
  watch: {
    dir(rel: string, fn: (event: { event: string; filename: string; dir: string }) => void): () => void;
  };
  screen: {
    displays(): object[];
    primary(): object | null;
  };
  shortcuts: {
    register(accelerator: string, fn: () => void): boolean;
    unregister(accelerator: string): void;
    unregisterAll(): void;
    isRegistered(accelerator: string): boolean;
  };
  images: {
    fromFile(rel: string): Buffer;
    fromPng(buf: Uint8Array): unknown;
    resize(buf: Uint8Array, width: number, height: number): Buffer;
    size(buf: Uint8Array): { width: number; height: number };
  };
  timers: {
    timeout(ms: number, fn: () => void): unknown;
    interval(ms: number, fn: () => void): unknown;
    clear(id: unknown): void;
  };
  assets: {
    url(rel: string): string;
    fileUrl(rel: string): string;
    read(rel: string): string;
    readBinary(rel: string): Buffer;
  };
  util: Record<string, (...args: any[]) => any>;
  ipc: {
    handle(channel: string, handler: (...args: unknown[]) => unknown): void;
    emit(channel: string, data?: unknown): void;
    send(channel: string, data?: unknown): void;
    broadcast(channel: string, data?: unknown): void;
  };
}

export interface SandforgeGameApi {
  version: string;
  apiVersion: string;
  apiLevel: number;
  environment: "game";
  isLoader: true;
  isWrapper: true;
  modId: string;
  bind(modId: string): SandforgeGameApi;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  handle?: never;
  emit(channel: string, data?: unknown): Promise<unknown>;
  on(channel: string, fn: (data?: unknown) => void): () => void;
  rpc(ns: string, method: string, args?: unknown[]): Promise<unknown>;
  /** @deprecated use rpc */
  api(ns: string, method: string, args?: unknown[]): Promise<unknown>;
  send(channel: string, data?: unknown): Promise<unknown>;
  sandkit: unknown;
  react: unknown;
  enums: unknown;
  game: Record<string, unknown>;
  ui: {
    toast(msg: string, opts?: object): unknown;
    alert(msg: string, title?: string): Promise<unknown>;
    confirm(msg: string, title?: string): Promise<unknown>;
    prompt(msg: string, def?: string): Promise<unknown>;
    inject(id: string, component: unknown): unknown;
    css(id: string, css: string): () => void;
    overlay(id: string, html: string): { el: HTMLElement; remove(): void; html(next: string): void };
    panel(id: string, opts?: { html?: string; style?: string }): HTMLElement;
    remove(id: string): void;
  };
  scene: { get(): unknown; onChange(fn: (now: unknown, prev: unknown) => void): () => void; isMenu(): boolean };
  tick: {
    every(ms: number, fn: () => void): () => void;
    next(fn: () => void): unknown;
    onFrame(fn: () => void): () => void;
  };
  hooks: {
    intercept(id: string, fn: (...args: unknown[]) => unknown, opts?: object): unknown;
    modify(id: string, fn: (...args: unknown[]) => unknown, opts?: object): unknown;
  };
  world: {
    player(): unknown;
    camera(): unknown;
    cell(x: number, y: number): unknown;
    setCell(x: number, y: number, value: unknown): unknown;
    mouseCell(): unknown;
  };
  input: {
    bind(id: string, keys: string | string[], handlers: object): unknown;
    mouseCell(): unknown;
    onKey(code: string, fn: (event: KeyboardEvent) => void): () => void;
  };
  i18n: {
    add(key: string, value: string, locale?: string): unknown;
    t(key: string, fallback?: string): string;
  };
  audio: {
    play(src: string, opts?: { volume?: number; loop?: boolean }): HTMLAudioElement;
  };
  events: {
    on(channel: string, fn: (data?: unknown) => void): () => void;
    emit(channel: string, data?: unknown): unknown;
  };
  commands: {
    register(name: string, fn: (args: string[]) => unknown, help?: string): void;
    run(name: string, args?: string[]): unknown;
    list(): Array<{ name: string; help: string }>;
  };
  store: SandforgeAsync<SandforgeStore>;
  settings: SandforgeAsync<SandforgeSettings> & {
    panel(id?: string): Promise<HTMLElement>;
  };
  fs: SandforgeAsync<Omit<SandforgeFs, "resolve">>;
  mods: {
    list(): Promise<SandforgeModInfo[]>;
    disable(ids: string[]): Promise<unknown>;
    getDisabled(): Promise<string[]>;
    unload(id?: string): Promise<unknown>;
    reload(id?: string): Promise<unknown>;
    assetUrl(modId: string, rel: string): string;
    fileUrl(modId: string, rel: string): string;
    read(modId: string, rel: string): Promise<string>;
    setDisabled(ids: string[]): Promise<unknown>;
  };
  listMods(): Promise<SandforgeModInfo[]>;
  getDisabled(): Promise<string[]>;
  disable(ids: string[]): Promise<unknown>;
  setDisabled(ids: string[]): Promise<unknown>;
  windows: {
    create(opts: SandforgeWindowCreateOpts): Promise<{ ok: boolean; id: number }>;
    list(): Promise<object[]>;
    reload(id?: number): Promise<unknown>;
    openDevTools(id?: number): Promise<unknown>;
    [key: string]: unknown;
  };
  net: {
    get(url: string): Promise<unknown>;
    fetch(url: string): Promise<unknown>;
    post(url: string, body?: unknown, opts?: object): Promise<unknown>;
    getJson(url: string): Promise<unknown>;
    download(url: string, destRel: string): Promise<unknown>;
    request(url: string, opts?: object): Promise<unknown>;
    ws(url: string, opts?: object): Promise<SandforgeWs>;
    [key: string]: unknown;
  };
  dialog: SandforgeAsync<SandforgeElectronApi["dialog"]>;
  clipboard: SandforgeAsync<SandforgeElectronApi["clipboard"]>;
  shell: SandforgeAsync<SandforgeElectronApi["shell"]>;
  notify: SandforgeAsync<SandforgeElectronApi["notify"]>;
  screen: SandforgeAsync<SandforgeElectronApi["screen"]>;
  saves: SandforgeAsync<SandforgeElectronApi["saves"]>;
  crypto: SandforgeAsync<SandforgeElectronApi["crypto"]>;
  registry: {
    get(ns: string, key: string, fallback?: unknown): Promise<unknown>;
    set(ns: string, key: string, value: unknown): Promise<unknown>;
    list(ns: string): Promise<Array<{ key: string; value: unknown }>>;
  };
  bus: {
    on(channel: string, fn: (data?: unknown) => void): () => void;
    emit(channel: string, data?: unknown): Promise<unknown>;
  };
  logFile: {
    write(line: string): Promise<unknown>;
  };
  app: {
    info(): Promise<{
      version: string;
      platform: string;
      pid: number;
      electron: string;
      maxMapDimension: number;
    }>;
    relaunch(): Promise<unknown>;
    quit(): Promise<unknown>;
  };
  steam: SandforgeAsync<Omit<SandforgeElectronApi["steam"], "appId" | "workshopRoots" | "gameRoot">>;
  paths: {
    get(): Promise<object>;
  };
  assets: {
    url(rel: string, modId?: string): string;
    image(rel: string, modId?: string): HTMLImageElement;
    audio(rel: string, modId?: string): HTMLAudioElement;
  };
  workers: {
    on(fn: (channel: string, payload: unknown) => void): () => void;
    reload(): Promise<unknown>;
  };
  patcher: {
    status(): Promise<object>;
    unseal(): Promise<unknown>;
    isSealed(): Promise<boolean>;
    add(patch: SandforgePatch): Promise<string>;
    applyPreload(): Promise<string>;
  };
  relaunch(): Promise<unknown>;
}

export interface SandforgeWorkerApi {
  version: string;
  apiVersion: string;
  apiLevel: number;
  environment: "worker";
  isLoader: true;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  rpc(ns: string, method: string, args?: unknown[]): Promise<unknown>;
  /** @deprecated use rpc */
  dispatch(ns: string, method: string, args?: unknown[]): Promise<unknown>;
  /** Sandkit worker API, not loader RPC */
  api: unknown;
  fs: {
    exists(rel: string): Promise<boolean>;
    readText(rel: string): Promise<string>;
    readJson(rel: string, fallback?: unknown): Promise<unknown>;
    write(rel: string, data: string): Promise<unknown>;
    list(rel: string): Promise<unknown>;
  };
  on(channel: string, fn: (payload: unknown) => void): () => void;
  off(channel: string, fn: (payload: unknown) => void): void;
  once(channel: string, fn: (payload: unknown) => void): () => void;
  listenGameMessage(channel: string, fn: (payload: unknown) => void): () => void;
  emit(channel: string, payload?: unknown): Promise<unknown>;
  sendGameMessage(channel: string, payload?: unknown): Promise<unknown>;
  log(level: string, message: string): void;
  now(): number;
  util: {
    clamp(n: number, min: number, max: number): number;
    lerp(a: number, b: number, t: number): number;
  };
  sandkit: unknown;
}

export type SandforgeApi = SandforgeElectronApi | SandforgeGameApi | SandforgeWorkerApi;

export interface SandforgeLoaderDetect {
  has(): boolean;
  GITHUB_URL?: string;
  openGithub?(): void;
}

declare global {
  interface Window {
    sandforge: SandforgeGameApi;
    sandforgeAPI: SandforgeGameApi;
    SandforgeGame: SandforgeGameApi;
    sandforgeGame: SandforgeGameApi;
    SandforgeLoader: SandforgeLoaderDetect;
    __SF_HOST__?: { loader: true; version: string };
    __SANDFORGE_LOADER__?: { loader: true; version: string };
    __SF_DISABLED__?: string[];
  }
  interface WorkerGlobalScope {
    sandforge: SandforgeWorkerApi;
    sandforgeAPI: SandforgeWorkerApi;
    SandforgeWorker: SandforgeWorkerApi;
  }
  // eslint-disable-next-line no-var
  var sandforge: SandforgeApi | undefined;
}

export {};
