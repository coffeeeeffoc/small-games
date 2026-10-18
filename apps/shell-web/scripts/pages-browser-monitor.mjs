export async function monitorPagesPage(page, baseUrl, failures, label = 'Pages') {
  const record = (message) => failures.push(`${label}: ${message}`);
  page.on('pageerror', (error) => record(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    // Chromium's implicit /favicon.ico request is outside the deployed Pages prefix.
    // Keep script console errors, including external scripts; scoped network checks below own resources.
    if (
      /^Failed to load resource:/.test(message.text()) &&
      location.url &&
      !location.url.startsWith(baseUrl)
    )
      return;
    const source = location.url
      ? ` (${location.url}:${location.lineNumber + 1}:${location.columnNumber + 1})`
      : '';
    record(`console: ${message.text()}${source}`);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === '43002')
      record(`requested a local Runtime: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.url().startsWith(baseUrl) && response.status() >= 400)
      record(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText ?? 'request failed';
    if (request.url().startsWith(baseUrl) && !error.includes('ERR_ABORTED'))
      record(`${error} ${request.url()}`);
  });
  // Local artifact checks exercise offline fallback; the production H5 suite tests the real API.
  if (['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname))
    await page.route('https://api.nenggongzhiren.cn/small-games/v1/**', (route) =>
      route.fulfill({
        status: route.request().method() === 'OPTIONS' ? 204 : 503,
        headers: {
          'access-control-allow-origin': new URL(baseUrl).origin,
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'authorization,content-type',
          'content-type': 'application/json',
        },
        body: route.request().method() === 'OPTIONS' ? '' : '{"error":"SERVICE_UNAVAILABLE"}',
      }),
    );
}
