# 小游戏开发者模式

本约定是开发模式语义、接线与验证的唯一维护入口；产品与改造要求见[通用开发规范](game-development.md)。适用于所有现有及后续新增小游戏的 Web/H5 入口，包含 Shell 内置游戏、独立页面及 iframe。

## 渠道包类型优先级

统一 H5 打包配置指定 `buildType` 时，包内不可写的 `__SMALL_GAMES_BUILD__.type` 优先于所有 URL、父页面和存储开关：`development` 强制开启开发模式，按钮常驻（可拖动、可关闭面板，不能隐藏按钮或退出模式）；`test` 与 `production` 强制关闭，`?dev=1` 和旧存储不能开启。配置、服务器地址与单游戏覆盖见[构建指南](operations/game-builds.md)。`devMode` 清单字段只表示客户端开发模式，不授予服务器修改资产的权限。

未指定包类型的旧配置、普通独立 Web 和 Shell 保留下述显式开发语义。带类型的测试／正式 H5 包不适用“正式静态构建仍可用 URL 开发功能”的旧约定。

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

开发用跳关、全关解锁、物理视图、平衡参数、状态快照等功能使用 `SmallGamesDev.isEnabled()` 统一判断，避免只依赖 `import.meta.env.DEV`、`NODE_ENV` 或单款游戏私有存储键。面向玩家的主页选关、正常关卡解锁与成长功能不受 dev 开关限制。改变关卡解锁、战斗参数或胜负的开发操作应明确标记为试玩，沿用游戏自己的奖励/排行隔离规则。

`registerActions` 可声明 `input: { label, min, max, step, value }`，面板渲染带触屏热区的数值输入并将有效数字传入 `run(value)`。效果发生在场景里的动作（动画预览、跳页、改变局面）声明 `dismiss: true`，成功后自动关闭面板，避免限时演出在模态面板后面播完；需要在面板内阅读结果的动作不声明，失败时面板保持打开并显示原因。面板标题栏与“关闭”按钮在滚动时固定在顶部，宽屏下动作按多列排列。字段约束只是交互辅助；游戏和服务端继续验证整数、范围、身份、幂等及资产边界，不以客户端按钮作为权限校验。

## 新游戏接入与验证

新增游戏仍按 `docs/standalone-games.md` 注册。新增游戏或修改入口、开发功能及构建流程时，运行 `pnpm check:dev-mode`、`pnpm test:dev-mode`，并对相应生产构建执行 `pnpm test:dev-mode:browser`；检查实际支持的独立、Shell 内置与 iframe 入口。同步公共副本，接入入口及独立构建，并根据玩法注册有用的附加动作或快照。自定义入口或构建格式应同时扩展 `scripts/sync-game-dev-mode.mjs` 的发现与检查逻辑。

`pnpm check:games` 已包含开发模式一致性检查，扫描实际游戏目录；漏接入口、独立构建或副本不同步会失败。`pnpm test:dev-mode` 检查开关语义、iframe 优先级、禁用存储、跨域父页面及新增游戏漏接。生产构建的手机浏览器检查使用 `pnpm test:dev-mode:browser`，覆盖每款游戏的独立页面及 Shell 入口，验证 URL、存储、默认关闭和显式关闭，以及可拖动面板、触点取消和已有开发功能。
