# 管理配置中心发布与恢复

当前入口为 `pnpm deploy:admin`，只接受下列显式模式。所有模式均不读取本地 `.env.admin.local`，不传输 OAuth 字段，不生成或轮换数据库密码。已有私有配置通过 Compose `env_file` 的 `format: raw` 原样复用；程序只核对规范路径、属主、0700 目录、0600 普通文件、单硬链接和 stat 身份，不读取其内容。

| 模式                         | 用途                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--prepare-control`          | 纯本地构建 Runtime、Kart、Management 统一候选镜像的源码包及 admin-web；不加载 SSH 配置、不查询远端、不读取 OAuth。 |
| `--adopt-control=<bundle>`   | 经另行明确批准后的首次维护采用；参数为 `outputs/admin-deploy/` 下准备好的目录名。                                  |
| `--recover-control=<bundle>` | 用当前审阅 runner 恢复该历史候选的未完成 journal；历史 release 只作为数据，不执行其中的 Python。                   |
| `--reuse-remote-config`      | schema2 已采用后的普通 Management 更新，显式保留 `ADMIN_CONTROL_ENABLED=true`。                                    |
| `--rollback`                 | 由当前审阅 runner 回退到已证明兼容 schema2 的上一 Management 镜像；不恢复数据库。                                  |

无参数、`--execute` 和 `--provision-only` 在读取配置前返回 `CONTROL_MODE_REQUIRED`。旧 `deploy.py`、001 迁移及历史 v1 manifest 保留用于审计和读取历史状态，不能从新入口触发旧安装、权限回退或重发 001。

## 准确候选与公共制品

执行端必须使用正常 hooks 推送并经过相应 CI 的准确候选；执行前后要求本地 HEAD、干净工作树及实时 origin/dev 一致。prepare 仅核对本地候选，清单如实记录 `qualityChecks: not-run`，不能冒充 push/CI 验证。恢复和回滚校验的是当前 runner 候选 SHA；receipt 分别记录 `runnerSourceSHA` 与实际应用目标 `sourceSHA`。

v2 包精确绑定 002、`control-database.py`、三段 `control-fingerprint.sql`、当前 coordinator、共享 image-authority、原 Compose 上下文工具及 nonce-v1 CSP 合同。缺少任何真实数据库 helper 必须在构建或维护前失败，不能使用可执行占位。公开目录的实际文件必须恰好等于 manifest 列表及 manifest 本身，拒绝链接、未知文件和秘密扩展；tar 使用固定文件清单，上传前逐条比对归档实际文件与哈希。receipt、归档及文件清单保存在包目录之外。

Runtime/Kart/Management 统一 image 使用三个固定启动命令，不创建 PG、Studio、新服务、端口或网络。所有能力探针均复用 `infra/deployment/image-authority.py`，实际导入运行时模块验证协议；Management 的 `rbac-protocol` 同时被配置解析与每请求 DB 成员重查使用。manifest 中自报数字不能替代实际镜像能力。

## 首次采用的维护屏障

首次采用允许现役旧镜像没有控制协议，但兼容三服务候选必须先构建并通过真实模块能力探针，然后才能停精确现役 Nginx ID。Nginx 必须采用 `unless-stopped`，无自动开门或超时放行。停止 Nginx 会关闭现存 WebSocket，并使受控 API、管理 API 和 Nginx 承载的旧游戏静态路由暂时不可用；Caddy 直接挂载的 admin HTML/assets 与官网仍可能打开。未知旁路必须在执行前核实并阻断，不能把入口关闭等同于全部页面下线。

屏障后再次核对公共房间、ranked-run、三选二及 Kart 无活动游戏，再按 Management→Kart→Runtime 停止同一批 writer；只读确认未知 DB 客户端为 0。Street admission-v1 的持久票据不按活动对局阻塞，仍受完整数据保护。迁移调用前的活动变化、停止失败或可恢复中断，只能在 DB 仍无 schema2、原精确 ID/边界/上下文未变且新服务未激活时恢复实际记录停止的旧容器及同一 Nginx。

domain helper 负责私有备份、完整隔离恢复及旧行/schema/owner/成员/ACL 对比；只有它的已证明 `not_committed` 才允许迁移调用后的旧态恢复。COMMIT、unknown 或无法读 DB 时保持 Nginx 关闭，禁止启动旧 guardless 镜像。数据库结果不能从缺失响应推断。

COMMIT 后按 Runtime→Kart→Management 启动，Kart 绑定新 Runtime namespace；三个服务内部健康、完整只读 DB 合同、网络/挂载/端口边界及受保护容器/指针均通过后，才开启同一 Nginx。最终 HTTPS 探针失败立即重闭入口并保留私有 journal/备份，首次采用可能延长维护。

## 崩溃恢复与普通回退

coordinator 在迁移调用前持久化固定 precommit 路径。domain 在 COMMIT 前以 O_EXCL 写入 root 0600 的 `control-precommit.json` 与 SHA256 文件，目录 0700、单链接并 fsync。该证明绑定 release、source、002 artifact、旧态/备份哈希和预期 DB 合同；coordinator 返回前崩溃仍可由当前 runner 读取固定 pair，并先把可信哈希持久化 journal 再行动。

recover 重查精确 Nginx stopped、PG 身份、未变的不透明 env、原 Compose 上下文、候选镜像能力及预期合同，不从 live 重建 baseline，不重跑迁移。缺失/不匹配的 pair、未知 DB 结果或不兼容镜像保持闭锁并需人工审阅。恢复目标是原已审候选；替换故障候选镜像的 fix-forward 需独立审阅，不能暗换目标。未实测 Docker daemon 重启后的屏障持久性；恢复前始终再次确认精确 Nginx 已停止。

普通更新及回滚在停服务前要求 schema2、可信 control proof、现役三服务实际能力和显式控制 flag；回退目标必须同样兼容。历史 release 只提供 image/env/site 数据，执行逻辑始终来自当前 reviewed runner。失败恢复两个原管理指针，保留控制 flag，不回滚 Runtime、Caddy 或 DB。

## HTTPS、nonce 与 GitHub 边界

唯一管理站点为 `https://admin.nenggongzhiren.cn`，唯一 callback 为 `https://admin.nenggongzhiren.cn/api/auth/github/callback`。nonce-v1 逐页核对受信模板、Caddy 的 `<!---->\n` 前缀、canonical 32-byte Base64 nonce、精确 CSP 和 no-store；缺 CSP 不得降级静态验证。历史 v1 仅接受明确无模板的静态 HTML 合同。

