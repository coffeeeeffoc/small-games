# 零域 · NULL RANGE

当前为[全面重构计划](../../../docs/plans/2026-10-29-nullrange-rebuild.md)的 **B4 内容、成长与反馈版本**：六个单机任务，三类普通 AI 与三阶段精英，Falcon / Kestrel / Warden 三种实际三维机体及正常解锁。真实 Cocos Creator 3.8.8 渲染，固定 60Hz 纯规则，`RULE_VERSION=nullrange-b4-v1`。

[单机目标图](docs/design/target-mobile-v2.png)和[对战目标图](docs/design/target-online-v2.png)保持原样。任务卡片使用主会话提供的六格插画；它不是玩法截图。[B3历史证据](docs/design/b3-scene/README.md)保留；自然林海、山谷构图、机体材质与空气层次仍未达到最终视觉要求。B5真实双人权威对战、B6完整视觉/素材验收继续由主会话推进，当前没有假房间、假网络成绩或生产后端改动。

Game ID `vibeJam-myself-nullrange`、包名 `null-range-mobile-cn`、独立入口 `/games/vibeJam-myself-nullrange/index.html` 和 `dist/` 保持。旧 Vite/Three 原型可从 `8c4c821addb627e4196ccdc0b9437475e4b60f47` 找回，不是生产入口。

## 任务与机体

| 任务     | 实际决策与胜负                                                                             |
| -------- | ------------------------------------------------------------------------------------------ |
| 晨雾巡航 | 三段短教学；转向/散热/锁定，六敌清除即胜                                                   |
| 山脊截击 | 三批逃逸信标与护航；加速优先截击，任一信标越过10500m逃逸距离即失败                         |
| 回声回收 | 四组巡逻，每回收三份激活下一组；十二份全部回收才胜，目标残骸不超时消失                     |
| 峡谷护航 | 沿五点路线守护真实运输机；航程激活五波，运输机失去280机体即失败，安全抵达终点即胜          |
| 交叉火网 | 五组左右交替的截击/游击/重机组合；清空立即推进，不用定时空等                               |
| 终光决战 | 精英在2/3、1/3机体阈值进入新阶段；护航存在时精英护盾免伤，清护航后攻击核心，齐射随阶段变化 |

| 机体         | 解锁         | 巡航/加速m/s | 转向rad/s | 机体/护盾 | 单发热量/导弹 |
| ------------ | ------------ | ------------ | --------- | --------- | ------------- |
| Falcon 战隼  | 初始         | 92/165       | 1.42      | 100/70    | .105/6        |
| Kestrel 红隼 | 完成山脊截击 | 108/192      | 1.90      | 75/48     | .120/5        |
| Warden 守望  | 完成峡谷护航 | 80/144       | 1.12      | 145/100   | .074/8        |

纯规则正常输入解锁链样本：26.90 / 148.45 / 146.90 / 156.15 / 147.35 / 146.75 秒；后五关均约2–3分钟。前两关用Falcon，中两关用Kestrel，末两关用Warden。驾驶策略、浏览器实际结果和限制见[TEST_REPORT](TEST_REPORT.md)。这些是具体策略的实测值，不保证所有玩家/机型均为同一用时。

## 操作、成长与反馈

