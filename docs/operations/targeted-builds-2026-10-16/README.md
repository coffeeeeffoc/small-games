# 按目标构建与部署

## 后台与官网

- `pnpm deploy:admin`：仅编译管理 API 的运行依赖、cultivation 内容导出及管理前端，发布管理包。用户本人执行以读取本机已忽略的 `.env.admin.local`。默认命令不执行旧基线候选验证或游戏检查。
- `pnpm deploy:company`：仅构建、打包、发布官网，保留 SSH/DNS、ICP备案、制品摘要、HTTPS 对应和静态版本回滚，不重启入口或游戏。
- 维护者一次执行 `pnpm deploy:caddy`，准备后台公开父目录的同路径只读挂载；尚未启用管理版本时，继续显示原登录页。沿用当前入口和完整保护事务，不增加端口、网络或 API。

正常 git push hooks、准确候选分类和 CI 保持启用。部署命令中的 `quality_checks=not-run` 只描述该命令没有重复运行质量检查，不表示候选免验。

## 失败诊断与验证

用户于 2026-10-16 运行的 `f07fff6b9671-1792159182417-548f2d` 以 `SSH_FAILED` / 1 结束。只读检查确认管理镜像已构建，管理容器未保留，原静态、后端、官网及入口指针未改变，PG/Runtime/Kart/Nginx/Caddy 健康，备份回执及私有配置已存在，无隔离恢复容器残留。该结果不表示没有远端变更：上传包、保护回执和私有配置保留。

在无网络、无凭据、只读临时容器中，以镜像默认 node 用户读取 `/app/package.json` 与管理入口均得到 `EACCES`。Docker COPY 现明确归属 node，兼容上传包的私有源权限。助手没有读取或重试用户的 OAuth 配置。

新增进度只输出固定阶段、等待耗时、退出码及错误类别，不转发原始远端 stderr。命令超时终止自己创建的子树；不能把 SSH 断线视为远端回滚完成，应另行只读核实。

相关本地契约 133 项通过，另有修正后的后台 9 项通过，包含忽略 SIGTERM 的超时负例；正常提交推送继续运行最终候选门禁。现有缓存 Caddy 镜像隔离实测通过旧页面 fallback、同路径绝对指针发布新 UI、删除指针恢复 fallback。该实测无生产网络、宿主端口或凭据，不是 GitHub 真实登录验收。

公开辅助证据见本目录 JSON。线上部署结果随后单独记录，不将本地通过称为线上发布成功。

## 游戏构建：本地配置，不发布

2026-10-19 起，日常入口仍为 `pnpm build:games`，使用随 Git 管理、带详细注释的 `game-build.local.mjs`（字段模板 `infra/builds/games.example.mjs`）；本机修改试打通过后提交配置，不合适则回退。版本 2 已支持 H5、TapTap 原生及现有 Cocos 渠道目标。新示例、AppID 配置、原始上传 ZIP 与开发者工程的区别见[统一游戏包构建](../game-builds.md)。以下版本 1 JSON 示例及产物规则保留兼容；默认 `.mjs` 不存在时才自动读取旧 `.json`，原有配置不会自动变成原生构建。

复制 `infra/builds/games.example.json` 为仓库根的 `game-build.local.json`；该本地文件被 Git 忽略。模板故意留空 `games`，必须明确选择后才能构建：

```json
{
  "version": 1,
  "games": ["cops-robbers", "cops-robbers-realtime", "xiangqi-five"],
  "ads": [false, true],
  "backend": [false, true],
  "apiUrl": "https://api.nenggongzhiren.cn/small-games/v1",
  "localBackend": false,
  "adUnits": {}
}
```

运行 `pnpm build:games`，也可 `pnpm build:games --config path.json`。每款选择的游戏构建广告×后端的笛卡尔积；例如上述配置为 12 个 TapTap H5 包。只支持这三款近期 H5 游戏，未知、空或重复选择拒绝；缺少配置不会默认全构建。

未提交源码可以构建。命令只编译、注入公开开关并打 ZIP，不运行质量测试、浏览器验收、CI、SSH、上传或部署，也不要求 clean tree。清单明确标记 `buildOnly: true`、`qualityChecks: "not-run"`；SHA 仅说明源码背景，脏状态及无法读取 Git 的情况另外记录，不能冒充已验收发布包。正常 git hooks/CI 仍独立运行。

每批同时保留两处产物：

- 根目录 `outputs/game-builds/<batch>/`：全部选中游戏的 ZIP、同名 JSON、解压目录及 `matrix.json`。
- 每款游戏的 `dist/h5-packages/<batch>/`：该款各变体的 ZIP、JSON 及解压目录。文件名含游戏、`taptap-h5`、`ads-on/off`、`service-on/off`。