公共探针仅验证页面、匿名 `/api/session` 401 和 GitHub 起始 302 的公共结构，不跟随授权、不输出 client ID/state/challenge/cookie/完整 Location，不读取旧 OAuth 值。receipt 固定 `realGithubLoginVerified=false`。真实 GitHub 登录仍由用户亲自执行。

用户创建 OAuth App 可参考 [GitHub 官方创建说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)，只需 [user:email](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)；平台支持多个 callback，本项目只用上述唯一入口且 callback 不使用通配符。无需 repo 权限或 GitHub 密码。真实秘密不应进入聊天、Issue、Git、日志、前端或公开制品。

## 代理单独交付

`pnpm deploy:caddy --proxy-only`（也可与 `--prepare` 合用）要求已有 managed ingress，继续保留 source guard、归档哈希、真实配置语法/健康/受保护状态及回滚检查，只跳过最后的 `backupInstall`，不重装既有 systemd 备份服务。远端 `backup.py --preflight` 仍强制执行，会创建/处理私有备份并沿用现有 30 天轮换策略。执行前维护者须核实现有备份目录 0700、timer 健康；不符时停止，不能自动修权限、端口、网络或 CORS。

本轮只验源码/mock/管理单测，不表示统一镜像、真实 DB002、代理切换、首次维护、daemon 重启、生产 OAuth 已验收。缺 domain helper 时本地准备也明确阻塞；后续独立受控集成通过并获部署批准后方可生产执行。
