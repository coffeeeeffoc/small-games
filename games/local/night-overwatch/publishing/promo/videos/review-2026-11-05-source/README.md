# 战斗开场素材 · 2026-11-05

按用户提供的审核反馈重做两个独立文件：连续首关录屏用于展示完整玩法；30秒宣传片从五段真实战斗取景，前27秒展示速射、榴弹、重炮、燃烧弹与热像，最后3秒品牌收尾。两者第一帧就是战斗，不穿插签到、抽奖、浏览器边框或录屏悬浮条。

素材来自Creator 3.8.8 web-mobile，源码摘要 `04beb35ead692b201aade34623110d989c08c994a12547874f5fe1a747c56ab6`。使用桌面Chromium，Canvas及WebGL缓冲均为1920×1080、DPR 1，直接采集30fps VP9再转H.264 / yuv420p / AAC；没有放大低分辨率录像，也不是实体手机录制。

`capture.mjs`复用仓库专属PostgreSQL/HTTP测试服务，各镜头均为普通新游客及实际输入；仅提前完成引导，不注入余额、资产、敌人或结算。首关连续录到服务器确认结算，断言“下一关卡”文案及已同步日志清理。临时容器、卷、网络与进程在退出时清理。日志和原始录屏保留在忽略的`reports/review-video-2026-11-05/`。

连续录屏保留真实游戏音效和电台。宣传片复用上一版原创120 BPM电子配乐的AAC音轨，来源为 `../night-overwatch-ignite-2026-11-04-1920x1080.mp4`，创作资料见[原配乐记录](../ignite-2026-11-04-source/README.md)。不添加来源角标或测试标识。

在仓库根目录复现（需本机已有Creator、Docker Desktop、FFmpeg、Chrome及工作区依赖）：

```powershell
pnpm --filter @coffeeeeffoc/night-overwatch build
$env:NIGHT_EXPECTED_SOURCE_HASH='04beb35ead692b201aade34623110d989c08c994a12547874f5fe1a747c56ab6'
node games/local/night-overwatch/publishing/promo/videos/review-2026-11-05-source/capture.mjs
node games/local/night-overwatch/publishing/promo/videos/review-2026-11-05-source/render.mjs
```

`capture.mjs`断言Canvas/WebGL源尺寸；`render.mjs`核对全部镜头使用同一源码摘要及最终编码尺寸，转码后完整解码、输出逐秒联系表，并在安装版Chrome中以1倍速播放到结尾。准确时长、字节、SHA、首发时间、实际结算、缓存键数量与播放帧数见[evidence.json](evidence.json)。自动播放静音执行，尚未做目标设备人工听感验收；本轮未上传TapTap或重新提审。

最终成片分别55.8915秒/49,810,941字节和30秒/18,384,822字节。GPU初次自动播放正常到结尾但显示掉帧132/67；相同文件用安装版Chrome `--disable-gpu`复验，1675/900帧均0掉帧、无错误。两次证据分别保留在`playback`和`softwarePlayback`，不是重新编码后替换原结果。
