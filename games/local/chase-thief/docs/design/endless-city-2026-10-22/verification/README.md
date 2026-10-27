# 小贼哪里跑 · 当前验收

## 2026-10-27 首页与人物

运行制品 SHA-256：`f5d7029d46d42b3eff8127baff26de57af2db31df2eaaa18b29f946c302f76c8`。基于远端 `c14053973c8b7de46488625f4cc5b4209ce874c8` 的独立副本重建并核对制品身份；保留并行代码，本轮不修改共享构建或广告配置。

- 31 项 Node 游戏测试通过；Blender 网格去重后 2,566,855 bytes，几何、三角形朝向、颜色及法线等价检查通过，无运行时依赖增加。
- Cocos Web 构建及浏览器回归通过：三街区、触屏跑跳滑、暂停/后台/恢复、失败/重试/存档、桌面鼠标、旧存档与禁存储；390×844、360×640、430×932，新增小屏首页热区至少 44 px 且在设计范围内。长距离场景回收最多 6 个活跃街区；页面错误为空。
- Shell 两项接入测试共 109 项通过；定向 Vite Pages 构建及真实入口检查通过，39 条目录登记中选择本游戏，覆盖嵌入、触屏、返回和 Runtime 隔离。此项报告来自主工作区，不冒充完整候选验证。
- 本地实际录屏与浏览器报告对应上述游戏制品。宣传片采用游戏资产另编镜头；两段视频经 ffprobe、完整解码、抽帧检查及 Microsoft Edge 连续播放至结尾。

用户要求本轮媒体与报告仅留本地：仓库根目录 `outputs/chase-thief/delivery-2026-10-27/`（成品、`media-manifest.json`、`browser-report.json`、`gameplay/recording.json`），`outputs/chase-thief/browser/`（回归截图），`.scratch/game-integration/report.json`（Shell 入口）。旧报告和截图未覆盖，不作为本轮重跑证据。

未运行完整 `validate:candidate`；未验证物理手机、Safari、Creator 编辑器导出、原生渠道或真实广告库存，未上传素材至平台。Git 推送及 CI/Pages 状态交付时单独核对。

## 2026-10-25 历史验收

2026-10-25，名称及三个街区视觉维护版。Node 24.21.0 / pnpm 12.6.0 / Windows / Chromium 156.0.8078.47；真实 Cocos Engine 3.8.8 source-Web。

运行制品 SHA-256：`d2bcba76ff670bddfcc38b81c0fdd553dd1dd6621c882fe2d795a4a030cd8ccc`。完整指纹见 [build-info.json](build-info.json)，与 [browser-report.json](browser-report.json) 及[实录记录](../../../../publishing/gameplay/videos/recording.json)一致。

- 31项游戏测试通过：`node --test tests/*.test.mjs`。新增检查验证三个街区的建筑与立面不同、30种实体障碍派生网格有界缓存、装饰不超出原网格轮廓、滑铲净空保留。既有路线、沟壑、存档及奖励测试继续通过。
- `node tests/browser.mjs` 通过：三个起点立即更新暂停预览、各自街区实际起跑、触屏跑跳滑、暂停/恢复/后台、失败/重试/存档、鼠标单次触发、旧存档及禁存储兼容；390×844、360×640、430×932视口，零页面/控制台错误。超过31公里场景回收仍最多6个活跃街区。
- Shell定向96项测试通过：`catalog-assessments.test.ts`、`catalog.integration.test.tsx`、`standalone.integration.test.tsx`；Shell TypeScript、Vite生产构建通过。
- [Shell生产入口报告](shell-pages-report.json)：42条目录登记，选择本游戏执行桌面嵌入、返回、390×844触屏及独立入口、Runtime隔离检查，全部通过。
- [骑楼街](../../../../publishing/gameplay/screenshots/district-old-town.png)、[居民巷](../../../../publishing/gameplay/screenshots/district-alley.png)、[集市](../../../../publishing/gameplay/screenshots/district-market.png)已打开与[效果参考](../district-concept.png)对照。廊柱店招／灰墙晾衣／彩棚果蔬在实际画面中可区分。新名称首页和上架截图、实录、宣传片均已更新，八类素材见[上架状态](../../../../publishing/STATUS.md)。

初次在原主工作区运行大厅目录检查，被已退役游戏的本机残留目录干扰；改用干净Git副本后96项通过，没有删除主工作区残留或放宽断言。浏览器新增的60米取景等待采用20秒上限，包含普通碰撞减速及软件渲染；仍要求实际推进到目标距离。

主会话为唯一写入者；只读reviewer检查 World、ChaseGame、Hud与新增验证，未发现可行动回归问题。保留游戏ID、存档键、路线、速度、六种障碍规则及奖励契约。

本轮为定向构建与入口验证，没有执行完整`validate:candidate`；未验证物理手机、Safari、Creator编辑器导出、原生渠道或真实广告库存，也未上传平台。此前未被本轮链接的截图/报告保留原日期与制品身份，不作为本轮重跑证据。Git提交与远端CI/Pages状态在交付时另行核对。
