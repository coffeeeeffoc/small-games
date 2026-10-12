import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { competitionConfigScript } from '../api-config.mjs';

test('deployment API defaults are safe and preserve host-injected configuration', () => {
  assert.equal(competitionConfigScript(''), '');
  const context = vm.createContext({});
  vm.runInContext(competitionConfigScript('https://games.example/api/competition/v1/'), context);
  assert.equal(context.__COMPETITION_CONFIG__.apiUrl, 'https://games.example/api/competition/v1');
  context.__COMPETITION_CONFIG__ = { apiUrl: '/api/competition/v1', platform: 'h5' };
  vm.runInContext(competitionConfigScript('https://games.example/api/competition/v1'), context);
  assert.equal(context.__COMPETITION_CONFIG__.apiUrl, '/api/competition/v1');
  assert.equal(context.__COMPETITION_CONFIG__.platform, 'h5');
  for (const value of [
    'javascript:alert(1)',
    'invalid',
    'https://secret:password@host/api',
    'https://host/api#fragment',
  ])
    assert.throws(() => competitionConfigScript(value), /HTTP/);
});
