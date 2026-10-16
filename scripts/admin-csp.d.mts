import type { IncomingMessage, ServerResponse } from 'node:http';
export const adminUiPaths: readonly string[];
export const adminBaseCsp: string;
export const adminTemplatePrefix: string;
export const adminNonceMetaMarkup: string;
export function checkedAdminNonce(value: unknown): string;
export function adminNonceCsp(nonce: string): string;
export function injectAdminTemplate(html: string): string;
export function renderAdminDocument(
  template: string,
  nonce?: string,
): { html: string; csp: string; nonce: string };
export function adminHtmlHeaders(response: ServerResponse, csp: string): void;
export function adminCspPlugin(): {
  name: string;
  configResolved(config: { command: string }): void;
  transformIndexHtml: { order: 'post'; handler(html: string): string };
  configurePreviewServer(server: {
    config: { root: string; build: { outDir: string } };
    middlewares: {
      use(
        handler: (
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void,
        ) => void | Promise<void>,
      ): void;
    };
  }): void;
};
