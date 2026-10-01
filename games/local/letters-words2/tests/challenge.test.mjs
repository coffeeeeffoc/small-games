import assert from 'node:assert/strict';
import { collections, validDay, today, dailyIsland, seededRandom, parseChallenge, challengeUrl, miniIslands, miniIsland, miniUrl } from '../challenge.js';
import { createGame, findSpelling, selectTile, submitWord } from '../engine.js';

assert.equal(today(new Date('2026-10-01T15:59:59Z')), '2026-10-01');
assert.equal(today(new Date('2026-10-01T16:00:00Z')), '2026-10-02', 'all players get the same Beijing midnight rollover');
for (const day of ['2000-01-01', '2024-02-29', '2099-12-31']) assert.equal(validDay(day), true);
for (const day of ['1999-12-31', '2100-01-01', '2026-02-29', '2026-04-31', '2026-1-01', '<svg>']) assert.equal(validDay(day), false);
for (const query of ['?daily=2026-02-29', '?daily=2026-10-01&daily=2026-10-02', '?daily=2026-10-01&v=2', '?daily=2026-10-01&v=', '?daily=2026-10-01&v=1&v=1']) assert.equal(parseChallenge(query).error, true);
const themes = new Set();
for (let i = 1; i <= collections.length; i++) {
  const day = `2026-10-${String(i).padStart(2, '0')}`;
  const island = dailyIsland(day);
  assert.equal(island.entries.length, 6);
  themes.add(island.name.slice(13));
  assert.deepEqual(createGame(island.entries, seededRandom(`ciyu-v1:${day}:board`)), createGame(dailyIsland(day).entries, seededRandom(`ciyu-v1:${day}:board`)), 'fresh players start with identical clues, tiles and active word');
}
assert.equal(themes.size, collections.length, 'themes rotate across eight different topics');
const link = challengeUrl({ href: 'https://user:password@example.com/pages/word-island/index.html?token=private&answers=forest#secret' }, '2026-10-01');
assert.equal(link, 'https://example.com/pages/word-island/index.html?daily=2026-10-01&v=1');
assert.equal(parseChallenge(new URL(link).search).day, '2026-10-01');
assert.throws(() => challengeUrl({ href: 'file:///index.html' }, '2026-10-01'));
for (const island of miniIslands) {
  const entries = miniIsland(island.id).entries;
  assert.equal(entries.length, 3);
  const make = () => createGame(entries, seededRandom(`ciyu-mini-v1:${island.id}:board`));
  const game = make(); assert.deepEqual(game, make());
  assert.equal(new Set(entries.map(entry => entry.word)).size, 3);
  assert.equal(island.finds.length, 3);
  while (game.completed < 3) {
    const path = findSpelling(game, game.activeWordId); assert.ok(path, `${island.id} always offers a complete real spelling`);
    for (const id of path) assert.equal(selectTile(game, id).status, 'selected');
    assert.equal(submitWord(game, seededRandom(`ciyu-mini-v1:${island.id}:clear:${game.completed}`)).status, 'correct');
  }
  const url = miniUrl({ href: 'https://user:secret@example.test/sub/game?daily=2026-10-01&token=x#auth' }, island.id);
  assert.equal(url, `https://example.test/sub/game?mini=${island.id}&v=1`);
  assert.equal(parseChallenge(new URL(url).search).mini, island.id);
}
for (const query of ['?mini=unknown', '?mini=dawn&mini=shore', '?mini=orbit&v=2', '?mini=dawn&daily=2026-10-01', '?daily=2026-10-01&mini=shore']) assert.equal(parseChallenge(query).error, true);
console.log('Daily island: strict dates/parameters, Beijing rollover, eight themes, identical initial boards and sanitized public links passed.');
