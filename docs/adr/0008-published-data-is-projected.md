# 已发布数据投影到 Runtime 所有的数据模型

Management Service 不允许 Runtime Service 直接读取其草稿与发布表；发布操作通过 transactional outbox 将 Game Catalog 和已发布配置投影到 Runtime schema。虽然两个服务首期共享 PostgreSQL 实例，这一取舍保留清晰的数据所有权、可靠发布和未来拆分数据库的能力，代价是接受短暂的最终一致性。
