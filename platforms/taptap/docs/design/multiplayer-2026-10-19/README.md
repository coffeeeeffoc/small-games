# Tap 好友联机 · 2026-10-19

## 实施前设计

沿用 TapTap 小站的米白、绿色与各游戏现有 competition Canvas。进入好友联机后，主页只有创建房间和输入房间号加入。房间准备页显示原样房间号、地图模式、双方角色与准备状态；准备绑定本房间的配置、种子和固定席位。双方准备后自动进入游戏，不增加另一层确认。

竖屏棋盘/围捕保留纵向棋盘，实时追捕使用横向地图。通用房间页在横屏使用双栏，主要按钮至少 46 CSS px，所有页面扣除安全区和平台胶囊。对局画面复用三款现有渲染器，仅增加小幅返回栏；退出、后台、断线或消息缺失明确结束本局，不假装暂停后继续同步。结算可返回房间入口重新开局。

房间号用 Tap 原生键盘；浏览器适配为真实 DOM 输入与完成按钮。平台屏幕不访问 DOM，不使用 prompt，不模拟登录成功。联机是独立休闲模式，不更新单机存档、云档成绩或后端正式积分。

好友必须从同一版本入口、同一 Tap 应用加入。现有六个 H5/原生应用使用不同 AppID，不承诺跨应用房间互通；既有后端联机路径继续独立保留。

实际实现对方向不符的屏幕旋转完整逻辑视口并反向映射触点。象棋好友局使用 44 px 棋格、剪裁视口和拖盘，避免小屏缩盘后无法落子；此选项不改变旧后端渲染器默认行为。

概念图由 `concept.html` 在实现前生成；实际双浏览器验证截图另存 `actual-*.png`。验证使用 SDK 双端模拟，不等同于真实 Tap 双设备验证。

## 规则与协议

每个游戏仅注入自己的纯规则和渲染描述，平台层不导入游戏注册表、后端服务或 Node 内置模块。房主 seed 与配置由房间属性发布，席位固定为房主 0、加入者 1。准备状态带配置 epoch。所有动作由 SDK 的发送者身份映射席位，不信任消息自报身份。

房主每 125 ms 最多发布一个提交批次，单条消息上限 2048 UTF-8 字节，所有出站消息经过每秒 15 次的共同限制。批次含严格递增序号、整数目标 tick、已批准动作和拒绝的请求编号；两端以同一顺序先推进到 tick，再应用动作。实时模拟固定 120 Hz；回合游戏也使用该整数时钟处理上限。无自身回显时房主在发送成功后本地应用一次。客户端单个待决请求，非法动作收到拒绝后恢复输入。

消息绑定协议版本、游戏、房间和 epoch；重复序号忽略，缺序/非法提交终止，不以未验证快照覆盖状态。准备之前不推进游戏；成员退出、掉线、后台或超时后清理监听与计时。重开使用新房间与 epoch。

加入者以 2 Hz 发送带当前序号的心跳，与动作共享 15/s 预算。双方分别监测对端，5 秒收不到有效数据时中性结束，即使 SDK 没有送达离线事件。终局冻结后保留房间直到主动离开；房主正在发送终局批次时允许先收到对方离开，再依据发送结果应用最后提交，避免回调交错丢掉获胜动作。围捕和象棋的总局时限中性结束，不奖励拖延的一方。

## 官方依据

