# 空间俄罗斯方块 · Tetracube

Cocos Creator 3.8.8 的三维俄罗斯方块游戏，兼容手机、桌面与横屏。首页、选关和实战分别布局；18 个消层挑战分为三章，按通关解锁并记录星级。经典积分保留原来的 8×8×18 方舱、八种四连立方体、三轴旋转、暂存、三块预告和整层连锁。

- 拖动场景移动方块；“观察”模式可横向、纵向拖动方舱自由旋转，落下和翻舱动画期间仍可操作，也能随时切换立体／俯视／正面／侧面。
- 整块沿旋转轴平滑转动，快速连按依次衔接；观察拖动松手后短促缓停，取消、暂停及切换模式立即停止。圆角立方体与预览采用同一套倒角几何和柔和光照。
- 方块旋转提供平转／前后转／左右转与统一反向开关；填满水平层消除。单元格完整贴合，连接边不缩进；选层可看占用格子、隐藏上方层。
- 双指缩放并平移，屏幕加减按钮缩放，百分比按钮一键适配；工具内另有单指平移。观察拖动以眼前表面跟手为准，包括越过俯视极点后的角度。
- 左／右侧翻 90° 保持免费，关卡有次数限制。颠倒 180° 属于辅助，在配置激励广告时须完整观看；没有指定广告位则免费使用，但同样不入榜。
- 出生区域堵塞时结束；配置广告后可以选择复活，清理当前世界顶部四层并重新生成原本被挡住的方块。每局最多成功两次，失败、取消、不填充不扣次数也不发奖励。
- 键盘：方向键/WASD 移动，Q/E/R 旋转，Shift 反转，空格落下，C 暂存，G 颠倒，P/Esc 暂停。

规则保存在 assets/scripts/core，src 下保留规则／投影测试的兼容导出。旧 tetracube.save.v1 和 game snapshot v1–v4 继续迁移；原 rescueUsed 计入已用复活次数。读档异常时保留原始内容，当前游玩不会覆盖它。后台暂停、触摸取消和迟到广告回调分别处理，复活不会重置分数、随机序列或预览。

排行榜复用 Game Services 与 Runtime 共享纯核心回放。关卡榜按最高验证通关序号，积分榜按经典得分；同关／同分均按服务端重放的成功操作步数升序，协议单位为 `steps`。开局使用服务端种子，按 120 Hz 固定 ticks 录制；暂停、菜单与表现动画不推进模拟时间。恢复的旧存档、开发试玩、救援及 180° 辅助只保留本地成绩。服务未配置或不可用时正常本地游玩，排行榜如实显示离线／未开放／空榜，不生成假名次。

## 运行与验证

安装仓库锁定依赖并准备 Creator 3.8.8：

    pnpm --filter @coffeeeeffoc/tetracube test
    pnpm --filter @coffeeeeffoc/tetracube typecheck
    pnpm --filter @coffeeeeffoc/tetracube build
    pnpm --filter @coffeeeeffoc/tetracube dev

开发服务端口 4178，服务 dist 中实际 Creator 构建。源码改动后重新 build，或用 Creator 打开本项目。可设置 COCOS_CREATOR 为编辑器路径。Linux/CI 可用 TETRACUBE_PREBUILT_DIR 指向包含源码匹配 dist 与 cc.d.ts 的真实构建。

    pnpm --filter @coffeeeeffoc/tetracube test:browser

浏览器专项使用真实画布点击、CDP 触控和已标注的广告结果模拟。覆盖 320×640、390×844、844×390、1280×800。?dev 使用公共开发工具的只读快照和明确“试玩不保存”测试局；普通模式不暴露改分入口。

广告复用 [公共接入规范](../../../..//docs/operations/taptap-rewarded-ads.md)。构建默认关闭；配置 H5_ADS_ENABLED=1 和 TAPTAP_TETRACUBE_AD_UNIT_ID 后启用。仅广告 completed 回调生效。浏览器模拟不代表平台真实填充／设备验收。

[本轮设计与验证](docs/design/clarity-2026-10-31/README.md) · [上架素材](publishing/STATUS.md)
