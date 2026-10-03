# 《声纹疑案》中文语音素材

这 12 个 WAV 是本项目以公开的多说话人 TTS 模型**在本地合成**的原创台词，
不是哔声、浏览器 `speechSynthesis`、真实案件录音或用户上传音频。
未使用声音克隆、参考录音、付费 API、登录凭据或联网推理。
游戏中的角色均为虚构成年人；内部说话人编号仅选择模型的固定音色，
不展示、不推断、也不代表数据集人员的身份或与案件有关。

## 来源与许可

- 运行库：[k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)，
  `sherpa-onnx==1.13.8` / `sherpa-onnx-core==1.13.8`，Apache-2.0。
- 模型：[csukuangfj/icefall-tts-aishell3-vits-low-2024-04-06](https://huggingface.co/csukuangfj/icefall-tts-aishell3-vits-low-2024-04-06)，
  发布者模型卡标注 Apache-2.0。使用官方 sherpa-onnx 的
  [`vits-icefall-zh-aishell3.tar.bz2`](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-icefall-zh-aishell3.tar.bz2)。
  包中 `model.onnx` 与上述模型仓库的 `exp/vits-epoch-960.onnx` 的 LFS SHA-256 完全一致。
- 训练语料：[AISHELL-3 / OpenSLR 93](https://www.openslr.org/93/)，
  由 Beijing Shell Shell Technology Co., Ltd. 发布，官网标注 Apache License v2.0。
  本项目不打包或再分发其原始录音。
- 用法：[sherpa-onnx 官方 AISHELL-3 TTS 文档](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html#aishell3-chinese-multi-speaker-174-speakers)。
- [Apache-2.0 许可全文](./LICENSE-APACHE-2.0.txt) 随素材保留。

模型、数据集和运行库的作者不为本游戏背书。角色与台词为本项目创作。
素材处理包括去直流、边缘静音裁剪、增益归一化、峰值上限和短淡入淡出；
这些修改由本项目生成脚本完成。背景噪声由游戏运行时合成，不来自第三方录音。

## 素材契约

`manifest.json` 中 `voices` 定义 `v0`、`v1`、`v2`，固定对应模型说话人 10、33、99。
这三者是模型原生的不同音色，**没有**通过同一条音频变调来冒充三个说话人。
`phrases` 为 `p0` 至 `p3`；每句的 `clips` 均含三种音色，朗读相同台词。
`clip.url` 相对游戏根目录，文件名为音频内容 SHA-256 的前 16 位。
文件名、界面字母、角色画面均不编码正确答案。

每条录音的 `voiceId`、URL、完整 SHA-256、时长、采样率、RMS 和峰值均在 manifest 中。
现场目标应直接引用正确候选的同一 URL / 解码缓存，在同一 WebAudio 链中另混背景。
不要另合成一次目标台词，否则韵律变化会干扰“同一音源”的可复核性。
manifest 是公开的开发素材清单，并非防作弊或司法声纹证据。

## 本地复现

Python 3.10+；安装 `numpy` 和 `sherpa-onnx==1.13.8`。安装只用于素材制作，
玩家运行游戏不需要 Python、TTS、联网服务或额外模型下载。

```powershell
python -m pip install numpy sherpa-onnx==1.13.8
curl.exe --fail --location https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-icefall-zh-aishell3.tar.bz2 --output vits-icefall-zh-aishell3.tar.bz2
tar -xjf vits-icefall-zh-aishell3.tar.bz2
python games/local/voiceprint-case/scripts/generate-audio.py --model-dir ./vits-icefall-zh-aishell3
```

模型压缩包 SHA-256：
`ab468db3a3308cdd861495e0db2f25d79418a0c00639f74944c7cdf5dd8c6ec1`

模型 `model.onnx` SHA-256（脚本强制校验）：
`5511d651b7840c0a93a6bbfd4afd070a2c7f39ca1ec3ff2ecd73191519bbb852`

本次运行使用 Windows、Python 3.10、NumPy 1.26.4、CPU、单线程，`noise_scale=0`、
`noise_scale_w=0`、`speed=1`。关闭模型内随机噪声使本次环境可逐字节复现，
与游戏运行时添加的环境噪声无关。不同 CPU / 运行库版本可能有浮点差异，
应重新记录文件校验值，而不是声称跨环境保证逐字节一致。

生成到单独目录可对照已有资源：

```powershell
python games/local/voiceprint-case/scripts/generate-audio.py --model-dir ./vits-icefall-zh-aishell3 --output-dir ./audio-check
```

增添台词请编辑脚本的 `PHRASES`。需更换声音时编辑 `VOICES`，并对新音色做试听。
脚本不会自动删除旧 WAV，以免误删手工素材。确认 manifest 不再引用的旧文件后可单独清理。

## 已完成的素材验证

- 12 个真实 RIFF/WAV，单声道，16-bit PCM，8000 Hz；共 12 个不同 SHA-256，
  WAV 文件总计 384,666 字节（约 376 KiB）。
- 每句含且仅含 `v0`、`v1`、`v2` 各一条；所有文本均为中文。
- 时长 1.644–2.513 秒；量化后 RMS 0.0693–0.1231；绝对峰值不超过 0.6800。
- 检查全部 PCM：非空、非静音、有限数值、没有满刻度削顶样本。
- 第二次在独立目录生成，12 条音频 SHA-256 和 manifest 均逐字节一致。
- 所有 WAV 留出短边缘静音及 8ms 淡入淡出，避免开关点击声；背景、主音量、
  soft limiter 的最终混音检查由游戏测试覆盖。

执行环境无法完成真人主观听辨，也未做实体手机耳机试听。数字信号检查不能
替代对中文发音自然度、三种音色可区分度和各关噪声公平性的主观评价。
8kHz 模型有窄带音质限制；提交外部试玩前应以中低音量完成一次人工听辨。
