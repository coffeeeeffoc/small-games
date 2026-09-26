# 迁移后的生产验收记录

2026-09-26，使用本机 Chrome 154.0.8037.57（Playwright `channel: 'chrome'`）验证目标 workspace 的 Vite 生产构建。预览地址为 `http://localhost:14319/`，测试均显式设置 `GAME_URL`；未使用 Playwright 下载的 Chromium。

## 结果

| 检查 | 结果与范围 | 报告（本地生成，不纳入版本控制） |
| --- | --- | --- |
| `test:browser --input-only` | 通过；菜单 Tab / Shift+Tab / Space、角色点击与切换、有效蓄力取消、pointercancel、失焦暂停、重复失焦、20 次重试后单次发力；控制台与页面错误 0 | `test-results/input-report.json` |
| `test:touch` | 通过；844×390 横屏、390×844 竖屏控件边界，触摸选人、拖出后只释放一次、双指取消、真实全屏进入 / 退出；页面错误 0 | `test-results/touch-report.json` |
| 生产入口与观测 | 通过；snapshot 可读、开发入口不存在、初始菜单和 canvas 就绪、开始后模拟时间推进；无失败资源请求、HTTP 4xx/5xx 或页面异常 | `test-results/production-report.json` |

本轮无需修改游戏源码或测试。此次未重跑五关浏览器完整路线，实体手机、Safari 或原生小游戏平台未验收；历史完整路线记录见 [原型验证记录](VERIFICATION.md)。

仓库级 `pnpm test:pages` 另已通过真实 Shell iframe 和 844×390 触屏独立入口的选人、蓄力发力、位移、重试与暂停检查。

## 复现

在 small-games 根目录完成 `pnpm install --frozen-lockfile` 后：

```powershell
pnpm --filter @coffeeeeffoc/hold-tight-acrobats build
pnpm --filter @coffeeeeffoc/hold-tight-acrobats preview --port 14319
```

保持预览运行，在另一个终端执行：

```powershell
$env:GAME_URL = 'http://localhost:14319/'
$env:BROWSER_CHANNEL = 'chrome'
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:browser --input-only
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:touch
```

省略 `--input-only` 可执行五关浏览器完整路线，默认从第一关开始，不手工写入解锁进度。

## Shell smoke 选择器与 production snapshot

这些选择器与断言作用于实际游戏文档。嵌入 Shell 时使用游戏的 Playwright `Frame` 定位控件、读取 snapshot；独立页面测试不能直接将 `GAME_URL` 改为 Shell 地址。先点击游戏控件取得键盘焦点。

| 阶段 | 选择器 / 操作 | 断言 |
| --- | --- | --- |
| Ready | `#start`、`#stage canvas` | 开始按钮可见、canvas 尺寸非零；`window.__acroSnapshot.panel === 'intro'`、`paused === true`、`level === 1`、`actors.length === 3` |
| Start | 点击 `#start` | `panel === null`、`paused === false`、`status === 'playing'`，随后 `time` 增长 |
| 选人 | 点击 `[data-who="2"]` | `selected === 2`、按钮 `aria-pressed="true"` |
| 发力 | 等 `actors[2].action === 'jump'`，按住 Space 或 `#power`，等 `charge.power >= 0.2` 后松开 | `charge === null`、`actions.length` 恰好加 1、选中者真实位移，`numericalErrors === 0` |
| 取消 | 有效蓄力时按 2，再松开 Space | `selected === 1`、`charge === null`、动作数不增加 |
| 暂停 / 继续 | `#pause` → `#resume` | `paused` 为 true 时 time 不增长，恢复后继续推进 |
| 重试 | `#retry` | `status === 'playing'`、`charge === null`、动作数清零，重试不重复绑定输入 |
| 关卡 / 帮助 | `#chapters` / `#help`，用 `#resume` 返回 | `panel` 对应 chapters / help；全新存档的后续 `[data-level]` 按钮 disabled |
| 全屏 | 横屏点击 `#fullscreen` 进入 / 退出 | 游戏文档的 `document.fullscreenElement` 真实变化；iframe 须允许 fullscreen；竖屏布局隐藏此按钮 |

`window.__acroSnapshot` 在生产包中保留，`'__acroDev' in window` 应为 false。关键观测字段包括 `level/selected/time/status/paused/charge`、`actors`（位置、速度、grounded、action、双手、safe）、`grips/counts/actions/events/numericalErrors` 和 `panel/view`。每次重新读取 getter，不修改观测数据，也不使用开发接口代替真实操作。

源页面标题仍为「抱紧了！杂技探险队」。队员与关卡按钮的 data 属性从 0 开始；snapshot 的正式关卡编号从 1 开始，0 为试验场。
