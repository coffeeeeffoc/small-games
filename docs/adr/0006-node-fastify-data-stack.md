# 两个线上服务统一使用 Node.js 技术栈

Management Service 与 Game Runtime Service 均使用 Node.js、TypeScript、Fastify、Zod 和 Drizzle ORM，并共享 PostgreSQL 基础设施。该选择优先利用现有 TypeScript 能力、复用 schema，并让 Management Service 自然调用 TypeScript AST 与本地构建工具；只有实际性能或组织需求出现后才考虑将运行服务迁移到 Java。
