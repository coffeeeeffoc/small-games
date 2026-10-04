import test from 'node:test';
import assert from 'node:assert/strict';
import { FACES, createFaceAccess, faceById, hiddenFaces, revealFace } from '../faces.mjs';

test('every pair of distinct faces can be the two initial windows', () => {
  const pairs = new Set();
  for (let first = 0; first < 6; first += 1) {
    for (let second = 0; second < 5; second += 1) {
      const samples = [(first + 0.5) / 6, (second + 0.5) / 5];
      const access = createFaceAccess(() => samples.shift());
      assert.equal(access.visibleFaces.length, 2);
      assert.equal(new Set(access.visibleFaces).size, 2);
      assert.ok(access.visibleFaces.every((id) => faceById(id)));
      pairs.add([...access.visibleFaces].sort().join(','));
    }
  }
  assert.equal(pairs.size, 15);
});

test('constant random samples still produce two distinct known windows', () => {
  assert.deepEqual(createFaceAccess(() => 0).visibleFaces, ['front', 'back']);
  assert.deepEqual(createFaceAccess(() => 0.99999).visibleFaces, ['bottom', 'top']);
});

test('free reveals expose the front and back controls before remaining observations', () => {
  let access = { visibleFaces: ['left', 'top'] };
  access = revealFace(access);
  assert.deepEqual(access.visibleFaces, ['left', 'top', 'front']);
  access = revealFace(access);
  assert.deepEqual(access.visibleFaces, ['left', 'top', 'front', 'back']);
});

test('a requested hidden face opens exactly once without changing the previous access', () => {
  const access = createFaceAccess(() => 0);
  const next = revealFace(access, 'bottom');
  assert.deepEqual(access.visibleFaces, ['front', 'back']);
  assert.deepEqual(next.visibleFaces, ['front', 'back', 'bottom']);
  assert.notEqual(next.visibleFaces, access.visibleFaces);
  assert.deepEqual(revealFace(next, 'bottom').visibleFaces, ['front', 'back', 'bottom', 'left']);
  assert.deepEqual(revealFace(access, 'unknown').visibleFaces, ['front', 'back', 'left']);
});

test('all six faces can be revealed without duplicates and exhaustion is safe', () => {
  let access = createFaceAccess(() => 0.9);
  for (let count = 2; count < 6; count += 1) {
    assert.equal(hiddenFaces(access).length, 6 - count);
    access = revealFace(access);
    assert.equal(access.visibleFaces.length, count + 1);
    assert.equal(new Set(access.visibleFaces).size, count + 1);
  }
  assert.deepEqual(hiddenFaces(access), []);
  assert.equal(revealFace(access), access);
  assert.equal(revealFace(access, 'front'), access);
  assert.deepEqual([...access.visibleFaces].sort(), FACES.map((face) => face.id).sort());
  assert.equal(faceById('unknown'), null);
});
