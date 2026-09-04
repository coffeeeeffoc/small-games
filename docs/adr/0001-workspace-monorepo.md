# 使用可抽离的 workspace monorepo

项目采用 pnpm workspace 和 Turborepo 管理多个独立 App、Game、后端与共享 Package；每个 Game 都能独立构建部署，同时只能通过公开 package interface 依赖平台能力。相比 Git submodule，这降低了跨仓库版本同步与 CI 成本，同时保留未来将 Game 抽离为独立 Git 仓库的能力。
