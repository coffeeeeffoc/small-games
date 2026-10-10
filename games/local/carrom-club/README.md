# 克朗棋 · Carrom Club

木质棋盘、轻滑棋子、直接回拉击球。你执白子，与阿洛进行九子人机对局；六关练习依次学习摆位、轻击、角度、借库与红后补进。

```sh
pnpm --filter @coffeeeeffoc/carrom-club dev
pnpm --filter @coffeeeeffoc/carrom-club build
pnpm --filter @coffeeeeffoc/carrom-club test
pnpm --filter @coffeeeeffoc/carrom-club test:browser
```

本地入口 `http://localhost:4428/`，正式独立入口 `/games/carrom-club/index.html`，Shell 入口 `#/games/carrom-club`。`preview` 运行正式静态制品。无新增运行依赖，首屏仅一张约272KiB的 WebP 木纹图集；加载失败降级为程序纹理。

## 操作与规则

拖动下方滑轨摆位，按住击球子向目标反向回拉，松手发射。回到起点、点击取消、手势被取消或切到后台都不会误发。虚线预览首个碰撞，短红线表示目标子预计出射方向。键盘可操作摆位滑轨，Escape 暂停或取消。

先回拉确定大致方向，再左右慢慢微调；短回拉也采用低灵敏度，并过滤细小触屏抖动。松手使用最后稳定预览，避免指尖离屏前短暂偏移改变方向；大幅换向可回到起点重新回拉。瞄准时显示角度和力度，静态虚线帮助观察落点。

采用明确的休闲规则：进本色连杆；空杆或只进对手则换手。红后需同杆或下一杆补进本色，否则返场；补进完成后先清本色的一方获胜。击球子落袋返还本杆本色及一枚已进子，不足记欠并在后续进子偿还。红后未补进时最后一枚本色返场。没有完整赛事裁判细则或多人联网。

六关配置独立于核心规则，稳定 ID 关联星级和顺序解锁。借库关允许直击完成，鼓励探索角度，不使用伪造反弹进度。回合稳定时本地存档；进行中的击球在重载后回到上个稳定回合。关闭声音/触感的偏好持久保存。存储被禁用仍可玩。

## 结构

- `src/content.mjs`：版本化关卡目录与校验。
- `src/core.mjs`：240Hz固定步长圆盘物理、落袋、回合、犯规、红后、AI与评星；不依赖DOM/SDK。
- `src/render.mjs`：静态木纹棋盘缓存、动态棋子、碰撞预览、落袋反馈及插值。
- `src/main.mjs`：触屏输入、页面切换、生命周期和Shell沉浸消息。
- `src/aim.mjs`：以CSS像素为基准的角度慢调、手势死区与松手前偏移过滤。
- `src/storage.mjs`、`src/audio.mjs`：本地持久化边界、校验与可选声音。

`?dev=1` / `localStorage.dev` 复用公共 SmallGamesDev；`?dev=0`显式覆盖。仅开发模式暴露只读状态/建议出杆及六个试玩入口，试玩不记录胜局、解锁或星级。原生小游戏平台没有在本次实现中接入，交付为移动端优先H5与Shell iframe。

设计依据见 [产品方案](docs/design/product.md)、[生成设计图](docs/design/concept.png)、[生成提示词与素材说明](docs/design/image-prompts.md)。实际截图与浏览器记录在 [validation](docs/design/validation/)。测试为桌面 Chromium 手机模拟和原生 CDP 触控输入，不是真机验收。
