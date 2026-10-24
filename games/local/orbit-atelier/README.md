# 星扣工坊 · Orbit Atelier

默认主线已改为金属解扣：前六关是普通圆环，后六关逐步加入长圆环、U 形长叉、焊杆环与组合机关。金色底件固定，取出带星标的青银色目标件即可过关；其他活动件可先取下。

沿金属杆拖动旋转，切换“倾斜”后上下拖动，点击“抽离”沿箭头取出。实体相碰会止动返回；空处拖动改变观察视角。提示只标出下一件和姿态，不代替抽离。提供暂停、撤回、辅助、声音和减少动态设置。

中心线使用真实三维坐标，开口圆环缺口为 24°，交叉遮挡来自空间深度。碰撞检查覆盖旋转、倾斜和抽离路径；这是指定出口下的几何解扣模型，尚未实现任意自由平移或完整刚体动力学。

[本次设计、概念图与实际验证](docs/design/physical-metal/README.md) · [上架资料](publishing/STATUS.md)

## 进度兼容

实体主线使用独立 metal-01～12 ID，两章分别为“普通圆环”和“异形机关”。旧版 24 关星核主线、74 关经典星盘和六关旧机关挑战保留在设置页；各目录独立保存进行中的局面、解锁及奖牌。orbit-atelier.v2 继续只读迁移 v1。邀请挑战和开发试玩不写玩家进度。

## 工程与运行

真实 Cocos Creator **3.8.8** 项目，启动场景 assets/scenes/main.scene。棋盘与 UI 由原生 Graphics、Sprite 和 Label 渲染；DOM 仅用于无障碍按钮和平台适配。

```sh
# 在仓库根目录执行
pnpm --filter @coffeeeeffoc/orbit-atelier typecheck
pnpm --filter @coffeeeeffoc/orbit-atelier test
pnpm --filter @coffeeeeffoc/orbit-atelier build
pnpm --filter @coffeeeeffoc/orbit-atelier dev
pnpm --filter @coffeeeeffoc/orbit-atelier test:browser
pnpm --filter @coffeeeeffoc/orbit-atelier test:publishing:browser
```

dev 服务真实 Creator dist，默认端口 4340。COCOS_CREATOR 可指定编辑器；ORBIT_ATELIER_PREBUILT_DIR 仅接受引擎版本、源摘要和运行文件摘要均匹配的制品。浏览器测试默认启动临时端口；ORBIT_URL 可指向相同版本服务，ORBIT_EVIDENCE_DIR 指定报告目录。

core/metal.ts 为无引擎依赖的金属几何，metal-levels.ts 为关卡，MetalBoard.ts 负责投影与命中，OrbitAtelier.ts 负责输入和流程。旧 src/ 和 legacy 测试保留作历史参考，不是运行入口。

手机优先，支持横屏和实际引擎留边视口。Web Pointer Events 统一鼠标、触屏和笔；取消、失焦和丢失捕获恢复手势前状态。原生 Cocos Input 保留。?dev=1 显式开启开发工具，?dev=0 关闭。当前只验证 Web，未完成 Android/iOS 真机或原生小游戏平台验收。

## 可选奖励

普通提示免费。暂停页可在完整观看后对齐下一只可解件，每局一次，不自动抽离。奖励仅接受 SmallGamesRewardAds.offer 的 completed，取消或失败不消耗次数；提示次数和辅助使用标记在撤回、存档后保留。真实广告填充与渠道回调尚未在本轮验证，见[奖励说明](docs/design/rewards-2026-10-24.md)。
