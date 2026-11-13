# 夜航运行规则兼容提示验收

2026-11-13：真实Caddy提供最终admin-web构建，登录/配置/运行报告使用明确的HTTP fixture。1360、390、320宽度下验证运行规则表、客户端及兼容服务标记、推荐版本告警、导入表单内容在刷新后保持、刷新没有发布写入、读取失败、过期及其他实例覆盖不足。普通配置、权限、CAS、撤权、CSP及未保存编辑完整浏览器套件此前通过；最终改动另外执行夜航运营四组定向检查。

最终源码摘要与测试时间见[回执](receipt.json)。[桌面截图](night-rule-mismatch-1360.png)、[390截图](night-rule-mismatch-390.png)、[320截图](night-rule-mismatch-320.png)中的规则是fixture标识，不是线上数据。数字高低另由单元测试覆盖v18/v17及v10/v9；保留旧规则兼容、不同系列不可排序、停止准入/退役不告警均有断言。

本地真实Runtime与Management已更新并验证内部报告、公开路由拒绝及后管代理匿名拒绝，见[实际部署证据](../../../../games/local/night-overwatch/docs/design/2026-11-13-social-windows/runtime-compatibility.json)。工具初始化失败，未接管真实已登录浏览器；没有发布配置、改推荐版本或替换渠道客户端。
