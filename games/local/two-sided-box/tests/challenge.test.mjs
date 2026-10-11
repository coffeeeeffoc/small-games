import test from 'node:test';
import assert from 'node:assert/strict';
import { readChallenge } from '../challenge.mjs';
import { LEVELS } from '../levels.mjs';
import { createState } from '../engine.mjs';
test('same-box challenge preserves both initial faces and rejects malformed pairs', () => {
 const query=`?challenge=box-v1&level=${LEVELS[0].id}&faces=front,back&targetMoves=3`;
 const value=readChallenge(query,LEVELS);
 assert.deepEqual(value,{index:0,target:3,faces:['front','back']});
 assert.deepEqual(createState(LEVELS[0],{initialFaces:value.faces}).revealedFaces,['front','back']);
 for(const faces of ['front,front','front,invalid','front','front,back,top','']) assert.equal(readChallenge(query.replace('front,back',faces),LEVELS),null);
 assert.equal(readChallenge(query.replace('targetMoves=3','targetMoves=-1'),LEVELS).target,null);
});
