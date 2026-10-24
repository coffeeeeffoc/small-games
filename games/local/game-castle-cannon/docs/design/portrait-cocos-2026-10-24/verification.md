# 竖屏 Cocos 验证记录

2026-10-24，使用 Creator 3.8.8 实际导入、构建与运行。设计图见 [设计入口](README.md)，当前素材见 [上架资料](../../../publishing/STATUS.md)。

实际画面：[首页](../../../publishing/gameplay/screenshots/home-cocos-390x844.png)、[战斗](../../../publishing/gameplay/screenshots/battle-cocos-390x844.png)、[弹道](../../../publishing/gameplay/screenshots/trajectory-cocos-390x844.png)、[退出确认](../../../publishing/gameplay/screenshots/exit-cocos-390x844.png)、[选关](../../../publishing/gameplay/screenshots/campaign-cocos-390x844.png)、[设置](../../../publishing/gameplay/screenshots/settings-cocos-390x844.png)、[胜利](../../../publishing/gameplay/screenshots/victory-cocos-390x844.png)、[战败](../../../publishing/gameplay/screenshots/defeat-cocos-390x844.png)。概念图与运行截图分开保存。

## 验证内容

- 89 项规则、会话、网络、关卡、存档及弹道测试通过；另有制品测试验证 LF／CRLF 源码指纹一致，实际源码改动会改变指纹。真实 Creator SDK 类型检查、构建和 lint 通过。
- 390×844、320×568、844×390、1280×720 真实浏览器输入：首页、设置、帮助、外观、选关、拖动、预瞄、蓄力、取消手势、开火、望远镜、返回、继续和离开。手机横屏由 Creator 旋转为竖屏画布。
- 正常战役首关通过真实触屏输入获胜，获得材料，进入下一关，返回并刷新验证解锁和存档；练习自然战败后再战。没有改写生命、计时或使用开发解锁制造结果。
- 弹道单测覆盖双方、三个炮位、四档蓄力，预览与实际炮弹首个碰撞完全一致，预测不写入权威状态。
- 原有 Host 存档键及封装保持兼容；本地确认冻结计时、释放按住状态，继续后恢复。联机确认期间服务端对局继续。
- Creator 制品恢复同时核对源码、引擎、目标及逐文件输出摘要；发布范围绑定准确 base/head 字节，保留 Castle、Shell、开发模式 fixture 和导航样本。

具体事件与浏览器诊断见 [采集记录](../../../publishing/capture-report.json)。Chromium 对合成 touchcancel 的 preventDefault 提示单独记录，无页面脚本错误。高负载下的自动化超时保留在临时日志，已减少重复坐标读取、调整轮询时限，并修正界面重复排序；最终结果以采集记录和准确候选门禁为准。

双客户端联机浏览器验收未通过：本地服务收到加入请求并返回 HTTP 200，但浏览器仍在原有五秒期限取消请求并回退练习。独立服务进程、省电模式和直连重试未解决；尚不能确定原因。服务端与会话规则测试通过不代表双客户端端到端通过。

修复了镜头穿进己方城墙、炮台偏出竖屏画面、Creator 编译 Set 展开语法造成空列表、默认输入框英文标签、Button 重复消费全局触控，以及跨系统换行造成制品摘要不一致的问题。

## 验收边界

本次迁移默认 Web/H5 到 Cocos；原生 Canvas 兼容入口保留，未声称已迁移或通过原生渠道验收。截图与录像来自 Windows Chromium 触屏模拟，不能证明手机真机性能。公网匹配服务未部署，静态入口回退本地练习。视频无音轨，游戏音效保留。旧横屏媒体保留，当前清单引用竖屏批次。
