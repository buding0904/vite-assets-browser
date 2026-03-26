import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['vite'],
  loader: {
    '.html': 'text',
  },
  esbuildOptions(options) {
    options.platform = 'node'
  },
})
