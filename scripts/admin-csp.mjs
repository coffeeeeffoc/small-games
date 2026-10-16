import assert from 'node:assert/strict';

import { randomBytes } from 'node:crypto';

import { readFile } from 'node:fs/promises';

import path from 'node:path';

export const adminUiPaths = Object.freeze([
  '/',
  '/login',
  '/forbidden',
  '/config',
  '/games',
  '/members',
  '/roles',
  '/audit',
]);

export const adminBaseCsp =
  "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'";

export const adminTemplatePrefix =
  "<!--{{- $sgNonce := randBytes 32 -}}{{- .RespHeader.Set \"Content-Security-Policy\" (printf \"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'nonce-%s'; img-src 'self' data:; connect-src 'self'\" $sgNonce) -}}-->";

export const adminNonceMetaMarkup = '<meta name="sg-csp-nonce" content="{{ $sgNonce }}">';

export function checkedAdminNonce(value) {
  assert(typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value), 'Invalid admin nonce');
  assert(
    Buffer.from(value, 'base64').length === 32 &&
      Buffer.from(value, 'base64').toString('base64') === value,
    'Invalid admin nonce',
  );
  return value;
}

export function adminNonceCsp(nonce) {
  return adminBaseCsp.replace(
    "style-src 'self'",
    `style-src 'self' 'nonce-${checkedAdminNonce(nonce)}'`,
  );
}

export function injectAdminTemplate(html) {
  assert(
    typeof html === 'string' && /^\s*<!doctype html>/i.test(html),
    'Expected a trusted HTML document',
  );
  assert(!html.includes('{{') && !html.includes('sg-csp-nonce'), 'Unexpected template content');
  assert(html.split('<head>').length === 2, 'Expected one document head');
  return `${adminTemplatePrefix}\n${html.replace('<head>', `<head>\n${adminNonceMetaMarkup}`)}`;
}

export function renderAdminDocument(template, nonce = randomBytes(32).toString('base64')) {
  checkedAdminNonce(nonce);
  assert(template.startsWith(`${adminTemplatePrefix}\n`), 'Unrecognized admin template');
  const html = template.slice(adminTemplatePrefix.length + 1);
  assert(html.split(adminNonceMetaMarkup).length === 2, 'Expected one nonce placeholder');
  const rendered =
    '<!---->\n' +
    html.replace(adminNonceMetaMarkup, `<meta name="sg-csp-nonce" content="${nonce}">`);
  assert(!rendered.includes('{{'), 'Unexpected template expression');
  return { html: rendered, csp: adminNonceCsp(nonce), nonce };
}

export function adminHtmlHeaders(response, csp) {
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

export function adminCspPlugin() {
  let build = false;
  return {
    name: 'small-games-admin-csp',
    configResolved(config) {
      build = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (build) return injectAdminTemplate(html);
        assert(!html.includes('sg-csp-nonce') && !html.includes('{{'), 'Unexpected dev template');
        return html.replace(
          '<head>',
          `<head>\n<meta name="sg-csp-nonce" content="${randomBytes(32).toString('base64')}">`,
        );
      },
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (request, response, next) => {
        adminHtmlHeaders(response, adminBaseCsp);
        let pathname;
        try {
          pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        } catch {
          response.statusCode = 400;
          response.end();
          return;
        }
        if (pathname === '/api' || pathname.startsWith('/api/')) {
          next();
          return;
        }
        const ui = adminUiPaths.includes(pathname);
        const asset =
          pathname === '/mark.svg' || /^\/assets\/[A-Za-z0-9._-]+\.(?:js|css)$/.test(pathname);
        if (!ui && !asset) {
          response.statusCode = 404;
          response.end();
          return;
        }
        if (!['GET', 'HEAD'].includes(request.method ?? '')) {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET, HEAD');
          response.end();
          return;
        }
        const directory = path.resolve(server.config.root, server.config.build.outDir);
        try {
          const body = await readFile(path.join(directory, ui ? 'index.html' : pathname.slice(1)));
          if (ui) {
            const document = renderAdminDocument(body.toString('utf8'));
            adminHtmlHeaders(response, document.csp);
            response.statusCode = pathname === '/forbidden' ? 403 : 200;
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(request.method === 'HEAD' ? undefined : document.html);
          } else {
            response.statusCode = 200;
            response.setHeader(
              'Content-Type',
              pathname.endsWith('.css')
                ? 'text/css'
                : pathname.endsWith('.js')
                  ? 'text/javascript'
                  : 'image/svg+xml',
            );
            response.end(request.method === 'HEAD' ? undefined : body);
          }
        } catch {
          response.statusCode = 503;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(request.method === 'HEAD' ? undefined : 'Admin document unavailable');
        }
      });
    },
  };
}
