"""Hourly bounded ranked checkpoint retention. Import is inert; no credentials are read."""
import fcntl
import json
from pathlib import Path
import re
import signal
import subprocess

ROOT = Path('/opt/small-games')
BATCH = 100
MAX_BATCHES = 10
UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
GAMES = ('cage-rescue', 'tower-brake', 'night-overwatch', 'tetracube')
MODULE = 'file:///app/services/runtime-api/dist/competition/ranked-maintenance.js'
STOP_REQUESTED = False


def require(condition):
    if not condition:
        raise RuntimeError('RETENTION_CONTRACT')


def checked_rules(value):
    require(isinstance(value, dict) and set(value) == set(GAMES)
            and all(isinstance(version, str) and re.fullmatch(r'[A-Za-z0-9._:-]{1,100}', version)
                    for version in value.values()))
    return value


def command(*args, input=None):
    result = subprocess.run(args, input=input, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            check=False, timeout=120)
    require(not STOP_REQUESTED)  # Finish the in-flight container call before releasing deploy.lock.
    require(result.returncode == 0 and len(result.stdout) <= 1048576)
    return result.stdout.decode().strip()


def container(service):
    ids = command('docker', 'ps', '--all', '--quiet', '--no-trunc', '--filter',
                  'label=com.docker.compose.project=small-games', '--filter',
                  'label=com.docker.compose.service=' + service).splitlines()
    require(len(ids) == 1 and re.fullmatch(r'[a-f0-9]{64}', ids[0]))
    facts = json.loads(command('docker', 'inspect', '--format',
        '{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}}}', ids[0]))
    require(set(facts) == {'id', 'image', 'running'} and facts['id'] == ids[0]
            and facts['running'] is True and re.fullmatch(r'sha256:[a-f0-9]{64}', facts['image']))
    return facts


def psql(pg, query):
    return command('docker', 'exec', '-i', pg, 'psql', '-X', '-qAt', '-U', 'platform_owner',
                   '-d', 'small_games', '-v', 'ON_ERROR_STOP=1', input=query.encode())


def runtime(runtime_id, selected=None):
    # The in-container watchdog outlives a disconnected docker client and closes
    # its DB connection before the host command timeout/deployment lock can expire.
    script = ('const timer=setTimeout(()=>process.exit(75),60000);'
              'try{const m=await import(' + json.dumps(MODULE) + ');'
              + ('const chunks=[];for await(const c of process.stdin)chunks.push(c);'
                 'const result=await m.retireRankedRuns(JSON.parse(Buffer.concat(chunks)));'
                 if selected is not None else 'const result=await m.retentionContract();')
              + 'process.stdout.write(JSON.stringify(result));}catch{process.exitCode=1;}finally{clearTimeout(timer);}')
    return json.loads(command('docker', 'exec', '-i', runtime_id, 'node', '--input-type=module', '-e', script,
                             input=json.dumps(selected).encode() if selected is not None else None))


def selection_sql(rules, after=''):
    checked_rules(rules)
    require(after == '' or re.fullmatch('ranked-run:' + UUID, after))
    games = ','.join("'" + game + "'" for game in GAMES)
    versions = 'CASE data->>\'game\' ' + ' '.join("WHEN '"+game+"' THEN '"+version+"'" for game,version in rules.items()) + ' END'
    return """BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT coalesce(json_agg(json_build_object('id',data->>'id','game',data->>'game','playerId',data->>'playerId') ORDER BY id),'[]') FROM (
 SELECT id,data FROM runtime.competition_matches r
 WHERE id>'__AFTER__' AND id='ranked-run:'||(data->>'id') AND id ~ '^ranked-run:__UUID__$'
 AND data->>'kind'='ranked-run-v1' AND data->>'game' IN (__GAMES__)
 AND data->>'status' IN ('active','finished')
 AND jsonb_typeof(data->'seq')='number' AND data->>'seq' ~ '^(0|[1-9][0-9]{0,5})$'
 AND (least((data->>'expiresAt')::bigint,(data->>'createdAt')::bigint+86400000)<=(extract(epoch from now())*1000)::bigint
      OR data->>'version'<>__VERSIONS__)
 AND (data->'state' IS DISTINCT FROM 'null'::jsonb OR NOT (data ? 'retainedAt'))
 ORDER BY id LIMIT 100) selected;
COMMIT;""".replace('__AFTER__', after).replace('__UUID__', UUID).replace('__GAMES__', games).replace('__VERSIONS__', versions)


