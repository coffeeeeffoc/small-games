# 熔光弹珠

移动端优先的竖屏弹射游戏。拖动场地瞄准、松手连续发射，让弹珠在侧墙、底部及数字目标间反弹。每轮结束目标上移，清空全部波次通关；目标越过顶部警戒线失败。

本作独立编写规则、渲染及音效，未从参考视频提取代码、图像或音频。原创洞窟背景、玻璃目标、金色拖尾、命中变形、碎裂粒子和爆裂冲击波共同构成画面；程序合成音效不依赖音频下载。通用弹射规则可以借鉴，但直接复制他人的代码、素材、角色、名称或高度近似的整体画面可能涉及著作权、商标或不正当竞争；是否涉及特定专利等仍需结合原作判断。

## 运行

在仓库根目录执行：

```sh
pnpm --filter @coffeeeeffoc/ember-bounce dev
pnpm --filter @coffeeeeffoc/ember-bounce test
pnpm --filter @coffeeeeffoc/ember-bounce build
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium pnpm --filter @coffeeeeffoc/ember-bounce test:browser
```

默认开发地址为 `http://localhost:4418/`。可使用 `--host` / `--port` 指定监听；`node server.mjs --dist` 预览正式静态产物。运行代码零外部依赖，构建输出为 `dist/`。Shell ID 为 `ember-bounce`，独立入口为 `/games/ember-bounce/index.html`，大厅路由为 `#/games/ember-bounce`。

## 玩法与内容

- 8 个依次解锁的关卡，逐步引入三角棱镜、爆裂连锁、金色加球及局内强化。
- 三角按实际斜面反射，瞄准虚线与物理共用碰撞计算；连续碰撞检测避免高速穿透。
- 回收放弃当前未命中的弹珠，仍推进一轮；异常长飞行自动回收，避免卡住。
- 加球从下一轮加入；关卡内选择多发两球、撞击增伤或扩大爆裂范围。
- 通关保存星级、最佳分数与最少轮次，正常解锁下一关。存储被禁用时使用内存继续游玩。存档只保存进度和设置，返回主页后从关卡开局重玩。

`levels.mjs` 拥有版本化内容 schema、稳定 ID、波次与解锁配置；`core.mjs` 只处理规则，不访问 DOM、SDK 或存储。`render.mjs` 管理有限粒子、玻璃切面、拖尾与屏震，`audio.mjs` 管理声音与震动生命周期，`storage.mjs` 管理存档迁移和降级，`main.mjs` 连接页面及触屏输入。

## 运行边界与验收

这是独立 H5 / Shell iframe 游戏，沿用仓库的本地存档模式。全屏复用公共 `fullscreen.js`，开发模式复用 `SmallGamesDev`，支持 URL `?dev=1/0` 和 `localStorage.dev`，正式构建默认关闭。调试面板中的任意选关均标记试玩，不写入玩家成绩或解锁。

纯规则及存档测试覆盖 8 关在 60 fps / 24 fps 下自然通关、三角反射、防穿透、爆裂、回收、失败、成长、迁移和练习隔离。生产浏览器验收使用 Linux Chromium 的手机触屏模拟，覆盖首关真实操作通关、强化、结算、下一关、存档恢复、取消手势、暂停、后台恢复、小屏与横屏、全屏和开发开关。效果图及实际截图见 `docs/design/`。未执行微信原生工程或手机真机验收；原生微信小游戏需要单独运行环境适配。
