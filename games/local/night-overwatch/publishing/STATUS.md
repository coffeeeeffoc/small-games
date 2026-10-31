# 夜航守望 · 交付状态

更新：2026-10-31。Game ID：`night-overwatch`。当前 Creator H5 源码指纹：`9ace559e5917244fe551f650d01228192488698dee896f8409d1f3479f48aeec`。加载后直接进入作战基地，四种基础武器加三个额外武器槽；永久强化不占槽。先配置，再选择单人或双人；双人保留各自实际档位。规则与数值见[军需与关卡](../docs/design/armory.md)。

本轮玩法闭环成立：完成配装、选关、实战与结算；规则回放和真实浏览器操作验证见[本轮验收](../docs/verification-2026-10-31-armory-v2.md)。目标为 TapTap H5 自测，素材已提供，本地提交；未推送、未上传渠道、未部署正式服务。下一步在手机 TapTap 验证登录、真人对战与真实激励广告。

| 类别 | 状态 | 当前文件与验证 |
| --- | --- | --- |
| 游戏简介 | 已提供 | [introduction.md](copy/introduction.md)，符合当前玩法 |
| 推荐语 | 已提供 | [tagline.md](copy/tagline.md)，沿用并复核 |
| 开发者的话 | 已提供 | [developer-note.md](copy/developer-note.md)，按本轮配置规则更新 |
| 图标 | 已提供 | [1024×1024 PNG](icon/icon-1024.png)，沿用完整不透明背景 |
| 宣传图 | 已提供 | [1920×1080](promo/images/title-1920x1080.png)、[1440×1440](promo/images/title-1440x1440.png)，沿用标题图，单张小于4MB |
| 宣传视频 | 已提供 | [16秒](promo/videos/armory-v2-2026-10-31.mp4)，基地、商店、日历及战斗，1280×720 H.264，无音轨 |
| 游戏截图 | 已提供 | [瞄准](gameplay/screenshots/2026-10-31-armory-v2/combat-01-aim.jpg)、[榴弹](gameplay/screenshots/2026-10-31-armory-v2/combat-02-he-shot.jpg)、[交战](gameplay/screenshots/2026-10-31-armory-v2/combat-03-engage.jpg)，1280×720 JPEG，单张小于4MB |
| 实录 | 已提供 | [16秒连续战斗](gameplay/videos/armory-v2-2026-10-31.mp4)，真实桌面鼠标输入，1280×720 H.264，无音轨 |

两条视频完整解码通过；新截图与浏览器页面已实际打开核对。媒体尺寸、字节数、摘要和原始采集版本见[清单](manifest.json)，旧批次保留在[历史状态](STATUS-2026-10-31-armory-v1.md)。运行资源来源见[素材清单](../docs/ASSET_MANIFEST.json)。

568×320、844×390、1280×720 浏览器覆盖直达基地、六列商店、抽奖、签到日历、库存、战绩入口、大厅、选关与实际开火；这些截图隔离外部服务。独立 PostgreSQL 验证钱包、首通补差、试用品开战消耗与对战真实档位。当前首通金币按关卡递增；电磁首档7,900金币，约为前20关首通总额，无关卡硬门槛。

[本机 Docker / Sakura FRP 与 H5 打包方法](../../../../docs/operations/night-overwatch-local-selftest.md)。已保留本地数据卷和迁移前备份。现有隧道与旧后端健康检查均为200；新版Docker更新被工具自动审批拦截，仅返回“blocked by policy”，尚未切换到本次代码。手机自测前需按链接中的 start 步骤更新本地服务。手机实机、TapTap 登录换码、真实广告库存与领奖仍需真实宿主验收；浏览器与HTTP验证不代表这些已通过。
