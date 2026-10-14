export function createBrowserSdk(options: {
  game: string;
  window?: Window & typeof globalThis;
}): any;
