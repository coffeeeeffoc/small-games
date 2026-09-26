# 抱紧了！杂技探险队

原创单人 2D 物理闯关原型。选中一个杂技演员，借地面跳起、借吊环摆荡、自动握住队友的手，再切换角色释放旧支点。三个人必须一起安全抵达。

程序绘制的本地画面、五个短关卡、独立物理试验场、检查点、合成音效、触屏、全屏与本地关卡解锁。没有远程素材、在线字体、后台或账号。

## 启动

使用 small-games 根目录规定的 Node.js / pnpm 版本。在仓库根目录统一安装依赖并启动游戏；本包不单独维护锁文件：

```powershell
pnpm install --frozen-lockfile
pnpm --filter @coffeeeeffoc/hold-tight-acrobats dev
```

打开 http://localhost:4318/ 。手机与电脑处于同一局域网时，可使用 Vite 输出的局域网地址。

```powershell
pnpm --filter @coffeeeeffoc/hold-tight-acrobats typecheck
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test
pnpm --filter @coffeeeeffoc/hold-tight-acrobats build
pnpm --filter @coffeeeeffoc/hold-tight-acrobats preview
```

生产预览为 http://localhost:4319/ 。本包的 `dist/` 可部署至静态 Web 服务，Vite `base: './'` 支持子目录部署。Phaser 固定为 **3.90.0**，使用它内置的 Matter **0.20.0**；所有直接依赖版本保留，由 workspace 根锁文件统一管理。在本包目录也可直接执行对应的 `pnpm dev` / `pnpm test` 等命令。

## 迁移说明

从 `prototypes/games3` 复制到 `small-games/games/local/hold-tight-acrobats`，原目录保留。源代码、测试、文档和本地素材完整保留；排除 `node_modules/`、`dist/`、`test-results/`（含生成截图）和嵌套锁文件。包名为 `@coffeeeeffoc/hold-tight-acrobats`，`coffeeeeffoc.role` 为 `game`，沿用原玩法、依赖版本和脚本。

测试导入均指向本包源码或包依赖，不依赖 prototypes 路径；浏览器入口可通过 `GAME_URL` 指定。迁移后的生产输入、触屏、全屏及观测接口验证结果见 [生产验收记录](docs/MIGRATION-SMOKE.md)，其中保留 Shell 操作选择器与 ready 断言。

## 操作

| 操作 | 键盘 | 鼠标 / 触屏 |
| --- | --- | --- |
| 选择角色 | 1、2、3；Tab 循环，Shift+Tab 反向 | 点击人物或头像 |
| 地面移动 | A / D 或左右方向键 | 左右按钮 |
| 蓄力发力 | 按住空格，松开执行 | 按住橙色发力按钮，拖向目标，松开执行 |
| 发力方向 | A / D 设置左右；空格蓄力时也能用鼠标指向场景 | 从按钮顺向拖动，拖动长度不影响力度 |
| 左手 / 右手松开 | Q / E | 对应的左手 / 右手按钮 |
| 重试 | R | 右上角 ↻，失败弹窗也可立即重试 |
| 暂停 | Esc / P | Ⅱ |
| 帮助 / 路线提示 | — | ? |
| 声音 / 全屏 | — | ♪ / ⛶ |
| 物理调试 | F2，开发模式 | — |

先选最前面的③，走到缺口附近，停稳再起跳。轻按也能发力；约 1 秒蓄满。蓄力期间方向键用于瞄准，暂停地面行走驱动力，重力、惯性和队友仍正常运动。三个角色有不同颜色、头像、编号和形状标记。

## 核心规则

- **脚站稳才能跳。** 检查实际脚部接触、法线、身体朝向和稳定时间。碰墙、头顶撞地、手臂接触不提供跳跃资格。
- **连着真实场景支点才能摆。** 通过队友的手间接连到吊环也算；只有队友互抓而没有场景支点不算。悬挂时沿实际支点的切线给选中者一次冲量，多支点减小力度，让约束自行求解。
- **只给选中者发力。** 队友通过刚体碰撞、手部约束和支撑被带动。完全腾空没有二段跳，也没有地面移动力。
- **自动抓握只看真实手端。** 金色吊环、横杆抓点、边缘把手和队友空闲手可抓；普通墙面、地面不可抓。检测距离、臂展、遮挡、槽位、冷却与扫掠路径，排序使用方向、距离、类型优先级和稳定 ID。
- **Q / E 不等于释放蓄力。** 摆动蓄力先增加速度，随后独立松手延续惯性。单手只解除一条连接，松手本身不附赠冲量。
- **握住后不会自动换目标。** 单手释放有 330ms 冷却，旧目标有 550ms 冷却并须离开 28px 范围。手拉手只建一条物理约束，双方一起释放占用和成对重抓抑制。
- **切换不会冻结队友。** 切换、暂停、失焦、取消触摸都会取消未释放的蓄力。输入绑定按下时的角色；起跳支撑改变时取消原动作，不悄悄改成摆动。
- **全员站稳 0.6 秒才通关。** 进入终点还必须有脚部支撑、低速度。如果队员互相牵住侧躺，分别松手再站稳；碰到旗子或从区域上空飞过都不算。
- **检查点也要求全员到齐。** 第四、五关检查点激活后，普通重试使用合法的安全站位重建世界；暂停菜单中的“从头重来”回到该关起点。

## 五关

