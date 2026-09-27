# 一分钟拆对墙

三关手机优先 Web 原型：按住橙色大接缝凿击，拖动换缝，松手停锤。先卸重，再拆支撑；最后切断的接缝把板推向箭头方向。拆下的整板仍有重量，会阻挡、堆叠并撞坏花瓶或邻墙。全部目标断开、可见下落且静止 0.75 秒后才验收。

## 启动与检查

只需要 Node.js 20+，零运行时依赖，无需 npm install。

```powershell
Set-Location -LiteralPath 'F:\playground\playground-ai\small-games\games\local\precision-demolition'
npm start
# 浏览器打开 http://localhost:4405/
npm test
```

可指定地址：`npm start -- --host 127.0.0.1 --port 4405`。默认监听 `0.0.0.0:4405`，同局域网设备可用电脑 IP 访问。独立服务也支持 `/precision-demolition/`。


## 操作与关卡

- **卸重**：上方两块先下，等重量真正卸走，再拆右支柱。先拆右柱会使蓝柱承重从 4 变为 8，超过上限 5。
- **花瓶**：上板先凿左缝、再凿右缝，推向左侧；反向拆序会使落板实际撞碎花瓶。然后拆托板和下柱。
- **邻墙**：卸掉上层四块，避免向右撞邻墙；横梁先左后右拆，再收尾支柱。一旦重量仍留在横梁上，断开连接并不等于已经卸重。

橙色箭头表示最后一锤的推力方向。接缝三次命中断开，期间每次都有裂纹、锤击动画和声音；这只是连接的耐久值，胜负由共享承重与碰撞计算。失去其他支撑时，其余板也会落下，不需要逐块点击。

支持鼠标、单指与键盘：Tab 选接缝，按住空格/Enter 凿击。双指不会加倍敲击；松手、指针取消、失焦停锤。暂停冻结时间和运动，继续时需重新按下。关卡按钮自由切换，“重来”立即重新开局，“声音”可静音；Web Audio 由主动操作启用。

## 实际验证

- `npm test`：11 项规则检查，包括三关成功/失败输入记录、真实落物撞击、花瓶移开对照、质量守恒、落稳等待、取消/暂停/重试和超时。任一断言失败会非零退出。
- `tests/recordings.json`：三关坐标与固定步序输入；含先拆支柱超载、撞花瓶、撞邻墙的失败对照。
- `docs/browser-evidence.json`：实际 Edge 浏览器产生的输入、碰撞、承重和结算记录；规则检查会重放这些实际输入。
- 桌面 1280×960：三关均实际完成开局 → 错误操作 → 失败 → 重试 → 胜利；验证按住、拖动、取消、暂停继续与静音。
- 390×844 触控模拟：用浏览器触摸事件实际执行卸重关失败 → 重试 → 胜利，并操作花瓶关。390×844、360×800 无横向溢出或纵向裁切；390×844 接缝热区至少 44 CSS 像素。另用浏览器 touchMove / touchCancel 验证触摸拖动与中断，不在中断后继续敲击。

浏览器验证临时使用用户允许的 games1 Playwright 包和系统 Edge；它们没有加入 package.json，也不是游戏或 npm test 的依赖。

## 文件与边界

- `docs/concept.png`、`docs/concept-prompt.md`：内置 image_gen 生成并检查过的效果图与完整提示词。它是风格参考，游戏画面由 Canvas 实时绘制，不把效果图当作可玩证据。
- `docs/playtest-desktop.png`、`docs/playtest-mobile.png`：实际运行截图；另有失败与胜利截图。
- `DESIGN.md` 第 13 节：真实第二轮挑战和第三轮收敛。早期五关、旋转、再碎裂等提案已取消。

**限制**：最多八块预切板，实际三关为 4/3/6 块；轴对齐矩形近似、无旋转或二次碎裂。矩形内部绘制材质，保护物图案不超出碰撞边界。承重图均分载荷，静止接触会继续传递落板重量；不模拟建筑弯曲、连续墙体或工程安全。凿击强度只影响接缝耐久，不模拟局部切口应力。

手机尺寸与触控模拟不是实机；未做真实手机、系统手势、扬声器听感、原生全屏或玩家吸引力验证。桌面帧率数据不能代表手机性能。本版提供适配视口的网页，没有把 CSS 铺满宣称为真全屏。三关固定布局，没有随机生成、无限重玩、账号、广告、支付或平台 SDK。


## small-games 接入

在仓库根目录运行 `pnpm --filter @coffeeeeffoc/precision-demolition test` 和 `pnpm --filter @coffeeeeffoc/precision-demolition build`。静态产物为本目录 `dist/`，保留相对资源路径。

Shell 入口为 `#/games/precision-demolition`，独立入口为 `games/precision-demolition/index.html`。`pnpm build:pages` 会打包本游戏；`pnpm test:pages` 覆盖桌面 iframe 和手机触控交互，CI、Pages 与移动端 Web 资源包共用此链路。

`docs/` 中原型试玩记录保留作历史证据；本次接入报告由仓库根目录 `.scratch/game-integration/report.json` 生成。
