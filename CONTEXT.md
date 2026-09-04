# 小游戏创作与运行平台

一个用于创作、配置、组合、运行和独立发布多个轻量小游戏的平台。平台同时服务于玩家、游戏开发者和内部运营人员。

## 游戏与运行

**Game（游戏）**:
可独立运行和发布、也可被 Shell 承载的完整小游戏产品。Game 不直接依赖具体平台能力。
_Avoid_: 子游戏、游戏组件

**Shell（基座）**:
承载一个或多个 Game，并提供导航、平台接入和运行环境的应用产品。
_Avoid_: 套壳、主应用

**Game Host（游戏宿主）**:
Game 获取存档、广告、身份、遥测和导航等宿主能力的统一契约。
_Avoid_: 平台 SDK、全局对象

**Standalone Mode（独立模式）**:
Game 使用自身轻量 Shell 和本地 Game Host 独立运行的形态。
_Avoid_: 裸游戏

**Embedded Mode（嵌入模式）**:
Game 由聚合 Shell 承载，并使用 Shell 提供的 Game Host 运行的形态。
_Avoid_: 套壳模式

**Game Artifact（游戏制品）**:
某个 Game Version 完成构建和验证后形成的不可变、可部署内容。
_Avoid_: 游戏包、构建目录

**Game Version（游戏版本）**:
一个可被 Shell 固定、灰度、回滚或提升为最新版本的已发布 Game 身份。
_Avoid_: 最新代码、当前游戏

**Release Channel（发布通道）**:
指向某个 Game Version 的可移动发布目标，目前包括 development、canary 和 stable。
_Avoid_: 环境、分支

**Game Catalog（游戏目录）**:
Shell 可以发现的 Game、可用版本、装载方式和运行要求的发布清单。
_Avoid_: 游戏列表、路由配置

## 内容与广告

**Reward Opportunity（奖励机会）**:
Game 在明确的玩家动机节点提出的可选奖励请求，由广告运行能力决定是否以及如何满足。
_Avoid_: 广告按钮、广告点位

**Host Ad（宿主广告）**:
由当前 Game Host 所属渠道选择、加载和校验的广告；游戏和运营人员不能指定其广告内容。
_Avoid_: 平台广告、SDK 广告

**Managed Ad（运营广告）**:
由运营配置选择素材与投放规则、再通过当前 Game Host 展示的广告。
_Avoid_: 自有广告、后管广告

**Ad Authority（广告控制权）**:
Game Host 声明本次运行由宿主渠道还是运营配置决定广告来源与规则的不可变运行属性。
_Avoid_: 广告开关、广告类型

**Game Session（游戏会话）**:
玩家从启动到退出某个 Game 的一次连续运行；其 Game Version、Release Channel 和 Ad Authority 在期间保持不变。
_Avoid_: 对局、登录会话

**Dynamic Content（动态内容）**:
经过结构校验后可以不重新编译 Game 而发布和生效的关卡、事件、数值或文案。
_Avoid_: 配置代码

**Source Extension（源码扩展）**:
由 AI 或开发者产生、必须进入真实代码仓库并经过本地编译部署才能生效的代码变更。
_Avoid_: 动态代码、在线脚本

## 创作与运维

**Creator Studio（创作后管）**:
内部运营人员创建、编辑、验证和发布 Dynamic Content 或 Source Extension 的工作空间。
_Avoid_: AI 后台、管理页

**Repository Bridge（仓库桥接器）**:
Creator Studio 在本地开发模式下通过仅监听本机的 Workspace Agent 读取、编辑、验证和提交工作区源码变更的受控能力。
_Avoid_: 文件服务、代码后端

**Workspace Agent（工作区代理）**:
运行在开发者电脑上、仅接受本机连接并实现 Repository Bridge 的工具进程；它不是线上业务后端。
_Avoid_: 第三个后端、远程执行器

**Management Service（管理服务）**:
支撑 Creator Studio 的项目目录、内容草稿、验证、发布记录和 AI 创作任务的后端产品。
_Avoid_: 后管后端

**Game Runtime Service（游戏运行服务）**:
面向已发布 Game 提供远程配置、云存档、排行榜和运行遥测的后端产品；Game 在没有它时仍可本地运行。
_Avoid_: 游戏后端、统一后端