- 左摇杆驾驶/升降，右侧长按开火/加速、点按导弹/扫描。键盘 WASD/方向键、空格、Shift、E、Q、Esc 补充。脉冲前方12°/760m辅助瞄准；导弹25°/900m锁定；目标和弹道须有地形视线。
- 三类 AI 分别追击后脱离、侧向绕飞、蓄能重机通场；18°前射角限制，精英三阶段齐射。动态波次的新生目标使用安全的前后位置，死亡敌机不再移动/射击。
- 扫描6秒/冷却10秒，420m内吸引残骸，回收补盾20、能量25与分数50。任务HUD展示真实回收数/逃逸百分比/运输机血量与航程/精英阶段，导航菱形指向实际对象。
- 命中十字、破盾、销毁碎片、回收光点、重机蓄能、近地提示与加速视角均来自真实事件。复用10类原创音效；固定32个FX节点，弹丸/敌机/残骸复用池。减弱动态关闭镜头偏移、FOV变化和命中闪烁，不改变规则、计时或暂停。
- 正常胜利记录任务最高分、最高星级与最快ticks，并解锁下一关及对应机型；失败/开发试玩不写成长。最高分、星级与最快时间按幂等极值合并，没有货币、重复领取或广告必经门槛。免费即时重试已覆盖本批失败恢复需求，未增加可选广告收益或PvP优势。
- 保留 `nullrange-progress-v1` 键，schema升级为2；v1/旧best与muted只迁移合法数据，不从旧分数发明胜场。每次写入重新读取并只修改明确字段，Web Locks串行跨页写入；损坏/未来版本/读取失败拒绝覆盖，存储不可用时本次会话仍可推进。
- 手机横屏，竖持旋转完整画布与触控；Web CSS物理安全区只映射一次，原生使用系统安全区。双指取消、拖出、旋转、失焦/后台暂停、设置返回及退出清理保持。没有浏览器全屏入口。
- [统一开发模式](../../../docs/game-dev-mode.md)默认关闭，启用可自由预览/试玩六关三机型，`__nullrange.snapshot()`仅返回脱离状态的只读数据。正式模式的诊断可通过既有 `SmallGamesDev.inspect().game`读取，不改变开关或游戏状态。

## 构建与验证

Node 24.21.0 / pnpm 12.6.0，现有锁定依赖，真实 Creator 默认 `D:/tools/cocos/CocosCreator.exe`，`COCOS_CREATOR`可指定3.8.8。

```powershell
pnpm --filter null-range-mobile-cn typecheck
pnpm --filter null-range-mobile-cn build
pnpm --filter null-range-mobile-cn test
pnpm --filter null-range-mobile-cn test:browser
# 游戏目录内：默认正式模式实际输入战役链（较长，按需运行）
node tests/campaign.browser.mjs
```

`dev`/`preview`只服务已构建dist，默认43170；报告/日志放忽略的`reports/`。`tests/campaign.test.mjs`以普通Controls验证全链，独立边界测试可设置fixture但不作为自然可玩证明。

`NULLRANGE_PREBUILT_DIR`制品必须含真实dist、build-info与cc.d.ts；sourceHash、逐文件哈希、声明与Creator身份不符均拒绝。首次资源导入修改meta时需再次构建，不能绕过指纹保护。根声明缓存/缺失时真实安装声明回读保护继续保留。

## 实现与资源归属

- `core/content.ts`：唯一任务/机体目录、目标union、条件波次与配置校验；没有按任务ID写六份规则。
- `core/rules.ts`：单机组合与固定步进；导出的`advanceFlight`、`advanceWeapons`、`consumeMissile`、`sweptDistance`等不依赖AI或引擎，可供B5单一权威Duel复用，不把两份solo互相模拟当联机。
- `core/progress.ts`：v2迁移/显式字段写入/解锁/幂等；`presentation.ts`：安全区、雷达、导航、目标文案与星级。
- `NullRange.ts`：页面、正常模式门禁、存档写锁、音频、生命周期；`FlightInput.ts`：保留既有双拇指与键盘取消逻辑；`UI.ts`：原生Sprite图卡/Graphics/Label；`World.ts`：Prefab、摄像机、地形与池化反馈。
- 21个GLB总65,920面/6,640,468字节。新Kestrel3272面、Warden3816面，三机型有独立外形、喷口和8点碰撞采样。原19模型及其树林LOD、岩壁/NASA月面均保留。实际GPU计数见报告，不能当作手机FPS结论。
- [art/README.md](art/README.md)及manifest保存原创Blender生成器/可编辑源/哈希，运行GLB只存在`assets/resources/models`；Creator唯一路径仍为`models/<name>/<name>`。Hyper3D未下载。
- `scripts/prepare.mjs`生成场景、PCM与缺失meta；声音生成器仍是唯一10音库。library/temp/build/dist/cc.d.ts/reports为生成物，不提交伪造引擎内容。

[当前上架资料](publishing/STATUS.md)准确区分B4实测证据与B6尚未完成的正式八类素材；本地通过不代表真机、平台上传、CI/Pages或远端联机通过。
