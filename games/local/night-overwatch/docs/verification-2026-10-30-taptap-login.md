# 夜航守望 · TapTap 登录与游客绑定

日期：2026-10-30。集成基线 `46a2fe0daf972d7897e3ed8c9d0e1344685027ee`。

## 行为及配置

- 正式 H5 构建显式配置公开 MiniApp ID，安装共享登录适配器；普通 Web 和离线变体保持原行为。平台失败不创建新游客。
- 后端沿用现有 `/sessions/platform` 和唯一身份约束。首次绑定未使用过的 Tap 账号时，保留可验证游客的 playerId、昵称与服务端成绩，并撤销旧游客会话。另一设备登录同一 MiniApp 下的同一 Tap 账号可找回该玩家。
- 已有 Tap 账号归属另一玩家时登录其原账号，不合并旧游客成绩。并发绑定同一游客到两个 Tap 账号，只允许一个成功。
- 旧游客已完成日志沿原 scope/key 恢复，同一 playerId 才能上传。保留请求编号、runId、输入批次、序号和已同步标记；其他玩家、API 或 Tap App 的日志不上传。原日志不搬移，避免旧标签页晚写复活。
- `.env.taptap.info.yaml` 中夜航 MiniApp 凭证已通过官方 stable-token 校验：HTTP 200，有效期 7200 秒，未强制刷新。仅输出成功状态，凭证和返回 token 未进入 Git、构建包或验证材料。该结果证明应用凭证有效，不代表真实玩家 code 已换码。
- 本次复用现有后端能力，无业务表或 schema 迁移；单机本地存档不因此变成完整跨设备云存档。

## 验证

- 构建配置、Tap 登录、旧游客日志恢复及范围规划定向 96 项通过；TapTap 包 lint、Runtime TypeScript、改动格式和独立只读复核通过。
- 真实 HTTP / PostgreSQL 17.6、runtime_app 权限：Night 绑定专项 3 项通过，覆盖保留 ID/资料/成绩、账号冲突不合并、跨新会话恢复及并发不同账号。官方用户换码使用明确 mock，未写生产玩家或成绩。
- 初次执行完整身份测试集有 75 项通过、1 项失败：既有卡丁车测试直接删除 `player_game_access`，超出 runtime_app 权限。随后单独执行本次 Night 范围通过；未放宽数据库权限。
- Creator 3.8.8 已生成匹配源码的 Web-mobile 输出。Windows 原报告文件覆盖失败后保留原文件，使用同一实际 Creator 输出和其声明文件完成校验及 H5 打包，未替换引擎产物。
- 实际 H5 包在 Chromium 844×390 触屏环境的四场景通过：首次绑定及刷新后仅补传一次、换设备恢复、另一账号不上传旧日志、缺少 SDK 不请求新游客。页面 JavaScript 异常为 0；[结构化证据](taptap-login-2026-10-30/evidence.json)、[绑定后首页 QA](taptap-login-2026-10-30/bound-844.png)。SDK 与 HTTP 明确使用 fixture，未访问生产玩家接口。
- H5 源码指纹 `fb8666660f64fc19fce5087707923064bc8d4b0b44a4178ae4dfc85054af33f8`，包 SHA256 `bde52a7e6cd245e523c20db79c8320d1a7642efdadc0bd3eb6d2da7bde92542f`。

本机原始日志与包验收证据：`.scratch/night-tap-login-20261030/`。H5 包：`outputs/game-builds/20261029T181934128Z-3c5a1a/taptap-h5/night-overwatch-taptap-h5-ads-on-service-on.zip`。提交后的包记录源码提交 `2fe7cc78af7c5cbcd366b132c19a5ee18943e11a`，与浏览器验收包 SHA256 一致。构建器写入生成的包体报告使 manifest 标记 sourceDirty；运行源码指纹与包内容均一致。94 个实际包内文件的密钥扫描通过，原工作区预存报告已逐字恢复。

未上传 TapTap 包、未在真实 TapTap 宿主使用玩家新鲜 code 验收，未做实体手机、原生包或真实广告验证；未运行全仓候选校验。

## 服务器与提交

- 功能代码 `2fe7cc78af7c5cbcd366b132c19a5ee18943e11a` 已正常推送 `origin/dev`，部署使用该提交的独立干净检出。
- Runtime 发布 `2fe7cc78af7c-1793298307107-8044dc` 完成，伴随重建 Kart 容器但保持原镜像。健康与 HTTPS 通过，平台配置合并后已在新 Runtime 容器读回比对，保留其他已有应用配置；[部署回执](taptap-login-2026-10-30/backend-receipt.json)。
- 已创建数据库备份，未替换数据库或更改 schema，未做隔离恢复演练。独立检出的固定象棋子模块补齐后完成打包；依赖安装生成的无关文件已在该独立检出还原，不影响原工作区并行改动。
- [公网后验](taptap-login-2026-10-30/public-postflight.json)：health 200；正式与历史前缀均对无效 code 返回 401 / PLATFORM_LOGIN_FAILED，确认已识别 MiniApp 配置。没有建立生产玩家会话、绑定或成绩。
- [精确基线范围规划](taptap-login-2026-10-30/scope-plans.json)通过。代码提交的 [CI](https://github.com/coffeeeeffoc/small-games/actions/runs/40929836243) plan 和两平台 validation-tools、[Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/40929836429) changes/plan 已通过；记录时其余 Creator/完整流水线仍在运行，未声称最终 CI 或 Pages 部署完成。
