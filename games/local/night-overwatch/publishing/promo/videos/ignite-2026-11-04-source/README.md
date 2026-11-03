# 夜航守望 · 燃向配乐版

2026-11-04。用于首页推荐及游戏详情页；30 秒、1920×1080、16:9、30fps、H.264 MP4，AAC 48kHz 立体声。

成片：[`../night-overwatch-ignite-2026-11-04-1920x1080.mp4`](../night-overwatch-ignite-2026-11-04-1920x1080.mp4)。

## 画面与音乐

无损复用当日 `night-overwatch-tactical-2026-11-04-1920x1080.mp4` 的 H.264 视频轨道，没有二次视频压缩。原画面工程和分镜见 [`../tactical-2026-11-04-source/README.md`](../tactical-2026-11-04-source/README.md)：20秒品牌动画/成像介绍，10秒战斗剪辑，区别于连续实录。

新配乐由本目录 `score.py` 从零合成：120 BPM、D minor，包含失真低音、立体声合成器分解和弦、独立旋律、重鼓点、滚奏、六处转场冲击和结尾和声。没有引用外部歌曲、录音或采样。23秒品牌出现后保留高潮，28秒终止式后渐出。最终音量约 −15 LUFS，峰值以同级 evidence 为准。

源战斗录像是1280×720浏览器采集，在1080p画布中排版放大；不宣称原生1080p实录或实体手机录制。原美术来源沿用战术版记录。本版不改动游戏代码，不上传平台。

## 复现

需要已有 Python/numpy 与 FFmpeg。在本目录执行：

```powershell
python score.py score.wav
ffmpeg -y -hide_banner -i ../night-overwatch-tactical-2026-11-04-1920x1080.mp4 -i score.wav -map 0:v:0 -map 1:a:0 -c:v copy -af loudnorm=I=-15:TP=-1.5:LRA=9:measured_I=-13.92:measured_TP=-0.86:measured_LRA=3.70:measured_thresh=-24.05:offset=0:linear=true -c:a aac -b:a 320k -ar 48000 -t 30 -movflags +faststart ../night-overwatch-ignite-2026-11-04-1920x1080.mp4
```

上述测量值对应未修改的 `score.py`。修改编曲后先用 `ffmpeg -i score.wav -af loudnorm=I=-15:TP=-1.5:LRA=9:print_format=json -f null NUL` 重测，更新 `measured_*`。

## 验证边界

生成器包含有限值、长度、双声道、非静音及峰值断言；成片检查参数、全片解码、H.264轨道逐字节摘要、分镜图、正常速度完整浏览器播放、AAC响度和真峰值。证据见 [`../night-overwatch-ignite-2026-11-04-evidence.json`](../night-overwatch-ignite-2026-11-04-evidence.json)。浏览器播放为自动化检查，未进行人工目标设备听感验收或平台上传审核。
