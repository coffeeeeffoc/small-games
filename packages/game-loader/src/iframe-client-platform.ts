import type { HostMessage } from '@coffeeeeffoc/game-contract';

/** Child-frame primitives used by the remote bridge and its protocol tests. */
export interface IframeClientPlatform {
  readonly parent: WindowProxy;
  readonly target: HTMLElement;
  listen(listener: (event: MessageEvent<unknown>) => void): () => void;
  post(message: HostMessage, targetOrigin: string): void;
}

export function browserClientPlatform(): IframeClientPlatform {
  return {
    parent: window.parent,
    target: document.body,
    listen(listener) {
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    },
    post(message, targetOrigin) {
      window.parent.postMessage(message, targetOrigin);
    },
  };
}
