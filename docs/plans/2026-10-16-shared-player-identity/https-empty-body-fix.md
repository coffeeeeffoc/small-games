# HTTPS 入口首次激活及空正文验收修复

2026-10-16，候选 `da201f8371a39a51553db7a25216c5f6d87ac739` 的正常 pre-push、CI、Pages 和 Cocos workflow 均已成功。官网 PNG Logo 已独立上线，Runtime 及 013 增量迁移已在现有 PostgreSQL / 卷上完成保护发布；管理角色与 OAuth 凭据未创建。

入口事务 `20261016091904-da201f8371a3-d968a1` 激活后误触发回滚。私有事务记录为 `rolled-back`，`rollbackErrors=[]`，两层代理和旧指针均恢复。随后内部 Runtime/数据库健康为正常，卡丁车镜像及现有 PostgreSQL 保持不变，官网素材仍实际返回 200。此时 API/admin 子域 TLS 握手失败，不能称作公网入口完成。

具体原因已确定：`command()` 对 curl 输出执行 `strip()`，删除了 204、302、404 等无正文响应末尾的 HTTP 头空行；`response()` 因而把合法响应误判为 `Invalid HTTPS response`。真实 Runtime 请求投影显示，验收已完成第一前缀的 metadata、versus 榜、GET/POST 鉴权检查，最后一条为预检 OPTIONS **204**。只读配置及响应头投影确认 CORS 仍只允许 `http://localhost:8080`、`credentials=false`。对原始 204 响应通过真实解析链的本地复现得到同样错误。

修复只让响应解析保留原始命令输出，其他命令仍按原方式去除外围空白。新增测试覆盖 204/302/404 空正文、JSON/页面正文换行、缺失头终止符仍拒绝，以及失败命令 stderr 不泄漏。没有放宽 CORS、关闭断言、跳过事务或扩大网络权限。实际公网重试结果另行记录。

原始本地日志保留在 `.scratch/identity-caddy-production-rollout-da201f83.log`、`.scratch/identity-ingress-diagnosis-first.log`、`.scratch/identity-ingress-runtime-projection.log`、`.scratch/identity-ingress-cors-projection.log` 和 `.scratch/identity-public-status-after-ingress-rollback.log`。私有备份留在服务器，未上传数据库或 TLS 备份。
