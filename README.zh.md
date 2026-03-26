# vite-assets-browser

[![npm version](https://img.shields.io/npm/v/vite-assets-browser.svg)](https://www.npmjs.com/package/vite-assets-browser)
[![license](https://img.shields.io/npm/l/vite-assets-browser.svg)](./LICENSE)
[English](./README.md)

一个 Vite 开发插件，在开发时启动一个本地静态资源浏览器。在深色主题的网格界面中浏览项目中所有的图片、视频和字体文件 —— 棋盘格背景让 SVG 始终清晰可见。

![截图占位](https://via.placeholder.com/800x450/1a1a1a/646cff?text=vite-assets-browser)

## 为什么需要它

项目中 SVG 资源较多时，macOS Finder 会以白色背景显示，导致使用了 `currentColor` 或浅色填充的 SVG 完全看不见。这个插件提供了一个专用的资源浏览器，带有棋盘格背景、搜索、类型筛选，以及一键复制路径和 import 语句的功能。

## 安装

```bash
npm install -D vite-assets-browser
```

```bash
pnpm add -D vite-assets-browser
```

```bash
yarn add -D vite-assets-browser
```

## 使用

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import viteAssetsBrowser from 'vite-assets-browser'

export default defineConfig({
  plugins: [
    viteAssetsBrowser({ open: true }),
  ],
})
```

运行 `vite dev`，资源浏览器会自动打开 **http://localhost:3044**。

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | `number` | `3044` | 资源浏览器服务端口 |
| `open` | `boolean` | `false` | 启动时自动打开浏览器 |
| `ignore` | `string[]` | `[]` | 额外的忽略 glob 规则。`node_modules`、`.git`、`dist`、`build`、`.cache` 始终被忽略。 |
| `extensions` | `RegExp` | 见下方 | 匹配文件扩展名的正则。默认：`/\.(png\|jpe?g\|gif\|webp\|svg\|ico\|mp4\|webm\|ogg\|mov\|woff2?\|ttf\|otf\|eot)$/i` |

```ts
viteAssetsBrowser({
  port: 3044,
  open: true,
  // 忽略额外的目录
  ignore: ['**/tmp/**', '**/__generated__/**'],
  // 只扫描图片
  extensions: /\.(png|jpe?g|gif|webp|svg)$/i,
})
```

## CLI

无需安装，使用 `npx` 或 `pnpm dlx` 在任意目录直接运行：

```bash
# 扫描当前目录
npx vite-assets-browser
pnpm dlx vite-assets-browser

# 扫描指定目录
npx vite-assets-browser ./src

# 自定义端口并自动打开浏览器
npx vite-assets-browser --port 8080 --open

# 忽略额外目录
npx vite-assets-browser --ignore "**/tmp/**" --ignore "**/__mocks__/**"

# 只显示 PNG 和 SVG
npx vite-assets-browser --ext "\.(png|svg)$"

# 组合使用
npx vite-assets-browser ./assets --port 4000 --open --ext "\.(svg|png|webp)$"
```

如果已作为开发依赖安装，也可以在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "assets-browser": "vite-assets-browser ./src --open"
  }
}
```

然后通过 `npm run assets-browser` / `pnpm assets-browser` 运行。

### 参数

| 参数 | 说明 |
|------|------|
| `[dir]` | 要扫描的目录（默认：当前工作目录） |
| `-p, --port <端口>` | 监听端口（默认：3044） |
| `--open` | 自动打开浏览器 |
| `--ignore <规则>` | 额外的忽略 glob 规则（可重复使用） |
| `--ext <正则>` | 文件扩展名正则，例如 `"\.(png\|svg)$"` |
| `-h, --help` | 显示帮助信息 |

## 功能特性

- **图片** — PNG、JPG、JPEG、GIF、WebP、SVG、ICO
- **视频** — MP4、WebM、OGG、MOV
- **字体** — WOFF、WOFF2、TTF、OTF、EOT
- 棋盘格背景，透明图片和 SVG 清晰可见
- 按文件名搜索
- 按资源类型筛选
- 无限滚动网格布局
- 一键复制相对路径、文件名或 import 语句
- 在新标签页中打开资源
- 文件变更时实时更新

## 工作原理

1. 插件挂载到 Vite 的 `buildStart` 生命周期（仅开发模式，不影响生产构建）
2. 在配置的端口启动一个轻量 Node.js HTTP 服务
3. 使用 [fast-glob](https://github.com/mrmlnc/fast-glob) 扫描项目根目录，排除 `node_modules`、`dist`、`.git`、`build` 等目录
4. 根路由提供一个完全自包含的 HTML 页面，无外部依赖，无额外构建步骤
5. 通过 `fs.watch` 监听文件变更，通过 SSE 实时推送更新到浏览器

## 本地开发

发布前在其他项目中测试：

```bash
pnpm add -D /path/to/vite-assets-browser
```

## License

MIT
