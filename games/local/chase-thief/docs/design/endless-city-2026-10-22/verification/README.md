# 小贼哪里跑 · 当前验收

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
