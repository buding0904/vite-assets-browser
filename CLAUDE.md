# CLAUDE.md

This is the `vite-assets-browser` project — a Vite dev plugin and standalone CLI that launches a local asset browser UI during development.

如果你想了解项目的架构和实现细节，可以参考 [architecture.md](./architecture.md)。

## Key Commands

```bash
pnpm install        # install dependencies
pnpm run build      # build to dist/ (tsup)
pnpm run dev        # watch mode
```

## Notes

- Use `pnpm` (not npm or yarn)
- The UI (`src/ui/index.html`) is inlined into the bundle at build time via tsup `loader: { '.html': 'text' }` — no separate UI build step
- `vite` is a peer dependency, not bundled
- After any source change, run `pnpm run build` to verify the build passes before considering the task done
