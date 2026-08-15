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
  electronEntrypoint?: boolean;
  gameEntrypoint?: boolean;
  workerEntrypoint?: boolean;
  info?: Record<string, unknown>;
}

export interface SandforgeWindowCreateOpts {
  file: string;
  width?: number;
  height?: number;
  title?: string;
  alwaysOnTop?: boolean;
  display?: number;
  parent?: boolean | number;
  backgroundColor?: string;
  maximizable?: boolean;
  fullscreenable?: boolean;
  resizable?: boolean;
  injectGame?: boolean;
  modId?: string;
}

export interface SandforgeRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
  list(rel?: string): string[];
  hash(rel: string, algo?: string): string;
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

export interface SandforgePatcher {
  add(patch: SandforgePatch): string;
  replace(file: string, find: string, code: string, opts?: object): string;
  unpatch(id: string): void;
  unseal(): void;
  isSealed(): boolean;
  status(): object;
  applyPreload(): string;
  file?(path: string): {
    find(text: string): unknown;
    replace(text: string): unknown;
    expect(n: number): unknown;
    apply(): string;
  };
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
    list(rel?: string): string[];
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
  mods: SandforgeMods;
  listMods(): SandforgeModInfo[];
  getDisabled(): string[];
  disable(ids: string[]): unknown;
  /** @deprecated use disable */
  setDisabled(ids: string[]): unknown;
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
  events: {
    on(channel: string, fn: (data?: unknown) => void): unknown;
    off?(channel: string, fn: (data?: unknown) => void): unknown;
    emit?(channel: string, data?: unknown): unknown;
  };
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
  commands: {
    register(name: string, fn: (args: string[]) => unknown, help?: string): void;
    run(name: string, args?: string[]): unknown;
    list(): Array<{ name: string; help: string }>;
  };
  store: SandforgeAsync<SandforgeStore>;
  settings: SandforgeAsync<SandforgeSettings> & {
    panel(id?: string): Promise<HTMLElement>;
  };
  fs: SandforgeAsync<SandforgeFs>;
  mods: SandforgeAsync<Pick<SandforgeMods, "list" | "disable" | "getDisabled" | "unload" | "reload" | "assetUrl" | "fileUrl" | "read">> & {
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
    ws(url: string, opts?: object): Promise<SandforgeWs>;
    [key: string]: unknown;
  };
  steam: SandforgeAsync<SandforgeElectronApi["steam"]>;
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
  emit(channel: string, payload?: unknown): void;
  sendGameMessage(channel: string, payload?: unknown): void;
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
    SandforgeLoader: SandforgeLoaderDetect;
    __SF_HOST__?: { loader: true; version: string };
  }
  // eslint-disable-next-line no-var
  var sandforge: SandforgeApi | undefined;
}

export {};
