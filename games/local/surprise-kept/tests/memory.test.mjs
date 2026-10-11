import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createState, applyAction } from '../src/core/engine.js';
import { missedMemories } from '../src/core/memory.js';
const { levels } = JSON.parse(await readFile(new URL('../content/chapters/birthday.json', import.meta.url)));
test('memory explanation traces only missed moves after this item was last witnessed', () => {
  const level=levels[2]; let state=createState(level);
  for(const action of [{type:'leave',character:'blue'},{type:'move',item:'gift',to:'blue'},{type:'return',character:'blue'}]) {const result=applyAction(level,state,action);assert.equal(result.ok,true);state=result.state;}
  assert.deepEqual(missedMemories(state,'blue','gift'),[{step:2,to:'blue',reason:'away'}]);
  assert.deepEqual(missedMemories(state,'orange','gift'),[]);
  const previous=state;
  state=applyAction(level,state,{type:'move',item:'gift',to:'green'}).state;
  assert.deepEqual(missedMemories(state,'blue','gift'),[],'seeing a later move resolves the stale explanation');
  assert.equal(missedMemories(previous,'blue','gift').length,1,'undo snapshot retains its cause');
});
