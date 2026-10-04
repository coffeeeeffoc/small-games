# 小游戏开发者模式

本约定适用于所有现有及后续新增小游戏的 Web/H5 入口，包含 Shell 内置游戏、独立页面及 iframe。模式由运行时显式开关决定，正式静态构建也保留开发功能。

## 启用与关闭

在页面 URL 的查询部分添加 `?dev`、`?dev=1` 或 `?dev=true`；已有查询参数时使用 `&dev=1`。Shell 示例：`/small-games/?dev=1#/games/wulong-city`，单独游戏示例：`/games/wulong-city/index.html?dev=1`。Shell 的游戏路由也支持 `#/games/wulong-city?dev=1`。

在当前站点控制台执行 `localStorage.setItem('dev', '1')` 后刷新，或在调试面板勾选“记住开发模式”，可让此站点的所有游戏在后续打开时启用。`true`、`on`、`yes`（忽略大小写及两端空白）同样有效。存储属于浏览器 origin，切换域名或端口后需重新设置。

`?dev=0`、`?dev=false`、`?dev=off` 或 `?dev=no` 显式关闭，并优先于存储。未识别的参数值视为关闭。删除参数并执行 `localStorage.removeItem('dev')` 可恢复默认；面板的“退出开发模式”会删除此开关并以 `dev=0` 重新打开当前游戏。URL 启用不会自动写入存储。

优先级是游戏自身 URL、同源祖先页面 URL、当前 origin 的存储、默认关闭。Shell 路由中的 `dev` 优先于 Shell 页面查询参数。读取存储或跨域父页面失败时，仍能使用游戏自身 URL。iframe 的宿主应把有效模式作为 `dev=1` 或 `dev=0` 传入 iframe URL，独立打开的链接也携带它。公开分享链接继续只包含玩法参数，开发模式不会随分享传播。

## 统一运行代码与选项

唯一源代码为 `platforms/h5/dev-mode.js`，对应类型为 `platforms/h5/dev-mode.d.ts`。每款游戏携带本地副本，因而可在脱离父仓库、独立部署或子模块仓库中运行。使用 `pnpm sync:dev-mode` 同步；修改公共实现后同步全部副本。

开发模式显示可拖动的“开发”按钮，面板提供性能信息、触点显示、运行信息、重新加载、记住模式和退出模式。调试控件使用独立样式和触屏热区，其操作不会传给场景。性能采样仅在勾选后运行；触点在松手、取消或窗口失焦时清理。普通模式不显示这些入口。

Vite 游戏在入口 HTML 中加载 `<script type="module" src="./dev-mode.js"></script>`。普通静态游戏使用 `<script src="./dev-mode.js"></script>`，位于游戏脚本之前，构建脚本同时复制此文件。塔防入口在 `static-site/`，Cocos 游戏把副本放在 `scripts/`，在独立 Web 构建中插入并复制脚本；预构建制品必须与包含这些文件的源码身份一致。

访问开发 API 的 TypeScript/ES module 源文件先导入对应本地文件，例如：

```ts
import '../dev-mode.js';

if (window.SmallGamesDev.isEnabled()) {
  const cleanup = window.SmallGamesDev.registerActions([
    { id: 'physics', label: '切换物理调试', run: () => scene.toggleDebug() },
  ]);
  const stopSnapshot = window.SmallGamesDev.registerSnapshot(() => scene.snapshot());
  // 游戏卸载时调用 cleanup() 与 stopSnapshot()。
}
```

普通脚本直接使用 `window.SmallGamesDev`。浏览器入口在场景创建前加载它；共享规则、原生 Canvas 控制器及服务端代码保持平台独立。Web 的模式开关不代表微信/B站等原生平台调试或发布验收。

已有的选关、物理视图、平衡参数、状态快照等开发功能使用 `SmallGamesDev.isEnabled()` 统一判断，避免只依赖 `import.meta.env.DEV`、`NODE_ENV` 或单款游戏私有存储键。改变关卡解锁、战斗参数或胜负的开发操作应明确标记为试玩，沿用游戏自己的奖励/排行隔离规则。

## 新游戏接入与验证

新增游戏仍按 `docs/standalone-games.md` 注册。同步公共副本，接入入口及独立构建，并根据玩法注册有用的附加动作或快照。自定义入口或构建格式应同时扩展 `scripts/sync-game-dev-mode.mjs` 的发现与检查逻辑。

`pnpm check:games` 已包含开发模式一致性检查，扫描实际游戏目录；漏接入口、独立构建或副本不同步会失败。`pnpm test:dev-mode` 检查开关语义、iframe 优先级、禁用存储、跨域父页面及新增游戏漏接。生产构建的手机浏览器检查使用 `pnpm test:dev-mode:browser`，覆盖每款游戏的独立页面及 Shell 入口，验证 URL、存储、默认关闭和显式关闭，以及可拖动面板、触点取消和已有开发功能。