| 关卡 | 主要验证 | 路线 |
| --- | --- | --- |
| 1 · 先跳过去 | 选择、不同蓄力、逐个送达 | 从宽平台跳过小缺口，三人全部走入绿色营地 |
| 2 · 抓住再松 | 自动抓环、摆荡、独立松手 | 先抓中间吊环，再向右摆，身体向右上运动时松开；普通站定满力跳无法直接落上右岸 |
| 3 · 人链换支点 | 间接支撑、两端抓握、换人释放旧支点 | ③摆向新横杆，抓牢后①松左手，再分开落到下方宽平台；①可从左侧回收平台补一次短跳 |
| 4 · 中途集合 | 后续队员回收、全员检查点 | 两段缺口；全员先集合，再逐个进入下一段 |
| 5 · 杂技探险 | 人链换支点 + 地面跳跃 + 中间抓环 + 摆动飞跃 | 先完成一次人链换支点，在营地集合保存，再完成最后的吊环峡谷 |

提供一条实际模拟验证的路线，不声称所有时机、所有路径都必定可达。回收平台和下降落脚面是关卡设计的一部分。物理试验场可从初始菜单或关卡菜单进入，不影响正式解锁。

## 模型与简化

这是**卡通主动布娃娃**，不是严格人体模拟：头、躯干、两条腿和脚部是一个复合刚体，左右手臂分别是独立胶囊形刚体，通过肩部距离约束连到主体。手端是真实约束连接位置；手臂有碰撞和质量，绘制直接读取模拟位置。腿不单独弯膝，没有收腿穿窄缝、踩肩步态或任意身体部位抓取。

有限的姿态力矩帮助身体接触地面时站起。空闲手臂使用有上限的关节驱动，并对主体施加反向力矩；接近合法抓点时有局部伸手辅助。不会给整组额外平移推力。空中姿态和真实人类存在差异，落地可能翻滚，需要给队员留出空间。

运行时只有 Phaser 的一个 Matter 世界。关闭 `world.autoUpdate`，由统一适配层对该引擎固定执行 **120Hz** 更新，不启用 Runner 或另一个 Matter 包。渲染可以是 30 / 60 / 120Hz。超过 100ms 的单帧间隔直接丢弃并取消蓄力，避免恢复标签页时补算巨大时间。冲量以 `Δv = J/m` 一次施加；普通操作不调用 `setPosition`、预设飞行曲线或整体移动容器。

## 调整与结构

| 文件 | 职责 |
| --- | --- |
| `src/config.ts` | 步长、重力、跳跃 / 摆动力、蓄力、抓取范围、冷却、约束、速度上限、队员配色 |
| `src/levels.ts` | 出生、预连接、平台 / 斜坡角度、抓点、危险区、终点、检查点、镜头边界和关卡引导 |
| `src/physics.ts` | Phaser Matter 适配、刚体构造、肩部约束、真实脚部接触、站姿和手臂驱动 |
| `src/grips.ts` | 唯一抓握创建 / 删除入口、槽位、冷却、候选、遮挡和支撑图 |
| `src/simulation.ts` | 选择、动作资格、蓄力上下文、局部冲量、固定步进、重置和全员结算 |
| `src/input.ts` | 键鼠与触屏的统一输入、Pointer Capture、取消与失焦 |
| `src/render.ts` | 原创程序画面、实际物理姿势、镜头和调试绘制 |
| `src/main.ts` / `src/style.css` | Phaser 场景、固定 HTML HUD、菜单、手机布局和本地进度 |
| `src/sound.ts` | 可选的短 Web Audio 合成音，音频失败不影响游戏 |
| `tests/core.test.ts` | 支撑图、动作、占用、冷却、碰撞、固定步长和重置回归 |
| `tests/routes.ts` / `tests/routes.test.ts` | 五关真实物理输入路线，不传送、不改速度、不伪造结算 |
| `tests/browser.ts` / `tests/touch.ts` | Chrome 按键、真实 Pointer / Touch 输入、截图、取消、全屏和布局验收 |

F2 调试默认关闭，显示各部分刚体轮廓、18px 手端抓握范围、抓握约束、脚部接触点、选中者支点路径、速度、蓄力、最近拒抓原因和身体 / 约束数量。异常数值或约束拉伸会记录错误、重建并暂停，等待玩家重新开始。

`window.__acroSnapshot` 是只读观测接口，便于浏览器测试。`__acroDev` 仅在 Vite 开发模式存在，生产包删除该调试入口；正式通关测试不使用它。没有生产传送或强制胜利按钮。

## 浏览器测试

先启动开发服务器，电脑需已安装 Chrome（或设置 `BROWSER_CHANNEL=msedge`）：

```powershell
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:browser
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:touch
```

只复查菜单键盘导航、点击选人、蓄力取消和重复重试后的输入监听，可运行 `pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:browser --input-only`。

验收生产包：先执行上面的 workspace 构建与预览命令，然后在 small-games 根目录执行：

```powershell
$env:GAME_URL = 'http://localhost:4319/'
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:browser
pnpm --filter @coffeeeeffoc/hold-tight-acrobats test:touch
```

浏览器测试用真实按键顺序解锁五关；关卡脚本根据只读的位置、抓握和支撑观测决定下一次操作。测试失败会保留截图和状态，不自动跳关或宣称通过。截图、已实际解锁的浏览器状态及 JSON 报告写到 `test-results/`。`START_LEVEL` 只允许测试从此前真实赢得的 `earned-progress.json` 恢复，默认从第一关完整执行。

测试结果和边界见 [验证记录](docs/VERIFICATION.md)。桌面 Chrome 与触屏模拟不是实体手机验收；未验证 Safari / iOS、原生小游戏平台或低端手机长期性能。Phaser 生产包约 355KB gzip，构建有体积提示。

实现时核对了安装版本源码与 [Phaser Matter World 官方文档](https://docs.phaser.io/api-documentation/3.88.2/class/physics-matter-world)、[MatterPhysics 3.90 官方文档](https://docs.phaser.io/api-documentation/3.90.0/class/physics-matter-matterphysics)。