不同时间批次不覆盖。编译器清空 `dist` 前按游戏临时移出历史包，完成或失败后恢复；旧 ZIP 不递归打入新包。中断恢复记录保存在 `outputs/.h5-package-recovery/`，下次构建先恢复已退出进程留下的暂存；仍有活跃构建或恢复状态冲突时拒绝覆盖。Windows 瞬时目录占用采用有界重试。根目录与游戏目录 ZIP 字节相同。游戏 `dist` 顶层仍为最后一次编译输出，交付使用带批次的包目录。

后端开时必须提供公开 HTTPS API；本地验证可将 `localBackend` 设为 true，使用已有本地 Runtime 的 loopback HTTP URL。后端关时包内 API URL 为空。URL 不允许用户信息、查询串或片段。广告单元 ID 可按游戏写入 `adUnits`，它是公开标识，禁止填凭据。广告开且缺 SDK、取消、失败或超时均不发奖励；构建成功不代表真实广告完成验收。

## 现有后端的定向更新

`pnpm deploy:backend --services=runtime` 仅更新明确选择的现有服务；多个可写 `--services=runtime,kart`。无默认全选；管理后台继续使用 `deploy:admin`。支持 `runtime`、`kart`、`tianxia`，未部署的服务会拒绝，不能用此命令首次创建。

- `--prepare`：仅构建所选服务及必要依赖，输出 `outputs/backend-deploy/<release>` 与 tar/摘要，不上传或激活。
- `--check`：只读核对现有容器、原始 Compose 文件顺序、工作目录、原 env-file 引用及配置哈希，不读取/显示凭据。
- `--rollback=<release>`：恢复该次事务的旧镜像；失败或受控中断会尝试恢复回滚前版本。

实际更新要求 clean tree 和当前 HEAD 等于远端 dev。只构建所选后端运行时依赖，保留原 Compose 上下文；不执行候选检查或额外游戏构建。Runtime 更新必须重建共享其网络 namespace 的既有 Kart，但保持 Kart 原镜像；Kart 单独更新不重启 Runtime。未知 namespace 或配置漂移在停止服务前拒绝。保持现有端口、挂载、网络集合，保护 PG、未选服务、公司站、管理后台、Nginx/Caddy 和所有原发布指针。

此命令不部署数据库、不运行迁移/DDL、不重建 PostgreSQL 或其卷。Runtime 更新会在服务器私有目录生成数据库备份并验证 TOC 可读性，比较 schema 与无密码角色摘要；它不是隔离完整恢复验证，回执明确 `isolatedRestoreVerified: false`。不会自动回灌数据库。已有数据库初始化/迁移仍走独立审核流程。Runtime/Kart 在停服前检查活动对局，备份后再次检查；Tianxia 当前没有等价活动对局计数，不声称其无人在线。

回执 `sourceSHA` 是本次事务候选，不能代表所有后端统一版本；`activeImages` 记录实际所选及同伴服务的不可变镜像 ID。每次更新、回滚使用部署锁和私有事务日志，错误输出仅为有限阶段及类别。超时/SSH 断开后应只读确认实际状态，不把客户端退出当成服务器已完成回退。

## 已发布第一阶段的实际证据

`91905bceb11abbfb77b10f138516942ff54e09a4` 已通过正常 hooks 推送 dev，精确候选 CI 与 Pages 均成功： [CI](https://github.com/coffeeeeffoc/small-games/actions/runs/38917469075)、[Pages](https://github.com/coffeeeeffoc/small-games/actions/runs/38917469041)。公司站版本 `20261016143927-91905bceb11a-b5b61a` 与一次性管理 UI 挂载准备 `20261016144010-91905bceb11a-5cbd45` 已实际部署。公开文件 11 项摘要匹配，三游戏 canonical/legacy metadata/leaderboard 共 12 次 GET 为 200，PG/Runtime/Kart 保持原容器。

新管理镜像已在无网络、无凭据的临时容器中验证 node UID 1000 可读入口；未由代理激活 OAuth，用户保留原 `.env.admin.local` 自行运行 `pnpm deploy:admin`，并完成真实 GitHub 登录。目录内公开 JSON 记录网站后验、镜像可读性与后端只读上下文检查；不含凭据或用户终端日志。

第二阶段实际运行了三个游戏的 12 个 H5 变体及紧接着的 Street 第二批 1 包；两处 ZIP 摘要、ZIP 文件清单和首批历史包保留均通过，见 `game-build-actual.json`。这些是未提交源码的构建演练，明确不是已验收发布包。相关 Node 范围/执行器测试 118 项通过；最后新增中断恢复与后台进度回归的串行测试 20 项通过，其中后端 Python 隔离 mock 8 项通过。实际新后端命令 `--check` 已只读通过现有 Runtime/Kart；新定向更新事务尚未在生产执行，不能将 mock 回退或 TOC 可读性称为生产回退/完整恢复验收。
