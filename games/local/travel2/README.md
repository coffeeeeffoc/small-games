# 外滩 · 一江入梦

竖屏优先的外滩沉浸式滚动叙事。国风纸感插画从晨光过渡到夜色，滚动带动镜头、船影、薄雾和飞鸟。支持桌面、手机横竖屏与键盘章节导航。

## 运行

在仓库根目录运行：

```sh
pnpm install
pnpm --filter @coffeeeeffoc/travel2 dev
pnpm --filter @coffeeeeffoc/travel2 build
pnpm --filter @coffeeeeffoc/travel2 test
pnpm --filter @coffeeeeffoc/travel2 test:browser
```

开发地址 `http://localhost:4182`。`dist/` 是独立静态站点，Vite 使用相对资源路径，也通过 Shell 的 `/games/travel2/` iframe 加载。浏览器检查可用 `PLAYWRIGHT_EXECUTABLE_PATH` 指定 Chrome。

## 游览规则

| 章节     | 进度    | 稳定印章 ID | 探索内容 |
| -------- | ------- | ----------- | -------- |
| 江风初醒 | 0–25%   | clock       | 江畔听钟 |
| 石墙旧梦 | 25–50%  | roof        | 绿顶拾光 |
| 一水之间 | 50–75%  | ferry       | 一苇渡江 |
| 万家灯火 | 75–100% | lights      | 一江入梦 |

上滑或滚轮前进，也可点击右侧章节或底部继续漫步。每幕点击地标，阅读后点击「盖上这一枚」。重复收集不会增加计数。手账可跳回任一幕，四枚集齐后可下载本地生成的 PNG 明信片。重走不会清空手账。

存档键为 `travel2:bund:stamps:v1`，仅保存有效的印章 ID；损坏数据忽略，无法写入存储时保留当前会话并提示。声音默认为关，用户点击后使用 Howler 播放原创合成江风与盖章音；隐藏页面暂停声音和 Pixi ticker。遵循系统减少动态效果设置。WebGL 不可用时 Pixi 优先回退 Canvas；场景渲染器均不可用时保留静态日夜插画和完整游览/集章功能。

## 实现与素材

React + TypeScript + Vite 管理页面，PixiJS 渲染场景，GSAP ScrollTrigger 把原生文档滚动映射为 0–1 叙事进度，Zustand 管理集章，Howler.js 管理音频。不依赖可选角色动画库。

主图与夜图共约 796 KiB，见 [美术来源](art-notes.md)。音效由 `node scripts/generate-audio.mjs` 可重复生成。Google Fonts 可用时加载思源宋体，离线回退本机宋体；场景与声音均随站点提供。叙事时间用于表现虚构的一天，场景是艺术化构图，不是精确地理、航线或营业时间指南。

验证包含存档和镜头边界检查、真实浏览器滚动/触摸/盖章/重载/明信片，以及 Shell 入口和 iframe 返回。浏览器模拟不代表已在实体手机或微信内完成验收。

## 2026-09-14 验收

- 独立生产构建、状态/镜头边界测试通过；浏览器 7 个场景通过：1365×900、390×844、320×640、844×390、减少动态效果、Canvas 回退、静态插画回退。
- 覆盖真实触摸滚动、四章集章、重复收集、手账跳转、重载后的存档及章节恢复、结局重走、1200×1500 PNG 下载、音频启停与页面隐藏恢复；无页面异常或本地资源加载失败。
- Shell 17 项测试、大厅 20 个目录入口与 16 个 iframe/手机独立入口检查通过。完整结果及截图由浏览器脚本生成到仓库 `.scratch/travel2-browser/`。