- [OnlineBattleManager.registerListener](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.registerListener/)
- [createRoom](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.createRoom/)、[sendCustomMessage](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.sendCustomMessage/)
- [showKeyboard](https://developer.taptap.cn/minigameapidoc/dev/api/device/keyboard/tap.showKeyboard/)、[onKeyboardConfirm](https://developer.taptap.cn/minigameapidoc/dev/api/device/keyboard/tap.onKeyboardConfirm/)：输入使用 `defaultValue/maxLength/multiple/confirmHold/confirmType`，确认事件读取 `value`，离开时注销同一组回调并关闭键盘。
- [官方 JS bridge](https://github.com/taptap/minigame-sdk-unity/blob/e491afd44549f387aeb8c0e5e78878af1e1f6716/Runtime/Plugins/TapSDK.jslib#L846) 与 [消息原始类型](https://github.com/taptap/minigame-sdk-unity/blob/e491afd44549f387aeb8c0e5e78878af1e1f6716/Runtime/Scripts/Wrapper/TapBattleClient/TapBattleModels.cs#L584)

主字段为 roomInfo.id/ownerId/players[].id、connect.playerId；消息发送者 playerId，正文 msg。仅兼容已记录的 roomId、fromPlayerId、message 及官方页面示例旧监听名。同义字段冲突拒绝，不猜测 userId/senderId/roomID。准备使用玩家自定义属性；room ID 为服务返回值，不创建伪造房号。

## 实际验证

统一串行入口：

```sh
node games/minigames/scripts/check-tap-multiplayer.mjs
```

本轮使用显式 `TAP_MULTIPLAYER_EVIDENCE_ROOT=platforms/taptap/docs/design/multiplayer-2026-10-19` 保存实际截图；默认输出到被忽略的 `outputs/taptap-multiplayer/`，正常回归不会改写归档证据。

- 25 项规则、双会话和生命周期测试通过：同 seed 回放、非法动作/RNG 原子性、120 Hz 连续/分批一致、三种已核实事件格式、缺少自回显、重复/缺序、真实待决请求拒绝后重试、晚回调、注销抛错、双向失联、UTF-8 限额与共享速率、终局立即退出且房主回调延迟、原生键盘同步异常、前后台指针清理。
- 三款启用 Tap 的原生生成入口打包通过，依赖指纹包含各自唯一的薄规则适配和公共联机会话，没有后端服务或 `node:crypto`。
- 六入口双浏览器全部通过：三款生产 H5 构建和三款实际原生 Canvas controller。每组在两独立浏览器上下文中触摸创建房间、通过正常文本框输入返回的完整房间号加入、双方准备、各自实际行动、比较相同提交序号的状态、退出并清理监听。无页面异常，所有消息不超过 2048 UTF-8 字节。
- 象棋额外覆盖 320×568 的 I1、568×320 的 A10：真实触摸拖盘后落子，拖盘不落子，棋格命中区域保持 44×44。实时追捕覆盖竖屏旋转后的视口映射。原生/H5 截图均已人工检查，与实施前概念的页面层级一致，棋盘和地图沿用各游戏实际美术。
- 共享服务的 12 项回归、workspace 依赖边界检查及根仓库/象棋子仓库 `git diff --check` 通过。

| 入口            | 围捕小队                                                                                  | 街区追逐                                                                                                       | 象棋五子棋                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| H5              | [房间](actual-h5-cops-robbers-room.png) · [游玩](actual-h5-cops-robbers-play.png)         | [游玩](actual-h5-cops-robbers-realtime-play.png) · [旋转](actual-h5-cops-robbers-realtime-rotated.png)         | [游玩](actual-h5-xiangqi-five-play.png) · [320](actual-h5-xiangqi-five-320.png) · [568](actual-h5-xiangqi-five-568.png)             |
| 原生 controller | [房间](actual-native-cops-robbers-room.png) · [游玩](actual-native-cops-robbers-play.png) | [游玩](actual-native-cops-robbers-realtime-play.png) · [旋转](actual-native-cops-robbers-realtime-rotated.png) | [游玩](actual-native-xiangqi-five-play.png) · [320](actual-native-xiangqi-five-320.png) · [568](actual-native-xiangqi-five-568.png) |

测试使用 Chromium 手机触摸输入和显式 OnlineBattle SDK fixture；原生测试运行实际 controller，未运行设备中的 Creator 引擎。尚未验证真实 Tap 双设备房间、线上消息回调顺序、账号/应用权限和宿主键盘；不能据此声称已完成平台真机验收或发布。
