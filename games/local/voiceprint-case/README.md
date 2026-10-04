# 声纹疑案

手机优先的原创中文听声辨人游戏。深夜展品失窃，玩家从现场杂声中记住一句话的音色，
再与 A / B / C 三位虚构成年人说同一句话的人物录像比较，选择后单独确认。
候选在房间中说话，配合表情和短动作；现场用统一黑影遮住身份，保留说话姿态供观察。
12 关渐进背景噪声、无限重听、答案复核、结果统计和重新挑战。无麦克风、上传、账号或在线推理。

## 本地启动

仓库工具链：Node **24.21.0**、pnpm **12.6.0**。

在仓库根目录运行：

```powershell
pnpm --filter @coffeeeeffoc/voiceprint-case dev
```

打开 <http://127.0.0.1:4178/>，点击「开始调查」解锁音频。所有 WAV 已包含在项目内。
游戏本身没有 npm 运行依赖；也可以在本目录直接运行 `node server.mjs`。

```powershell
pnpm --filter @coffeeeeffoc/voiceprint-case build
pnpm --filter @coffeeeeffoc/voiceprint-case preview
```

`dist/` 是可独立托管的静态产物，所有路径均为相对路径。不要用 `file://` 打开。
默认仅监听本机，不自动对外开放。需要局域网真机测试时，可显式运行
`node server.mjs --host 0.0.0.0 --port 4178`，再在同一网络的手机访问电脑 IP。

## 玩法与公平性

- 开始及切关自动播放现场；完整听完一次后解锁 A / B / C。试听和选择是独立动作，选择不会自动提交。
- 提交后显示结果，可用「回看正确人物」对照人物动作和去掉背景的现场人声，再进入下一关。
- 每局随机重排候选，三个目标音色各出现四次。现场直接引用正确候选的同一 URL / `AudioBuffer`。
- 四句中文台词 × 三种模型原生固定音色。没有音高按键、语音识别、变调冒充或手机多音色 TTS 依赖。
- 人物画面是程序绘制的虚构情景演绎，不是真人录像。候选在室内有不同外貌、神态和动作；
  现场统一使用无五官、无发型、无服装细节的黑影，房间布置不随正确答案改变。
  每关重新分配人物表现，同一关现场与正确候选保留一致的动作习惯；姿势是辅助线索。
- 不显示台词、音源文件名或按录音生成的波形。手机端可左右滑动人物录像卡，点击画面回放，
  选择按钮单独确认候选，不会因播放而选中。
- 12 关信噪比为 **18、16、14、12、10、8、6、4、2、0、−2、−4 dB**，背景从单层到三层。
- 混合前按样本实测能量校准，混合 RMS 保持 0.1；人声与背景同时进入同一 soft limiter 和主音量节点。
  默认音量 45%，上限 80%，soft limiter 上限 0.72。难度不通过提高总音量增加。
- 开关、切换、确认、切关、回准备、隐藏页面和离开页面均停止当前声音，异步播放用 token 防止旧任务复活。
- 画面以音频时钟推进，嘴部开合取自原始人声能量；只更新正在播放的画面，停止时复位。
  系统设置减少动态效果时保留静态画面与正常声音。

所有角色与案件均为虚构。它是听觉娱乐游戏，不是现实身份鉴定或司法声纹工具。
纯静态游戏无法防止查看源码作弊；开发素材清单公开，是为了来源透明与答案可复核。

## 素材、扩展与复现

见 [语音来源与生成说明](assets/audio/SOURCES.md)、[Apache-2.0 许可](assets/audio/LICENSE-APACHE-2.0.txt)
和 [生成脚本](scripts/generate-audio.py)。使用 sherpa-onnx 1.13.8 与官方 AISHELL-3 多说话人 VITS 模型，在本地 CPU 合成；
无需付费服务、私人录音、声音克隆或 API 凭据。背景由 `audio.mjs` 程序生成。

`levels.mjs` 管理关卡和随机映射；`recording.mjs` 管理房间人物、匿名现场与播放动画；
`assets/audio/manifest.json` 管理台词、音色与素材 SHA-256。
扩展时先生成每句话的三种固定音色，再增加关卡；保持现场和候选引用同一条源录音。
录音是 8kHz 单声道 PCM16，有窄带音质限制。

## 验证

```powershell
pnpm --filter @coffeeeeffoc/voiceprint-case lint
pnpm --filter @coffeeeeffoc/voiceprint-case test
pnpm --filter @coffeeeeffoc/voiceprint-case build
pnpm --filter @coffeeeeffoc/voiceprint-case test:browser
```

浏览器测试使用仓库的 `@playwright/test`，需要已安装 Chromium / WebKit 浏览器。
它以 390×844 和 360×640 触屏视口完成 12 关，验证实际解码、同一 `AudioBuffer` 映射、无叠音、
正确/错误反馈、得分、重开、页面隐藏清理及音频加载失败后的重试；同时检查人物画面随播放变化、
停止后冻结、正确人物复核、触屏横滑与手势取消、减少动态效果、模拟页面缓存恢复及 1280px 桌面三列布局。
截图和 JSON 报告输出到 `test-results/`。
本次在 Linux Chromium 140 / WebKit 26 验证通过；浏览器触屏模拟不能替代实体 iPhone / Android 验证。

单元测试覆盖 256 个随机种子、12 个 WAV 哈希/非静音/时长、逐关实测信噪比、恒定 RMS 和 soft limiter 峰值。
本项目是原生 ES modules，没有独立 TypeScript 类型检查配置；`lint` 运行 Node 语法检查。
仓库 `.prettierignore` 默认跳过本地游戏，交付时额外显式格式化并核对了本目录源文件。

未完成真人主观听辨、实体手机与耳机试听。信号检查不能替代对中文自然度、音色可区分度及难度公平性的听感评价。
发布与使用时仍需补充这一轮主观试听，不能把自动化通过视为听感验证。
仓库 `game-meta` 依赖真实 Git 提交历史：先提交源码，再生成并提交对应元数据，一起经过 dev 的 CI / Pages 发布检查。
