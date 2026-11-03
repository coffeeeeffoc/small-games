# 夜航守望 · 战术宣传片

2026-11-04，30秒，1920×1080，30fps，H.264 MP4 + AAC双声道。
用途：首页推荐及游戏详情页宣传片。未上传平台。

## 分镜与来源

- 0–4秒：已有正式宣传图动态推近，任务主张。
- 4–7秒：当前夜景实机截图，单独组织成像介绍画面。
- 7–10秒：当前增强实机截图。
- 10–13秒：当前热像实机截图。
- 13–18秒：实机录像第3–8秒，火力支援。
- 18–23秒：实机录像第11–16秒，保护友军。
- 23–30秒：宣传图与主题收尾。

使用 `2026-11-04-refinement` 的浏览器画面，对应源码摘要 `c3f32a92a83b06f6421f1f95a4f747e8b8cec02f0270f116dc4aadc7e16fd74a`。源实录为1280×720，排版放大到1080p宣传片；不是原生1080p实机采集或实体手机录屏。品牌画面为原有宣传美术，不冒充实机。原素材许可见游戏 `docs/ASSET_MANIFEST.json`。音乐和转场声由 `score.mjs` 原创合成，无第三方歌曲、人声或录音。

本片20秒为品牌与成像介绍，10秒为两段实录剪辑，包含独立文案、动画、排版和音乐，不是连续实录改名。内容差异的最终平台审核尚未进行。

## 复现

在此目录执行 `npm ci`，建立 `public` 目录，复制以下已有素材（不重复归档源素材）：

| 来源（相对此目录） | public文件名 |
| --- | --- |
| ../../images/title-1920x1080.png | title.png |
| ../../../gameplay/screenshots/2026-11-04-refinement/night-1280.png | night.png |
| ../../../gameplay/screenshots/2026-11-04-refinement/enhanced-1280.png | enhanced.png |
| ../../../gameplay/screenshots/2026-11-04-refinement/thermal-1280.png | thermal.png |
| ../../../gameplay/videos/refinement-2026-11-04-1280x720-silent.mp4 | combat.mp4 |

执行 `node score.mjs`、`npx tsc --noEmit`，然后：

```sh
npx remotion studio
npx remotion render src/index.ts NightOverwatch ../night-overwatch-tactical-2026-11-04-1920x1080.mp4 --codec=h264 --crf=18 --concurrency=4
```

验证结果见同级 `night-overwatch-tactical-2026-11-04-evidence.json`。已检查分镜接触表、Studio预览、全片解码及浏览器正常速度完整播放；音轨检查覆盖时长、格式和峰值，不替代目标设备听感。
