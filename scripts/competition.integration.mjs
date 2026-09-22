import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {sql} from 'drizzle-orm';
import {openDatabase} from '@coffeeeeffoc/service-kit';
import {createRuntimeService} from '../services/runtime-api/dist/app.js';
import {createCompetitionStore} from '../services/runtime-api/dist/competition/store.js';
import {solutions} from '../games/local/cops-robbers/src/solutions.js';
const databaseUrl=process.env.COMPETITION_TEST_DATABASE_URL;
if(!databaseUrl || new URL(databaseUrl).pathname!=='/competition_test')throw new Error('Use the isolated competition_test database');
const env={RUNTIME_DATABASE_URL:databaseUrl,COMPETITION_ENABLED:'true',COMPETITION_INTERNAL_KEY:'test-only-competition-internal-key-000000000'};
const database=openDatabase(databaseUrl,'runtime');
const store=createCompetitionStore(database.db,new Map());
let app=createRuntimeService(env,false),base;
const evidence={startedAt:new Date().toISOString(),database:'competition_test',checks:[]};
async function start(){await app.listen({host:'127.0.0.1',port:0});base=`http://127.0.0.1:${app.server.address().port}/api/competition/v1`;}
async function request(path,session,body,status=200){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(session?{authorization:'Bearer '+session.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(result)}`);return result;}
try {
  await start();
  await request('/me',null,undefined,401);
  const a=await request('/sessions/guest',null,{}),b=await request('/sessions/guest',null,{}),outsider=await request('/sessions/guest',null,{});
  assert.notEqual(a.playerId,b.playerId);assert.equal((await request('/me',a)).playerId,a.playerId);
  await request('/me',{token:'0'.repeat(64)},undefined,401);
  let room=await request('/rooms',a,{game:'cops-robbers'});
  await request('/rooms/join',b,{code:room.code,game:'letters-words2'},409);
  assert.equal((await request(`/rooms/${room.code}`,a)).players.length,1);
  await request('/rooms/join',a,{code:room.code});
  await request('/rooms/join',b,{code:room.code});
  await request('/rooms/join',outsider,{code:room.code},409);
  await request(`/rooms/${room.code}`,outsider,undefined,403);
  await request(`/rooms/${room.code}/ready`,a,{});
  room=await request(`/rooms/${room.code}/ready`,b,{});
  const startedAt=room.startedAt;assert.equal(room.status,'playing');
  assert.equal((await request(`/rooms/${room.code}/ready`,a,{})).startedAt,startedAt);
  await request(`/rooms/${room.code}/actions`,a,{seq:1,action:{type:'score',score:999999}},422);
  await request(`/rooms/${room.code}/actions`,a,{seq:1,action:{type:'move',cop:0,target:999}},422);
  // Make the initial legal run slower so the next real match can improve its server timing.
  await new Promise(resolve=>setTimeout(resolve,750));
  const last=[];
  for(const session of [a,b]) {
    let snapshot=await request(`/rooms/${room.code}`,session);
    for(const plan of solutions[17]) {
      const cop=Math.max(0,plan.findIndex((node,i)=>node!==snapshot.state.board.cops[i]));
      const body={seq:snapshot.seq+1,action:{type:'move',cop,target:plan[cop]}};
      snapshot=await request(`/rooms/${room.code}/actions`,session,body);last.push({session,body});
    }
  }
  const finalA=await request(`/rooms/${room.code}`,a),finalB=await request(`/rooms/${room.code}`,b);
  assert.equal(finalA.status,'finished');assert.deepEqual(finalA.results,finalB.results);
  await Promise.all(Array.from({length:4},()=>request(`/rooms/${room.code}/actions`,last.at(-1).session,last.at(-1).body)));
  const counts=await database.db.execute(sql`select count(*)::int as n from runtime.competition_results where match_id=${room.code}`);
  assert.equal(counts[0].n,2);
  evidence.checks.push('real HTTP two identities, join/full/membership, ready idempotence, illegal input, full solution, consistent settlement, duplicate submission once');
  const before=await request('/boards/cops-robbers',a);
  assert.equal(before.me.score,-13);assert(before.me.rank>=1);
  await app.close();app=createRuntimeService(env,false);await start();
  assert.deepEqual((await request('/boards/cops-robbers',a)).me,before.me);
  evidence.checks.push('service restart preserves session, results and personal best');
  async function replay(delayMs) {
    const previous=await request(`/rooms/${room.code}/rematch`,a,{});
    room=await request(`/rooms/${previous.rematch}`,a);
    await request('/rooms/join',b,{code:room.code,game:'cops-robbers'});
    await request(`/rooms/${room.code}/ready`,a,{});await request(`/rooms/${room.code}/ready`,b,{});
    if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs));
    for(const session of [a,b]) {
      let snapshot=await request(`/rooms/${room.code}`,session);
      for(const plan of solutions[17]) {
        const cop=plan.findIndex((node,i)=>node!==snapshot.state.board.cops[i]);
        snapshot=await request(`/rooms/${room.code}/actions`,session,{seq:snapshot.seq+1,action:{type:'move',cop,target:plan[cop]}});
      }
    }
    assert.equal((await request(`/rooms/${room.code}`,a)).status,'finished');
    return (await request('/boards/cops-robbers',a)).me;
  }
  const improved=await replay(0);
  assert.equal(improved.score,before.me.score);assert(improved.secondary<before.me.secondary,'faster legal rematch improves personal best');
  const slower=await replay(1000);
  assert.deepEqual(slower,improved,'slower legal rematch cannot replace the best');
  evidence.checks.push('same identities rematch: faster legal run improves best; slower legal run retains best');
  const board='test-'+randomUUID(),boardV2=board+'-v2',ids=Array.from({length:102},()=>randomUUID());
  assert.equal((await store.ranking(board,ids[0])).eligiblePlayers,0);
  await database.db.transaction(async tx=>{
    for(let i=0;i<ids.length;i++) {
      await tx.execute(sql`insert into runtime.competition_players(id,created_at) values(${ids[i]},${Date.now()})`);
      await tx.execute(sql`insert into runtime.competition_best values(${board},${ids[i]},${1000-i},${i===1?1:0},${'fixture-'+i},${Date.now()})`);
    }
  });
  const outside=await store.ranking(board,ids[100]);
  assert.equal((await store.ranking(board,ids[0])).gap,null);
  assert.equal(outside.top.length,100);assert.equal(outside.me.rank,101);assert.equal(outside.eligiblePlayers,102);
  assert.equal(outside.threshold.rank,100);assert.equal(outside.previous.rank,100);assert.equal(outside.gap.score,1);
  assert.equal((await store.ranking(boardV2,ids[100])).me,null);
  await database.db.execute(sql`update runtime.competition_best set score=1000,secondary=0 where board=${board} and player_id=${ids[1]}`);
  const tied=await store.ranking(board,ids[1]);assert.equal(tied.me.rank,1);assert.equal(tied.top[2].rank,3);
  assert.equal(tied.gap,null);
  assert.equal((await store.ranking(board,outsider.playerId)).reason,'尚无有效成绩');
  evidence.checks.push('102 isolated SQL fixtures: Top100 boundary, rank101, tied rank1/1/3, exact count, previous/gap, empty/no-score/version isolation');
  const created=await request('/rooms',a,{game:'cops-robbers'});
  await database.db.execute(sql`update runtime.competition_rooms set data=jsonb_set(data,'{deadline}',to_jsonb(${Date.now()-1}::bigint)) where code=${created.code}`);
  assert.equal((await request(`/rooms/${created.code}`,a)).status,'expired');
  await request('/rooms/join',b,{code:created.code},409);
  evidence.checks.push('expired invitations rejected');
  const measurements=[];for(let n=0;n<20;n++){const began=performance.now();await store.ranking(board,ids[100]);measurements.push(performance.now()-began);}
  measurements.sort((a,b)=>a-b);evidence.rankingLatencyMs={p50:measurements[10],p95:measurements[18],participants:102,requests:20};
  evidence.completedAt=new Date().toISOString();
  await mkdir(new URL('../.scratch/competition/',import.meta.url),{recursive:true});
  await writeFile(new URL('../.scratch/competition/integration.json',import.meta.url),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
}finally{await app.close();await database.close();}
