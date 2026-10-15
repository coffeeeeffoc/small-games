export interface HostTouch {
  identifier?: number;
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}
export interface CanvasRuntimeOptions {
  sdk: any;
  start: (sdk: any) => any;
  createCanvas?: () => any;
  createImage?: () => any;
  getViewport?: () => any;
  maxDpr?: number;
  maxPixels?: number;
  maxUploadsPerSecond?: number;
  assetRoot?: string;
  mapAssetPath?: (path: string) => string;
  mainCanvas?: any;
  debug?: boolean;
}
export function createSdkOverlay(sdk: any, overrides: Record<string, any>): any;
export function mapAssetPath(path: string, root?: string): string;
export function normalizeViewport(info: any, maxDpr?: number, maxPixels?: number): any;
export function createCanvasRuntime(options: CanvasRuntimeOptions): {
  sdk: any;
  canvas: any;
  sourceCanvas: any;
  getViewport(): any;
  dispatchTouch(type: 'start' | 'move' | 'end' | 'cancel', touches: HostTouch[]): void;
  hide(): void;
  show(payload?: unknown): void;
  resize(): void;
  uploadFrame(
    now: number,
    upload: (source: any, size: { width: number; height: number }) => void,
  ): boolean;
  stop(): void;
  getDebugState?: () => any;
};
