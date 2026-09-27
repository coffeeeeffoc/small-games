# Afterimage Arena

原生 Canvas 时间协作动作原型。中文 UI，三关，桌面与双指触控；每 20 秒重置战场，以真实逐帧输入重演最多三个过去的自己。第三关由三名残影破盾，当前玩家打核心。

## 启动与检查

需要 Node.js 20+，不需要安装依赖。

```powershell
Set-Location -LiteralPath 'F:\playground\playground-ai\small-games\games\local\afterimage-arena'
npm start
# http://127.0.0.1:4406/
```

```powershell
Set-Location -LiteralPath 'F:\playground\playground-ai\small-games\games\local\afterimage-arena'
npm test
# 任何规则检查失败都会以非零状态退出
```


手机同网访问可用 `npm start -- --host 0.0.0.0`，然后访问电脑局域网地址的 4406 端口；本项目不修改防火墙。端口占用会明确报错。

## 操作

- 桌面：WASD / 方向键移动，空格按住开火；也可拖动屏幕摇杆。手机：左手摇杆移动，右手按住开火。武器朝 Boss 自动瞄准，但不会自动开枪、移动或躲避。
- 红色外环预警时向内靠近，内环预警时向外走。最终关十字线预警时还要侧移。提示直接出现在战场下方。
- 第一关先去西侧录下破盾火力，回溯后去东侧核心输出。第二关录下西、东两侧，从南侧打核心。第三关再补北侧记录。
- 录满 20 秒自动留下当前记录。满槽后固定保留旧记录，继续进攻；点击“重录①/②/③”明确替换目标。原版本保留到新段录完，失败或取消不会销毁旧段。
- “重试当前轮”保留已录制内容。暂停、失焦、切后台停止模拟时钟并释放输入；回到页面需点继续。静音按钮保存本机偏好。
- 开局可选温和/标准；分别给 2 / 1.6 秒预警。首关射界 100°，后两关 54°/50°，核心从第 4 秒持续开放，取消了窄时间窗口。内圈禁止通行，封印只延续 0.55 秒，单角色无法兼任两侧。

## 验证与文件

- `npm test`：两种容错下共六条完整路线、每 200ms 调整的粗粒度移动、方向扰动、真实输入回放、旧角色受击/轨迹一致、静止失败、缺任一必要残影失败、当前停火失败、100 次回放、30/60/144 FPS 分段推进、失败保留与替换隔离。
- 本次浏览器实测：桌面三关分别在第 2/3/4 轮获胜，最终关第 14.48 秒击破；第 7.27 秒主动放弃躲避触发死亡，重试保留旧记录。390×844 双触点操作完成第一关；静音、暂停和指定重录/取消通过。页面错误与失败资源请求为 0。
- 浏览器验收记录见 `docs/playtest-results.json`；桌面与手机尺寸截图是 `docs/playtest-desktop.png`、`docs/playtest-mobile.png`。截图必须配合记录判断完成状态，不能独立证明通关。
- `docs/playtest.mjs` 仅是可选浏览器验收脚本，通过参数临时加载本机 Playwright；游戏和 `npm test` 不依赖它。脚本没有状态修改、注入记录或自动通关接口，而是通过真实鼠标/键盘/双触点操作。只读 `window.__arena.snapshot()` 用于观测。
- `docs/concept.png` 是内置 image_gen 生成的视觉概念图，`docs/concept-prompt.md` 保存提示词。已查看：四角色和破盾因果符合方案；概念图中的秒数排版不代表真实 UI，实际画面以试玩截图为准。

验证边界：这是本机 Chrome 浏览器与手机视口/触控模拟，不是实体手机、Steam 或其他浏览器的验收。未开展陌生真人试玩，未确认首次理解率和 3–5 分钟体验目标；Web Audio 状态与静音行为可验证，自动化运行不代替主观听音。刷新清空本局记录。没有联网、SDK、广告、支付或账号系统。


## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/afterimage-arena test` 和 `pnpm --filter @coffeeeeffoc/afterimage-arena build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/afterimage-arena`，独立入口为 `games/afterimage-arena/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
