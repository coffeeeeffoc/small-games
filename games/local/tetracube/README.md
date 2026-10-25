# 重力方舱 · Tetracube

Cocos Creator 3.8.8 的手机竖屏空间消除游戏，兼容桌面与横屏。保持原来的 8×8×18 方舱、八种四连立方体、三轴旋转、暂存、落点预览和整层连锁。游戏由 Cocos 场景、Graphics 几何、Sprite、Label、输入与音频运行；不再使用旧 Canvas 游戏入口。

- 拖动场景移动方块；“观察”模式可横向、纵向拖动方舱自由旋转，落下和翻舱动画期间仍可操作，也能随时切换立体／俯视／正面／侧面。
- 方块旋转按钮用立方体、旋转面和箭头表示平转／前后转／左右转，各有反向 90°；直接落下，填满水平层消除。
- 左／右侧翻 90° 保持免费。颠倒 180° 在配置激励广告时须完整观看；没有指定广告位则直接使用，不展示广告提示。
- 出生区域堵塞时结束；配置广告后可以选择复活，清理当前世界顶部四层并重新生成原本被挡住的方块。每局最多成功两次，失败、取消、不填充不扣次数也不发奖励。
- 键盘：方向键/WASD 移动，Q/E/R 旋转，Shift 反转，空格落下，C 暂存，G 颠倒，P/Esc 暂停。

规则保存在 assets/scripts/core，src 下保留规则／投影测试的兼容导出。旧 tetracube.save.v1 和 game snapshot v1–v4 继续迁移；原 rescueUsed 计入已用复活次数。读档异常时保留原始内容，当前游玩不会覆盖它。后台暂停、触摸取消和迟到广告回调分别处理，复活不会重置分数、随机序列或预览。

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

[设计效果图与实际对照](docs/design/cocos-2026-10-23/README.md) · [上架素材](publishing/STATUS.md)
