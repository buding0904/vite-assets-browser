import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { ViteAssetsBrowserOptions } from './index.js'

export type AssetType = 'image' | 'video' | 'font'

export interface Asset {
  absolutePath: string
  relativePath: string
  filename: string
  ext: string
  type: AssetType
  size: number
}

export type ChangeEvent =
  | { type: 'add'; asset: Asset }
  | { type: 'remove'; absolutePath: string }
  | { type: 'update'; asset: Asset }

const EXT_TYPE_MAP: Record<string, AssetType> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', svg: 'image', ico: 'image',
  mp4: 'video', webm: 'video', ogg: 'video', mov: 'video',
  woff: 'font', woff2: 'font', ttf: 'font', otf: 'font', eot: 'font',
}

export const DEFAULT_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|ico|mp4|webm|ogg|mov|woff2?|ttf|otf|eot)$/i

const ALWAYS_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
]

const DEFAULT_IGNORE = [
  '**/dist/**',
  '**/build/**',
  '**/.cache/**',
]

interface CacheEntry {
  assets: Map<string, Asset>  // keyed by absolutePath for O(1) lookup
  watcher: fs.FSWatcher | null
  options: ViteAssetsBrowserOptions | undefined
  emitter: EventEmitter
}

const cache = new Map<string, CacheEntry>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function buildIgnorePatterns(options?: ViteAssetsBrowserOptions): string[] {
  return [...ALWAYS_IGNORE, ...DEFAULT_IGNORE, ...(options?.ignore ?? [])]
}

function isIgnored(filePath: string, ignorePatterns: string[]): boolean {
  // Quick check: if any segment matches a known always-ignore dir
  const normalized = filePath.replace(/\\/g, '/')
  return ignorePatterns.some(pattern => {
    const dir = pattern.replace(/^\*\*\//, '').replace(/\/\*\*$/, '')
    return normalized.includes(`/${dir}/`) || normalized.includes(`/${dir}`)
  })
}

function makeAsset(filePath: string, root: string, size: number): Asset {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return {
    absolutePath: filePath,
    relativePath: path.relative(root, filePath),
    filename: path.basename(filePath),
    ext,
    type: EXT_TYPE_MAP[ext] ?? 'image',
    size,
  }
}

function doScan(root: string, options?: ViteAssetsBrowserOptions): Map<string, Asset> {
  const extRegex = options?.extensions ?? DEFAULT_EXTENSIONS
  const ignore = buildIgnorePatterns(options)

  const entries = fg.sync('**/*', {
    cwd: root,
    ignore,
    absolute: true,
    stats: true,
    caseSensitiveMatch: false,
    onlyFiles: true,
  })

  const map = new Map<string, Asset>()
  for (const entry of entries) {
    if (extRegex.test(entry.path)) {
      map.set(entry.path, makeAsset(entry.path, root, entry.stats?.size ?? 0))
    }
  }
  return map
}

function handleFsEvent(
  root: string,
  entry: CacheEntry,
  eventType: string,
  changedPath: string,
) {
  const extRegex = entry.options?.extensions ?? DEFAULT_EXTENSIONS
  const ignorePatterns = buildIgnorePatterns(entry.options)

  if (!extRegex.test(changedPath)) return
  if (isIgnored(changedPath, ignorePatterns)) return

  if (eventType === 'rename') {
    const exists = fs.existsSync(changedPath)
    if (exists) {
      // File added
      try {
        const stat = fs.statSync(changedPath)
        const asset = makeAsset(changedPath, root, stat.size)
        entry.assets.set(changedPath, asset)
        entry.emitter.emit('change', { type: 'add', asset } satisfies ChangeEvent)
      } catch {
        // stat failed — file disappeared between exists check and stat
      }
    } else {
      // File removed
      if (entry.assets.has(changedPath)) {
        entry.assets.delete(changedPath)
        entry.emitter.emit('change', { type: 'remove', absolutePath: changedPath } satisfies ChangeEvent)
      }
    }
  } else if (eventType === 'change') {
    // File content updated — refresh size, bust browser cache via cache-key
    try {
      const stat = fs.statSync(changedPath)
      const asset = makeAsset(changedPath, root, stat.size)
      entry.assets.set(changedPath, asset)
      entry.emitter.emit('change', { type: 'update', asset } satisfies ChangeEvent)
    } catch {
      // file removed mid-event
    }
  }
}

function watchRoot(root: string, entry: CacheEntry): fs.FSWatcher | null {
  try {
    return fs.watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return

      const changedPath = path.resolve(root, filename)

      // Debounce per-file to avoid duplicate events (editors often fire 2-3 events per save)
      const key = changedPath
      const existing = debounceTimers.get(key)
      if (existing) clearTimeout(existing)
      debounceTimers.set(key, setTimeout(() => {
        debounceTimers.delete(key)
        handleFsEvent(root, entry, eventType, changedPath)
      }, 50))
    })
  } catch {
    return null
  }
}

export function scanAssets(root: string, options?: ViteAssetsBrowserOptions): Asset[] {
  if (!cache.has(root)) {
    const assetsMap = doScan(root, options)
    const emitter = new EventEmitter()
    emitter.setMaxListeners(100) // allow many SSE connections
    const entry: CacheEntry = { assets: assetsMap, watcher: null, options, emitter }
    entry.watcher = watchRoot(root, entry)
    cache.set(root, entry)
  }
  return Array.from(cache.get(root)!.assets.values())
}

export function getChangeEmitter(root: string): EventEmitter | null {
  return cache.get(root)?.emitter ?? null
}
