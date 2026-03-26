#!/usr/bin/env node
import path from 'node:path'
import { startAssetServer } from './server.js'
import { DEFAULT_EXTENSIONS } from './scanner.js'
import type { ViteAssetsBrowserOptions } from './index.js'

const args = process.argv.slice(2)

function printHelp() {
  console.log(`
  Usage: vite-assets-browser [dir] [options]

  Arguments:
    dir                 Directory to scan (default: current working directory)

  Options:
    -p, --port <port>   Port to listen on (default: 3044)
    --open              Open browser automatically
    --ignore <pattern>  Glob pattern to ignore (can be repeated)
    --ext <regex>       Regex for file extensions, e.g. "\\.(png|svg)$"
    -h, --help          Show this help message

  Examples:
    vite-assets-browser
    vite-assets-browser ./src
    vite-assets-browser --port 8080 --open
    vite-assets-browser --ignore "**/tmp/**" --ignore "**/__mocks__/**"
    vite-assets-browser --ext "\\.(png|jpg|svg)$"
`)
}

if (args.includes('-h') || args.includes('--help')) {
  printHelp()
  process.exit(0)
}

const options: ViteAssetsBrowserOptions = { ignore: [] }
let dir = process.cwd()

for (let i = 0; i < args.length; i++) {
  const arg = args[i]

  if (arg === '-p' || arg === '--port') {
    const val = parseInt(args[++i], 10)
    if (isNaN(val)) { console.error('  ✗  --port requires a number'); process.exit(1) }
    options.port = val
  } else if (arg === '--open') {
    options.open = true
  } else if (arg === '--ignore') {
    options.ignore!.push(args[++i])
  } else if (arg === '--ext') {
    const raw = args[++i]
    try {
      // Support both /pattern/flags and plain pattern string
      const match = raw.match(/^\/(.+)\/([gimsuy]*)$/)
      options.extensions = match ? new RegExp(match[1], match[2]) : new RegExp(raw, 'i')
    } catch {
      console.error(`  ✗  Invalid regex for --ext: ${raw}`)
      process.exit(1)
    }
  } else if (!arg.startsWith('-')) {
    dir = path.resolve(arg)
  } else {
    console.error(`  ✗  Unknown option: ${arg}`)
    printHelp()
    process.exit(1)
  }
}

console.log(`  Scanning: ${dir}`)
if (options.extensions) {
  console.log(`  Extensions: ${options.extensions}`)
} else {
  console.log(`  Extensions: ${DEFAULT_EXTENSIONS} (default)`)
}
if (options.ignore?.length) {
  console.log(`  Extra ignore: ${options.ignore.join(', ')}`)
}

startAssetServer(dir, options)
