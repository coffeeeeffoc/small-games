// Manual balance evidence; kept separate from the fast unit suite.
if (!process.argv.includes('--campaign') && !process.argv.includes('--endless'))
  process.argv.push('--campaign', '--endless');
await import('./assess-v3.mjs');
