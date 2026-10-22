# 归途站上架基础资料

- 游戏：`homebound-station` / 归途站；更新日期：2026-10-23（北京时间）。
- 运行源码：`86d93d6d781650cdd1528567bb8085e5f5a0a66e`；真实Creator 3.8.8 Web Mobile输入指纹：`a483af6a5b1ddb2db83c2b9e4a848b5e5986404407d6633baf127864a092beef`。
- 53个制品文件校验一致，12组实际浏览器触屏检查通过、页面零错误。另录制1×完整流程，18.5模拟秒通关。详见[验收记录](../docs/design/screen-flow-2026-10-23/verification.md)。
- 当前为手机Web基础资料，未向商店上传或提审；原生渠道另行验收。

## 八类资料

| 类别         | 文件                                                          | 核验                                                                      |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 游戏简介     | [introduction.md](copy/introduction.md)                       | 已核对100关、3×3至6×9、最高50车和固定站门排队规则                         |
| 一句话推荐语 | [tagline.md](copy/tagline.md)                                 | 简体中文，突出箭头移车                                                    |
| 开发者的话   | [developer-note.md](copy/developer-note.md)                   | 并行、拖动与可选激励，不承诺未验收渠道                                    |
| 图标         | [homebound-1254.png](icon/homebound-1254.png)                 | 1254×1254 RGB；与源码及当前包体station-icon.png一致；加载画面已检查       |
| 宣传图       | [竖屏主视觉](promo/images/homebound-keyart-portrait.png)      | 保留852×1846历史原创插画；不是当前实时首页或运行截图                      |
| 宣传视频     | [手机预告](promo/videos/homebound-mobile-preview-390x844.mp4) | 当前录屏前18秒片段，390×844，未变速、无音轨，完整解码通过                 |
| 游戏内截图   | [截图目录](gameplay/screenshots/)                             | 当前首页、低/高关、暂停、倍速、并行、结算、小屏拖动和横屏实图，已人工核对 |
| 游戏内视频   | [第1关1×录屏](gameplay/videos/level01-1x-390x844.mp4)         | 首页到派车、接客、清场结算，未剪辑、未变速、无音轨，完整解码及抽帧通过    |

[媒体清单](media-verification.json)记录当前文件的尺寸、时长、字节数、SHA-256及来源。真实输入和结算保留于[录屏证据](../docs/design/screen-flow-2026-10-23/runtime/recording-input.json)。静音录屏不用于证明手机音频质量。前版资料与通关时间见[历史验收](../docs/design/dispatch-polish-2026-10-22/verification.md)，不代替本轮结果。

## 渠道与广告

仅1×免费；2×、3×、5×分别完整观看一次可用激励广告后解锁本局，失败、取消或不可用不发奖。游戏复用通用激励端口，回调fixture只证明奖励契约。

TapTap小游戏 `game.zip` 接线不等于Android APK接入。APK的Java SDK/Cocos JSB、真实广告位、Tap宿主播放、原生包体与物理手机尚未验收；Web触屏模拟和截图不能代替这些结果。
