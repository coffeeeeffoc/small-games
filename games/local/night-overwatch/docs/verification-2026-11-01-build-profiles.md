# 三档 H5 包与开发工具验证

2026-11-01。通用配置见 [构建规范](../../../../docs/operations/game-builds.md)，模式语义见 [开发模式](../../../../docs/game-dev-mode.md)。本轮按用户要求准备本地提交，不推送、不部署生产、不上传渠道。

## 实现范围

统一 `development` / `test` / `production`，全局默认允许单游戏覆盖。当前 FRP 网关只开放夜航，故根配置仅为夜航填写测试地址；其他联网游戏缺测试地址时构建拒绝，不回退正式接口。开发包常驻开发按钮；另外两档不能被 URL、父页面或存储开启开发模式。

夜航开发面板提供金币/经验有界整数增减、120 关任意选择、火控热身、资产刷新及原交易重试。金币来自服务端本人资产事务，不修改假余额；只在服务端部署明确启用时可用。选关仍是试玩，不计正常进度，行动中和房间内先要求正常退出。降低经验不删除永久资产。

后续改为通用 `POST /games/:game/development/assets`，请求 `{requestId,deltas}`，元数据报告 `developmentAssets`。适配器按游戏显式注册，目前真实接入者只有夜航，未接入的游戏返回不支持，不创建钱包。夜航客户端实际走通用接口，原 `dev-adjust` 接口继续兼容；两入口共用原交易编号和回执。协议及接入约束见[通用服务说明](../../../../docs/architecture/game-services.md)。

## 已执行证据

- 构建矩阵、fixture ZIP、配置/环境覆盖、模式语义及本地部署脚本测试：32/32 通过；共享工具 40 款同步检查无问题。
- 初轮 Runtime PostgreSQL/HTTP/配置：20/20；通用能力改造后服务端 31/31、共享客户端 53/53、本地升级脚本 2/2，Runtime build/typecheck/lint 通过。夜航 typecheck 通过；夜航测试 349/350 后补齐 artifact fixture 漏复制的已有 `write-report.mjs`，该项单跑 1/1 通过。
- 最终真实 Creator 3.8.8 web-mobile 构建：54,429,255 bytes，源码摘要 `c6c0265637549e7e6006152245d29305f3e8ca41bb2527f556bbc8a41d7c6348`。
- 以源码匹配制品实际打出三档 ZIP，含 Tap 身份桥接、广告配置及包类型；ZIP inventory 验证通过。开发/测试地址为现有 FRP，正式地址为 `https://api.nenggongzhiren.cn/small-games/v1`。
- 真实包体浏览器：开发包在 `dev=0` 时仍显示工具；测试/正式包在 `dev=1` 和已保存 dev 开关时仍锁定。844×390、390×844 检查数字输入、触控隔离、拖动、缩放和滚动。
- 资产闭环使用独立 `competition_test` 数据库及临时 loopback Fastify 服务，只创建新 QA 游客。浏览器拦截配置脚本，将 Tap 身份改为游客并指向隔离 API，原 ZIP 不改。真实执行 +3000 金币、-100 金币、+400 XP、购买 1200 金币军需；刷新后余额 1700、XP 400。选第 120 关为 `operation-120`，试玩标记仍开启。测试服务及浏览器已关闭。

浏览器结果和截图：[verification.json](../reports/build-profiles-2026-11-01/verification.json)、[横屏面板](../reports/build-profiles-2026-11-01/development-landscape.png)、[竖屏面板](../reports/build-profiles-2026-11-01/development-portrait.png)、[第120关](../reports/build-profiles-2026-11-01/mission-120.png)、[正式包关闭工具](../reports/build-profiles-2026-11-01/production-locked.png)。开发截图不是上架素材；正式八类资料的来源和采集版本沿用原记录。

实际包位于 `outputs/game-builds/`：

| 类型 | 批次 | ZIP SHA-256 |
| --- | --- | --- |
| development | `20261101T032249325Z-e5b7bc` | `68550479136add32299cc1801d93f4d0487988d7c703645da803aa4caa643f97` |
| test | `20261101T032253136Z-933a78` | `be4d3464576765dbe93a2dacf79775f1bd16d7640ef02b2c5151f4056b4efebf` |
| production | `20261101T032256404Z-b23470` | `735e56e8b3203e1b3c50acbdf8a557fdddd58db7137d53d5b4ade87bd1c04a06` |

## 未完成的部署与平台验证

自动审批拒绝 `night-overwatch-selftest.mjs start`，仅返回 `blocked by policy`，本次未重启或改动现有 FRP Runtime。因此现有 FRP 尚未获得 `dev-adjust` 能力，开发包连接它会明确提示服务器未启用。准备好的本地升级入口仍沿用备份、恢复校验及迁移流程，不能把本次隔离测试当成已部署。

用户随后明确要求开启 FRP 后再次尝试同一升级入口，执行前仍被自动审批以相同理由拒绝。新通用接口的回环/公网验收已写入该脚本（新 QA 游客、正负调整、同编号重试及非负校验），但未在现有 FRP 执行；本轮最终包体闭环使用隔离服务重新通过。

未验证 TapTap 真宿主、实体手机、真实广告库存或生产接口升级；正式包类型只保证使用正式配置并锁定开发工具，不代替上线验收。
