import assert from 'node:assert/strict';
import test from 'node:test';
import { MultiplayerClient } from '../assets/scripts/MultiplayerClient.ts';
import { multiplayerVersion } from '../assets/scripts/MultiplayerProtocol.ts';
import { readSelection } from '../assets/scripts/Selection.ts';

test('a mini-game socket error without onclose releases the connection and allows retry', (t) => {
  const sockets: any[] = [];
  t.mock.method(globalThis, 'WebSocket', function () {
    const socket = { close: t.mock.fn(), send: t.mock.fn() };
    sockets.push(socket);
    return socket;
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const client = new MultiplayerClient('wss://example.com/kart');
  const command = {
    type: 'create' as const, version: multiplayerVersion, name: '车手',
    ...readSelection(null), bots: 0,
  };
  client.connect(command);
  sockets[0].onerror(new Error('connectSocket:fail url not in domain list'));
  assert.equal(client.connecting, false);
  assert.equal(client.connected, false);
  assert.match(client.status, /合法域名/);
  t.mock.timers.tick(8000);
  assert.equal(sockets[0].close.mock.callCount(), 0, 'do not close a rejected native socket task');
  client.connect(command);
  assert.equal(sockets.length, 2, 'another tap starts a new connection');
  sockets[0].onclose({ code: 1006 });
  assert.equal(client.connecting, true, 'late events cannot change the new attempt');
  t.mock.timers.tick(8000);
  assert.equal(client.connecting, false, 'timeout also works without a native close callback');
  assert.match(client.status, /超时/);
  client.connect(command);
  assert.equal(sockets.length, 3);
  client.leave();
});
