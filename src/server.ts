import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { scanAssets, getChangeEmitter } from './scanner.js'
import type { ViteAssetsBrowserOptions } from './index.js'

// @ts-ignore — tsup loader: { '.html': 'text' } inlines this as a string
import htmlTemplate from './ui/index.html'

const MIME_MAP: Record<string, string> = {
  // images
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  // videos
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime',
  // fonts
  woff: 'font/woff', woff2: 'font/woff2',
  ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
}

function serveFile(filePath: string | null, root: string, res: http.ServerResponse) {
  if (!filePath) {
    res.writeHead(400)
    res.end('Missing path')
    return
  }

  const resolved = path.resolve(filePath)
  const resolvedRoot = path.resolve(root)

  // Path traversal protection
  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  if (!fs.existsSync(resolved)) {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  const ext = path.extname(resolved).slice(1).toLowerCase()
  const mime = MIME_MAP[ext] ?? 'application/octet-stream'

  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  })
  fs.createReadStream(resolved).pipe(res)
}

export function startAssetServer(root: string, options?: ViteAssetsBrowserOptions): void {
  const basePort = options?.port ?? 3044
  const open = options?.open ?? false

  // SSE connection pool: set of active response objects
  const sseClients = new Set<http.ServerResponse>()

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost`)

    res.setHeader('Access-Control-Allow-Origin', '*')

    if (url.pathname === '/') {
      const html = (htmlTemplate as string).replace('__PORT__', String(basePort))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    if (url.pathname === '/api/assets') {
      const assets = scanAssets(root, options)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(assets))
      return
    }

    // SSE endpoint — browser connects once and receives incremental change events
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering if behind a proxy
      })
      // Send a comment to establish the connection and flush
      res.write(': connected\n\n')

      sseClients.add(res)

      // Ensure scanner is initialized so the emitter exists
      scanAssets(root, options)
      const emitter = getChangeEmitter(root)
      if (emitter) {
        const handler = (event: unknown) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        }
        emitter.on('change', handler)
        req.on('close', () => {
          emitter.off('change', handler)
          sseClients.delete(res)
        })
      } else {
        req.on('close', () => sseClients.delete(res))
      }
      return
    }

    if (url.pathname === '/file') {
      serveFile(url.searchParams.get('path'), root, res)
      return
    }

    res.writeHead(404)
    res.end()
  })

  function tryListen(port: number, attempt: number) {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`
      console.log(`  \x1b[32m➜\x1b[0m  \x1b[1mAssets Browser\x1b[0m: \x1b[36m${url}\x1b[0m`)
      if (open) {
        import('node:child_process').then(({ exec }) => exec(`open "${url}"`))
      }
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < 10) {
        server.removeAllListeners('error')
        tryListen(port + 1, attempt + 1)
      } else {
        console.error(`  \x1b[31m✗\x1b[0m  vite-assets-browser: failed to start on port ${port} — ${err.message}`)
      }
    })
  }

  tryListen(basePort, 0)
}
