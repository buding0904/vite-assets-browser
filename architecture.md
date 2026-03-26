# Architecture

## Overview

`vite-assets-browser` is a Vite dev plugin that spins up a standalone HTTP server alongside the Vite dev server. The server scans the project for static assets and serves a self-contained browser UI. Real-time updates are pushed to the browser via SSE when files change on disk.

```
┌─────────────────────────────────────────────────────┐
│  Vite Dev Server                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │  vite-assets-browser plugin                 │   │
│  │  configResolved → capture root              │   │
│  │  buildStart     → startAssetServer()        │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │ spawns
         ▼
┌─────────────────────────────────────────────────────┐
│  Asset Browser HTTP Server  (default :3044)         │
│                                                     │
│  GET /              → HTML UI (inlined at build)    │
│  GET /api/assets    → JSON asset list               │
│  GET /api/events    → SSE stream (live updates)     │
│  GET /file?path=    → proxied file (MIME-typed)     │
└─────────────────────────────────────────────────────┘
         │ reads / watches
         ▼
┌─────────────────────────────────────────────────────┐
│  Scanner                                            │
│  fast-glob initial scan → Map<path, Asset>          │
│  fs.watch (recursive)  → incremental updates        │
│  EventEmitter          → change events to SSE       │
└─────────────────────────────────────────────────────┘
```

---

## File Structure

```
vite-assets-browser/
├── src/
│   ├── index.ts          # Vite plugin entry point
│   ├── server.ts         # HTTP server
│   ├── scanner.ts        # File system scanner + watcher
│   └── ui/
│       └── index.html    # Self-contained browser UI
├── tsup.config.ts        # Build config (tsup + esbuild)
├── tsconfig.json
├── package.json
└── .npmignore
```

### Build output (`dist/`)

```
dist/
├── index.js      # ESM — Vite plugin
├── index.cjs     # CJS — Vite plugin
├── index.d.ts    # Type declarations
├── cli.js        # ESM — CLI entry (bin)
└── cli.cjs       # CJS — CLI entry
```

---

## Modules

### `src/index.ts` — Plugin entry

Exports the default Vite plugin factory and the `ViteAssetsBrowserOptions` interface.

- `apply: 'serve'` — plugin is a no-op during `vite build`
- `configResolved` hook — captures `config.root` (the project root directory)
- `buildStart` hook — calls `startAssetServer()` once; guarded by a `started` flag to prevent double-start on HMR

**Options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | `number` | `3044` | HTTP server port |
| `open` | `boolean` | `false` | Auto-open browser on start |
| `ignore` | `string[]` | `[]` | Extra glob patterns to exclude from scanning |
| `extensions` | `RegExp` | see scanner | Regex to match asset file extensions |

---

### `src/server.ts` — HTTP server

A minimal Node.js `http.createServer` server with no external dependencies.

**Routes:**

- `GET /` — serves the inlined HTML template with `__PORT__` replaced at runtime
- `GET /api/assets` — calls `scanAssets()` and returns `Asset[]` as JSON
- `GET /api/events` — SSE endpoint; each browser tab opens one persistent connection. On file change, the scanner emits a `ChangeEvent` which is serialized and written as `data: {...}\n\n`
- `GET /file?path=<encoded>` — reads a file from disk and streams it with the correct MIME type. Protected against path traversal: the resolved path must start with `root + path.sep`

**Port retry:** if the chosen port is in use (`EADDRINUSE`), the server retries up to 10 times on consecutive ports.

**SSE connection lifecycle:**
1. Browser connects → response headers set to `text/event-stream`, `Cache-Control: no-cache`
2. A listener is registered on the scanner's `EventEmitter`
3. On `req.close`, the listener is removed — no memory leak regardless of how many tabs are open

---

### `src/scanner.ts` — Asset scanner

Responsible for the initial scan and all incremental updates.

**Data structure:** assets are stored as `Map<absolutePath, Asset>` for O(1) add/remove/update without array iteration.

**Initial scan:** `fast-glob` with `stats: true` (avoids a separate `fs.stat` call per file). Results are filtered by the `extensions` regex.

**Ignore logic:**
- `ALWAYS_IGNORE` — `node_modules`, `.git` (never overridable)
- `DEFAULT_IGNORE` — `dist`, `build`, `.cache`
- `options.ignore` — user-supplied extra patterns

**Incremental watching (`fs.watch`):**

`fs.watch` fires two event types:
- `rename` — used for both add and remove. Disambiguated by `fs.existsSync`: if the file exists it's an add, otherwise a remove.
- `change` — file content modified. Re-stats the file to get the new size, emits an `update` event.

**Debounce:** each file path gets its own 50ms debounce timer. This suppresses the 2–3 duplicate events that editors (VS Code, vim) emit per save without introducing a global delay that would affect unrelated files.

