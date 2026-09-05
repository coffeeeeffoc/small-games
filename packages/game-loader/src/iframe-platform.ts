import { HostError, type HostMessage } from '@coffeeeeffoc/game-contract';

/** Opaque iframe operations used by the loader and replaceable in integration tests. */
export interface IframePlatform {
  fetchArtifact(
    url: string,
    signal: AbortSignal,
  ): Promise<Readonly<{ body: ArrayBuffer; csp: string }>>;
  sha256(body: ArrayBuffer): Promise<string>;
  createFrame(
    target: HTMLElement,
    body: ArrayBuffer,
    csp: string,
  ): Readonly<{
    source: WindowProxy;
    post(message: HostMessage): void;
    remove(): void;
  }>;
  listen(listener: (event: MessageEvent<unknown>) => void): () => void;
}

/** Browser implementation that executes only verified bytes in a script-only sandbox. */
export class BrowserIframePlatform implements IframePlatform {
  /** Fetches an Artifact without credentials or redirect ambiguity. */
  async fetchArtifact(url: string, signal: AbortSignal) {
    const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal });
    if (!response.ok)
      throw new HostError({ code: 'UNAVAILABLE', message: 'Remote Game Artifact is unavailable' });
    const csp = response.headers.get('content-security-policy');
    if (!csp) throw new HostError({ code: 'INVALID_INPUT', message: 'Remote Game CSP is missing' });
    return { body: await response.arrayBuffer(), csp };
  }

  /** Calculates the Subresource Integrity representation for verified bytes. */
  async sha256(body: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', body);
    const binary = String.fromCharCode(...new Uint8Array(digest));
    return `sha256-${btoa(binary)}`;
  }

  /** Creates an opaque-origin iframe backed by the exact verified JavaScript buffer. */
  createFrame(target: HTMLElement, body: ArrayBuffer, csp: string) {
    const frame = document.createElement('iframe');
    let binary = '';
    for (const byte of new Uint8Array(body)) binary += String.fromCharCode(byte);
    const scriptUrl = `data:text/javascript;base64,${btoa(binary)}`;
    const documentPolicy = csp
      .split(';')
      .map((directive) => directive.trim())
      .filter((directive) => directive && !directive.startsWith('frame-ancestors'))
      .join('; ')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;');
    frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${documentPolicy}"><body><script type="module" src="${scriptUrl}"></script></body>`;
    frame.title = 'Remote Game';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', '');
    target.replaceChildren(frame);
    if (!frame.contentWindow)
      throw new HostError({ code: 'UNAVAILABLE', message: 'Remote Game iframe was not created' });
    return {
      source: frame.contentWindow,
      post: (message: HostMessage) => {
        // Initialization must also be delivered after the sandbox finishes loading its bundle.
        if (message.kind === 'event' && message.name === 'init')
          frame.addEventListener('load', () => frame.contentWindow?.postMessage(message, '*'), {
            once: true,
          });
        frame.contentWindow?.postMessage(message, '*');
      },
      remove: () => {
        frame.remove();
      },
    };
  }

  /** Subscribes to browser messages for source, origin, and schema validation. */
  listen(listener: (event: MessageEvent<unknown>) => void): () => void {
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }
}
