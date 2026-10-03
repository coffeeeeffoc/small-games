export function monitorPagesPage(page, baseUrl, failures, label = 'Pages') {
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
}
