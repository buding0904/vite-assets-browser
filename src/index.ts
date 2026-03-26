import type { Plugin, ResolvedConfig } from 'vite'
import { startAssetServer } from './server.js'

export interface ViteAssetsBrowserOptions {
  /** Port for the asset browser server. Default: 3044 */
  port?: number
  /** Auto-open the browser when the server starts. Default: false */
  open?: boolean
  /**
   * Extra glob patterns to ignore during scanning.
   * node_modules / .git / dist / build / .cache are always ignored.
   * @example ignore: ['tmp/**', '__generated__/**']
   */
  ignore?: string[]
  /**
   * Regex to match asset file extensions.
   * Defaults to common image / video / font extensions.
   * @example extensions: /\.(png|jpg|svg|mp4|woff2)$/i
   */
  extensions?: RegExp
}

export default function viteAssetsBrowser(options?: ViteAssetsBrowserOptions): Plugin {
  let root: string
  let started = false

  return {
    name: 'vite-assets-browser',
    apply: 'serve',

    configResolved(config: ResolvedConfig) {
      root = config.root
    },

    buildStart() {
      if (started) return
      started = true
      startAssetServer(root, options)
    },
  }
}
