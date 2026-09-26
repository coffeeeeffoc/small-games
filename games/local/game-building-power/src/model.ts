export type DeviceId =
  | 'phone'
  | 'computer'
  | 'rice'
  | 'ac'
  | 'fan'
  | 'tv'
  | 'microwave'
  | 'blanket'
  | 'washer'
  | 'heater'
  | 'street'
  | 'garage';
export type Source = 'grid' | 'solar';

export interface Device {
  id: DeviceId;
  name: string;
  power: number;
  startupPower: number;
  startupSeconds: number;
  duration: number;
  deadline: number;
  deferrable: boolean;
}

/** All times are seconds; deadlines are absolute simulation times. */
export interface RequestSpec {
  id: string;
  resident: number;
  device: DeviceId;
  arrives: number;
  deadline: number;
  deferrable?: boolean;
  required?: boolean;
}

export type RequestStatus =
  | 'future'
  | 'waiting'
  | 'starting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'missed';

export interface Request extends RequestSpec {
  progress: number;
  source: Source | null;
  startupRemaining: number;
  status: RequestStatus;
  deferred: boolean;
  interruptions: number;
}

export type Action =
  | { type: 'connect'; requestId: string; source: Source; fromRequestId?: string }
  | { type: 'disconnect'; requestId: string }
  | { type: 'defer'; requestId: string }
  | { type: 'cooling'; requestId: string }
  | { type: 'battery' };

export interface TimedAction {
  tick: number;
  action: Action;
}

export interface Level {
  id: number;
  version: number;
  seed: number;
  gridLimit: number;
  name: string;
  scene: string;
  description: string;
  duration: number;
  target: number;
  requests: RequestSpec[];
  /** The last event at or before time wins; before the first event output is zero. */
  solar: { time: number; output: number; temperature: number; weather: string }[];
  notices: { time: number; text: string }[];
  battery: boolean;
  quality: { maxOverloadSeconds: number; maxInterruptions: number };
  /** Executable, deterministic witness using only the level's free resources. */
  solution: TimedAction[];
}

export type Result = 'playing' | 'won' | 'tripped' | 'failed';

export interface State {
  time: number;
  tick: number;
  level: Level;
  /** Includes scheduled requests. Views should hide status === 'future'. */
  requests: Request[];
  load: number;
  demand: number;
  capacity: number;
  temperature: number;
  weather: string;
  heat: number;
  completed: number;
  missed: number;
  result: Result;
  overloadSeconds: number;
  interruptions: number;
  defersLeft: number;
  batteryRemaining: number;
  batteryUsed: boolean;
  assisted: boolean;
  solarOutput: number;
  notices: string[];
  /** Accepted actions only; rescue is recorded separately for faithful replay. */
  log: { tick: number; action: Action | { type: 'rescue' } }[];
}

export interface Summary {
  result: Result;
  stars: number;
  score: number;
  completed: number;
  total: number;
  target: number;
  missed: number;
  uninterrupted: number;
  overloadSeconds: number;
  interruptions: number;
  assisted: boolean;
  standard: boolean;
}