def compact_sql(item, rules):
    checked_rules(rules)
    require(set(item) == {'id', 'game', 'playerId'} and re.fullmatch(UUID, item['id'])
            and re.fullmatch(UUID, item['playerId']) and item['game'] in GAMES)
    # The root lock is also held by gameplay. Root compaction and exact child
    # deletion commit together, so interruption is safely repeatable.
    return """BEGIN;
SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='15s';
WITH target AS (
 SELECT id,board,data FROM runtime.competition_matches
 WHERE id='ranked-run:__ID__' AND data->>'id'='__ID__' AND data->>'playerId'='__OWNER__'
 AND data->>'game'='__GAME__' AND data->>'kind'='ranked-run-v1' AND data->>'status'='finished'
 AND jsonb_typeof(data->'seq')='number' AND data->>'seq' ~ '^(0|[1-9][0-9]{0,5})$'
 AND (least((data->>'expiresAt')::bigint,(data->>'createdAt')::bigint+86400000)<=(extract(epoch from now())*1000)::bigint
      OR data->>'version'<>'__VERSION__')
 FOR UPDATE
), removed AS (
 DELETE FROM runtime.competition_matches a USING target r
 WHERE a.board=r.board AND a.id = ANY(ARRAY(
   SELECT 'ranked-action:'||(r.data->>'id')||':'||sequence::text
   FROM generate_series(1,(r.data->>'seq')::integer) sequence)) RETURNING a.id
), compacted AS (
 UPDATE runtime.competition_matches r SET data=jsonb_set(jsonb_set(r.data,'{state}','null'::jsonb),'{expiresAt}',
 to_jsonb(least((r.data->>'expiresAt')::bigint,(r.data->>'createdAt')::bigint+86400000)))
 || jsonb_build_object('retainedAt',coalesce((r.data->>'retainedAt')::bigint,(extract(epoch from now())*1000)::bigint))
 FROM target t WHERE r.id=t.id RETURNING r.id
) SELECT json_build_object('runs',(SELECT count(*) FROM compacted),'actions',(SELECT count(*) FROM removed));
COMMIT;""".replace('__ID__', item['id']).replace('__OWNER__', item['playerId']).replace('__GAME__', item['game']).replace('__VERSION__', rules[item['game']])


def sweep():
    pg, live = container('postgres'), container('runtime')
    contract = runtime(live['id'])
    require(isinstance(contract, dict) and set(contract) == {'version', 'maxAgeMs', 'rules'}
            and type(contract['version']) is int and contract['version'] == 1
            and type(contract['maxAgeMs']) is int and contract['maxAgeMs'] == 86400000)
    rules = checked_rules(contract['rules'])
    totals = {'runs': 0, 'actions': 0, 'skipped': 0}
    after = ''
    for _ in range(MAX_BATCHES):
        selected = json.loads(psql(pg['id'], selection_sql(rules, after)))
        require(isinstance(selected, list) and len(selected) <= BATCH)
        if not selected:
            break
        for item in selected:
            compact_sql(item, rules)  # Validate IDs before passing them to the trusted module.
        require(len({item['id'] for item in selected}) == len(selected))
        result = runtime(live['id'], selected)
        require(isinstance(result, dict) and set(result) == {'ready', 'skipped'}
                and isinstance(result['ready'], list) and len(set(result['ready'])) == len(result['ready'])
                and set(result['ready']) <= {item['id'] for item in selected}
                and type(result['skipped']) is int and result['skipped'] == len(selected)-len(result['ready']))
        totals['skipped'] += result['skipped']
        for item in selected:
            if item['id'] not in result['ready']:
                continue
            counts = json.loads(psql(pg['id'], compact_sql(item, rules)))
            require(set(counts) == {'runs', 'actions'} and type(counts['runs']) is int and counts['runs'] in (0, 1)
                    and type(counts['actions']) is int and counts['actions'] >= 0)
            for name, count in counts.items():
                totals[name] += count
        after = 'ranked-run:' + selected[-1]['id']
        if len(selected) < BATCH:
            break
    require(container('postgres') == pg and container('runtime') == live)
    return totals


def main():
    lock = ROOT / 'deploy.lock'
    require(not lock.is_symlink())
    with lock.open('a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'runs': 0, 'actions': 0, 'skipped': 0, 'maintenanceBusy': True}
        return sweep()


if __name__ == '__main__':
    def stop(_number, _frame):
        global STOP_REQUESTED
        STOP_REQUESTED = True
    for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(number, stop)
    try:
        print(json.dumps(main()))
    except Exception:
        # No run IDs, players, SQL, command stderr, environment or credentials in logs.
        print('RANKED_RETENTION_FAILED')
        raise SystemExit(1) from None
