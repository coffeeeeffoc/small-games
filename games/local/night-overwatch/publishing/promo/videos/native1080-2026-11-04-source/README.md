# 夜航守望 · 原生1080p多武器宣传片

2026-11-04。成片30秒，1920×1080，16:9，30fps，H.264 MP4；保留上一版燃向配乐的原始AAC轨道。

## 本版变化

- 删除“浏览器实录 · 战斗剪辑”“游戏内画面 · 成像展示”等宣传片来源角标。
- 战斗内容由10秒增加到22秒：速射炮、榴弹炮、重型榴弹炮、燃烧弹、热像及持续支援。
- 所有战斗镜头重新采集：CSS视口、Canvas、WebGL drawing buffer均为1920×1080，DPR为1。直接录制游戏Canvas，VP9目标24Mbps；转为H.264剪辑中间素材时仅规整30fps，没有空间放大、裁切或AI超分。
- 音乐从 `night-overwatch-ignite-2026-11-04-1920x1080.mp4` 提取后无损复用，最终以AAC压缩轨道SHA-256核验一致。

## 来源身份

使用隔离复制的Creator 3.8.8 web-mobile稳定制品，sourceHash为 `c3f32a92a83b06f6421f1f95a4f747e8b8cec02f0270f116dc4aadc7e16fd74a`。当前工作区另有在途游戏修改，本任务没有重新构建或修改游戏代码。

采集环境为桌面Chromium、D3D11、离线普通首关。`__night`只用于读取状态和投影；瞄准、切枪、缩放和开火全部通过鼠标/键盘输入。只跳过已完成教程；没有开发模式、资产fixture、模拟状态注入或测试技能。原生1080p指真实渲染与采集分辨率，不指原生手机宿主。

五段无字幕采集素材位于 [`../../../gameplay/videos/native1080-2026-11-04/`](../../../gameplay/videos/native1080-2026-11-04/)，属于约11秒的剪辑源片段，不能直接当作符合15秒下限的独立渠道实录。每段采集的画布尺寸、武器、视图、前后状态和错误记录见本目录 `*-capture.json`。原始WebM与复查图位于游戏 `reports/night-promo-native1080/`。

## 分镜

| 成片区间 | 内容 | 源片段及起点 |
| --- | --- | --- |
| 0–4s | 夜航品牌开场 | 既有1920×1080标题美术 |
| 4–7s | 速射炮连射与命中 | rapid1080.mp4 / 3.5s |
| 7–10s | 榴弹炮爆破 | blast1080.mp4 / 2s |
| 10–13s | 重炮弹着与爆炸 | heavy1080.mp4 / 5s |
| 13–18s | 燃烧弹持续火区 | incendiary1080.mp4 / 5.5s |
| 18–20.5s | 热像搜敌与命中 | thermal1080.mp4 / 4.5s |
| 20.5–23s | 速射持续支援 | rapid1080.mp4 / 6s |
| 23–26s | 炮火掩护 | blast1080.mp4 / 6s |
| 26–30s | 品牌收尾 | 既有1920×1080标题美术 |

## 复现剪辑

复用已安装依赖的 `reports/night-promo-studio/`，或在本目录 `npm ci`。新建public目录，将上述五段素材按原名复制进去；将 `../../images/title-1920x1080.png` 复制为 `public/title.png`。然后：

```powershell
ffmpeg -y -i ../night-overwatch-ignite-2026-11-04-1920x1080.mp4 -map 0:a:0 -c:a copy public/ignite.m4a
npx tsc --noEmit
npx remotion studio
npx remotion render src/index.ts Native1080 picture-master.mp4 --codec=h264 --crf=16 --concurrency=4 --image-format=png --pixel-format=yuv420p
ffmpeg -y -i picture-master.mp4 -i public/ignite.m4a -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart ../night-overwatch-ignite-native1080-2026-11-04.mp4
```

`capture.mjs`保留采集方法，要求127.0.0.1:4328服务提供上述固定制品；先检查源码摘要，不用当前在途源码替换其身份。脚本引用游戏已有只读遥测及真实输入辅助。原始配乐生成源见上一版 `ignite-2026-11-04-source/`。

技术参数、全片解码、正常速度播放、最终音轨一致性、分镜检查及SHA-256见同级 `night-overwatch-ignite-native1080-2026-11-04-evidence.json`。未上传平台，也未进行实体手机播放验证。

`reports/night-promo-native1080/` 和 `reports/night-promo-studio/` 为本地忽略的原始采集、渲染及工作缓存；克隆后复现使用上述 publishing 已归档MP4、配乐成片和本目录源码，无需这些缓存。
