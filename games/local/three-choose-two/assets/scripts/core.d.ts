declare module '*generated/engine.js' {
  export function createLevel(id?: number | object): any;
  export function createEndless(seed?: number | string, options?: object): any;
  export function place(state: any, slot: number, x: number, y: number): any;
  export function placeIssuedGroup(state: any, slot: number, x: number, y: number): any;
  export function undo(state: any): any;
  export function hasPlacement(state: any, slot?: number): boolean;
  export function previewPlacement(state: any, slot: number, x: number, y: number): any;
  export function finishEndless(state: any): any;
  export function continueLevel(state: any, id: string): any;
}
declare module '*generated/levels.js' {
  export const LEVELS: any[];
  export const CHAPTERS: any[];
  export function getLevel(id: number): any;
}
declare module '*generated/shapes.js' {
  export const SHAPE_BY_ID: Record<string, any>;
}
declare module '*generated/progress.js' {
  export function readProgress(storage: any): any;
  export function saveProgress(storage: any, progress: any): boolean;
  export function recordLevelResult(progress: any, state: any): any;
  export function recordEndlessResult(progress: any, state: any): any;
  export function isLevelUnlocked(progress: any, id: number): boolean;
  export function totalStars(progress: any): number;
  export function resumeState(progress: any): any;
  export function saveCurrentGame(progress: any, state: any): any;
}
declare module '*generated/developer.js' {
  export function createDeveloperAPI(options: any): any;
}
declare module '*generated/client.js' {
  export function createOnlineClient(): any;
}
declare module '*generated/rewards.js' {
  export function canResetOptions(state: any, online?: boolean): boolean;
  export function resetOptions(state: any, id: string): any;
  export function createRewardGate(options: any): {
    pending: boolean;
    cancel(): void;
    request(kind: string): Promise<{ status: string }>;
  };
}
