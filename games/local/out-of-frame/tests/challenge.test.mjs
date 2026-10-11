import test from 'node:test';
import assert from 'node:assert/strict';
import { readChallenge } from '../challenge.mjs';
import { LEVELS } from '../levels.mjs';
test('public room challenge validates version, stable room and bounded target', () => {
 const query = `?challenge=frame-v1&level=${LEVELS[0].id}&targetMs=12000`;
 assert.deepEqual(readChallenge(query, LEVELS), {index:0,target:12000});
 for(const value of ['', '?challenge=frame-v9', '?challenge=frame-v1&level=missing']) assert.equal(readChallenge(value, LEVELS), null);
 for(const value of ['-1', 'Infinity', '3600001', 'abc']) assert.equal(readChallenge(query.replace('12000',value),LEVELS).target,null);
});