**EventEmitter:** one emitter per root directory, `maxListeners` set to 100 to support many open browser tabs without Node warnings.

**Exported API:**
```ts
scanAssets(root, options): Asset[]       // initial scan + start watching
getChangeEmitter(root): EventEmitter     // subscribe to ChangeEvent
```

**`ChangeEvent` union type:**
```ts
type ChangeEvent =
  | { type: 'add';    asset: Asset }
  | { type: 'remove'; absolutePath: string }
  | { type: 'update'; asset: Asset }
```

---

### `src/ui/index.html` — Browser UI

A fully self-contained HTML file (no external scripts, no CDN). Inlined into the JS bundle at build time via tsup's `loader: { '.html': 'text' }` — the entire HTML is a string constant in the compiled output.

**Layout:**
```
┌──────────────────────────────────────────┐
│ header: title · live dot · search input  │
├──────────────────────────────────────────┤
│ filter bar: All · Images · Videos · Fonts│
├──────────────────────────────────────────┤
│                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐   │
│  │checker│ │      │ │      │ │      │   │
│  │board │ │      │ │      │ │      │   │
│  │preview│ │      │ │      │ │      │   │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤   │
│  │ name │ │      │ │      │ │      │   │
│  │ size │ │      │ │      │ │      │   │
│  ├──────┤ ├──────┤ ├──────┤ ├──────┤   │
│  │actions│ │      │ │      │ │      │   │
│  └──────┘ └──────┘ └──────┘ └──────┘   │
│                                          │
│  [sentinel div — IntersectionObserver]   │
└──────────────────────────────────────────┘
```

**State:**
```js
allAssets[]       // full list from /api/assets
filteredAssets[]  // after type filter + search
renderedCount     // how many cards are in the DOM
activeType        // 'all' | 'image' | 'video' | 'font'
searchTerm        // current search string
```

**Infinite scroll:** `IntersectionObserver` on a sentinel `<div>` at the bottom of the page. When it enters the viewport (with 300px root margin), the next batch of 40 cards is appended. This keeps the initial render fast regardless of asset count.

**Lazy preview loading:** a second `IntersectionObserver` (200px root margin) watches each `.card-preview` element. The `<img>` or `<video>` element is only created and its `src` set when the card scrolls near the viewport.

**Checkerboard background (dark variant):**
```css
background-image:
  linear-gradient(45deg,  #333 25%, transparent 25%),
  linear-gradient(-45deg, #333 25%, transparent 25%),
  linear-gradient(45deg,  transparent 75%, #333 75%),
  linear-gradient(-45deg, transparent 75%, #333 75%);
background-size: 16px 16px;
background-position: 0 0, 0 8px, 8px -8px, -8px 0;
background-color: #222;
```

**Card actions:**
- Copy relative path — `navigator.clipboard.writeText(asset.relativePath)`
- Copy filename — `navigator.clipboard.writeText(asset.filename)`
- Copy import — `import assetUrl from '@/...'` (strips leading `src/`, replaces with `@/`)
- Open in new tab — `window.open('/file?path=...')`

**Live update (SSE) handling:**

| Event | DOM action |
|-------|-----------|
| `add` | `grid.prepend(createCard(asset))` with fade-in animation; updates `filteredAssets` and count |
| `remove` | `card.remove()` via `querySelector('[data-path="..."]')` |
| `update` | Appends `?t=<timestamp>` to `img.src` / `video.src` to bust browser cache; flashes card border |

The live dot in the header reflects connection state: grey = disconnected, green = connected, blue pulse = change received. On SSE error, reconnects after 3s.

---

## Build System

**tsup** (wraps esbuild) with two entry points:

```ts
// tsup.config.ts
{
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['vite'],
  loader: { '.html': 'text' },   // ← inlines index.html as a string
  esbuildOptions: { platform: 'node' }
}
```

The `loader: { '.html': 'text' }` setting is the key mechanism: esbuild treats the HTML import as a raw string literal, so the entire UI is embedded in `dist/index.js` with no runtime file I/O.

---

## CLI (`src/cli.ts`)

Standalone entry point registered as `bin.vite-assets-browser` in `package.json`. Parses `process.argv` manually (no commander/yargs dependency) and calls `startAssetServer()` directly.

```
vite-assets-browser [dir] [options]

  -p, --port <n>      port (default 3044)
  --open              auto-open browser
  --ignore <pattern>  extra ignore glob (repeatable)
  --ext <regex>       extension regex
  -h, --help
```

---

## Security

The `/file` endpoint validates that the resolved file path starts with `path.resolve(root) + path.sep` before reading from disk, preventing path traversal attacks (`../../etc/passwd` style).
