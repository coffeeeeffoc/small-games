# Game Contract v1

Game Contract 是所有 Game、Shell 与测试共同依赖的最小 interface seam。以下类型表达语义方向；实施时由 `@coffeeeeffoc/game-contract` 提供经过 Zod 校验的 TypeScript 定义。

```ts
export interface GameManifest {
  gameId: string;
  version: string;
  gameContractVersion: 1;
  contentSchemaVersion: number;
  capabilities: readonly HostCapability[];
  loadModes: readonly ('in-process' | 'iframe' | 'bilibili-subpackage')[];
  entry: string;
  integrity: string;
}

export interface GameDefinition {
  readonly manifest: GameManifest;
  mount(target: HTMLElement, host: GameHost): Promise<GameInstance>;
}

export interface GameInstance {
  pause(): void;
  resume(): void;
  dispose(): Promise<void>;
}

export interface GameHost {
  readonly session: GameSessionContext;
  content: ContentPort;
  storage: StoragePort;
  ads: AdvertisingPort;
  telemetry: TelemetryPort;
  navigation: NavigationPort;
}
```

Game interface 不暴露 React 类型。React Game 的 adapter 在内部调用 `createRoot()`；Canvas、PixiJS 或 Phaser Game 可以实现相同 interface。

## 会话不变量

`GameSessionContext` 在一次 Game Session 中不可变，至少包含 `gameId`、Game Version、Release Channel、Ad Authority、session ID、locale 和已授予 capabilities。Game 必须优雅处理未授予的可选 capability。

## iframe 消息

```ts
type HostRequest = {
  kind: 'request';
  id: string;
  protocolVersion: 1;
  gameId: string;
  sessionId: string;
  method: string;
  params: unknown;
};

type HostResponse = {
  kind: 'response';
  id: string;
  result?: unknown;
  error?: HostError;
};

type HostEvent = {
  kind: 'event';
  name: string;
  payload: unknown;
};
```

Shell 只接受来自已创建 iframe 的 `WindowProxy` 和预期 Origin 的消息；所有 params 与结果均经过 schema 校验。标准错误覆盖 capability 缺失、请求超时、取消、无效输入、离线和暂时不可用。Game 永远拿不到后端 token 或底层 SDK 对象。

## 测试契约

每个 Game 必须通过同一套 contract tests：启动、暂停、恢复、释放、缺失可选 capability、本地存档失败、内容版本不兼容、广告不可用及重复挂载。每个 Host adapter 使用相同测试向量，保证进程内和 iframe 模式的可观察行为一致。
