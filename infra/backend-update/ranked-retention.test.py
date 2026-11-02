"""Finite owner contracts; --postgres explicitly opts into a labelled local fixture."""
import contextlib
import importlib.util
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location('retention', Path(__file__).with_name('ranked-retention.py'))
retention = importlib.util.module_from_spec(spec)
spec.loader.exec_module(retention)
RULES = {'cage-rescue':'rescue-ranked-v2','tower-brake':'tower-ranked-v2','night-overwatch':'night-input-replay-v12','tetracube':'tetracube-20261031-1'}
CONTRACT = {'version':1,'maxAgeMs':86400000,'rules':RULES}
POSTGRES = '--postgres' in sys.argv
DOCKER = shutil.which('docker.exe') or 'docker'
if POSTGRES:
    sys.argv.remove('--postgres')


def item():
    return {'id': str(uuid4()), 'playerId': str(uuid4()), 'game': 'night-overwatch'}


class Contracts(unittest.TestCase):
    def test_selection_and_compaction_are_exact_bounded_and_preserve_root(self):
        selected = item()
        sql = retention.compact_sql(selected, RULES)
        self.assertIn('FOR UPDATE', sql)
        self.assertIn("data->>'status'='finished'", sql)
        self.assertIn("(data->>'createdAt')::bigint+86400000", sql)
        self.assertIn("':[1-9][0-9]*$'", sql)
        self.assertIn('a.board=r.board', sql)
        self.assertEqual(sql.count('DELETE FROM'), 1)
        self.assertIn("'{state}','null'::jsonb", sql)
        for name in ('competition_results', 'competition_best', 'competition_duels', 'competition_rooms', 'game_control'):
            self.assertNotIn(name, sql)
        self.assertIn('LIMIT 100', retention.selection_sql(RULES))
        for invalid in (dict(selected, id="x';DELETE FROM x;--"), dict(selected, game='unknown'), dict(selected, playerId='bad')):
            with self.assertRaisesRegex(RuntimeError, 'RETENTION_CONTRACT'):
                retention.compact_sql(invalid, RULES)

    def test_live_contract_is_checked_before_any_database_work(self):
        with patch.object(retention, 'container', return_value={'id': 'a'*64}), patch.object(retention, 'runtime', return_value={}), patch.object(retention, 'psql') as db:
            with self.assertRaisesRegex(RuntimeError, 'RETENTION_CONTRACT'):
                retention.sweep()
            db.assert_not_called()

    def test_live_rule_versions_are_dynamic_but_games_and_sql_values_are_strict(self):
        advanced = dict(RULES, **{'night-overwatch': 'night-input-replay-v13'})
        self.assertIn("THEN 'night-input-replay-v13'", retention.selection_sql(advanced))
        self.assertIn("<>'night-input-replay-v13'", retention.compact_sql(item(), advanced))
        invalid = [dict(RULES, unknown='v1'), {key:value for key,value in RULES.items() if key != 'tetracube'},
                   dict(RULES, **{'night-overwatch': "x';DELETE FROM x;--"}),
                   dict(RULES, **{'night-overwatch': ''}), dict(RULES, **{'night-overwatch': None})]
        for rules in invalid:
            with patch.object(retention, 'container', return_value={'id':'a'*64}), patch.object(retention, 'runtime', return_value=dict(CONTRACT, rules=rules)), patch.object(retention, 'psql') as db:
                with self.assertRaisesRegex(RuntimeError, 'RETENTION_CONTRACT'):
                    retention.sweep()
                db.assert_not_called()

    def test_only_confirmed_terminal_runs_are_compacted_and_unknown_rows_are_counted(self):
        a, b = item(), item()
        facts = {'id': 'a'*64, 'image': 'sha256:'+'b'*64, 'running': True}
        with patch.object(retention, 'container', return_value=facts), patch.object(retention, 'runtime', side_effect=[CONTRACT, {'ready': [a['id']], 'skipped': 1}]), patch.object(retention, 'psql', side_effect=[json.dumps([a,b]), '{"runs":1,"actions":3}']) as db:
            self.assertEqual(retention.sweep(), {'runs':1,'actions':3,'skipped':1})
            self.assertEqual(db.call_count, 2)
            self.assertEqual(db.call_args.args[1], retention.compact_sql(a, RULES))

    def test_same_deployment_lock_is_nonblocking(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(retention, 'ROOT', Path(directory)), patch.object(retention, 'sweep') as sweep:
            with (Path(directory)/'deploy.lock').open('a') as held:
                retention.fcntl.flock(held, retention.fcntl.LOCK_EX | retention.fcntl.LOCK_NB)
                self.assertTrue(retention.main()['maintenanceBusy'])
                sweep.assert_not_called()
            retention.main()
            sweep.assert_called_once()

    def test_timer_uses_same_bounded_script_and_deployment_account(self):
        directory = Path(__file__).parent
        service = (directory/'small-games-ranked-retention.service').read_text()
        timer = (directory/'small-games-ranked-retention.timer').read_text()
        self.assertIn('User=ubuntu', service)
        self.assertIn('/opt/small-games/ranked-retention/ranked-retention.py', service)
        self.assertIn('KillMode=process', service)
        self.assertIn('OnCalendar=hourly', timer)
        self.assertIn('Persistent=true', timer)


@unittest.skipUnless(POSTGRES, 'explicit isolated PostgreSQL fixture required')
class PostgresContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.container = os.environ.get('RANKED_RETENTION_TEST_CONTAINER', '')
        if not cls.container.startswith('codex-ranked-retention-'):
            raise RuntimeError('ISOLATED_FIXTURE_REQUIRED')
        checked = subprocess.check_output([DOCKER,'inspect','--format','{{index .Config.Labels "io.small-games.ranked-retention-test"}}',cls.container], text=True).strip()
        if checked != 'isolated-competition-test':
            raise RuntimeError('ISOLATED_FIXTURE_REQUIRED')

    def sql(self, query, success=True):
        result = subprocess.run([DOCKER,'exec','-i',self.container,'psql','-X','-qAt','-U','platform_owner','-d','competition_test','-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True)
        self.assertEqual(result.returncode == 0, success, result.stderr)
        return result.stdout.strip()

    def test_atomic_precise_deletion_and_concurrent_repeat_preserve_root_and_history(self):
        row = item()
        root = 'ranked-run:'+row['id']
        prefix = 'ranked-action:'+row['id']+':'
        data = dict(row, kind='ranked-run-v1', board='level-corridor-01', boardKey='night:retention-test',
                    version='night-input-replay-v12',status='finished',seq=2,createdAt=1,expiresAt=86400001,
                    state={'large':'checkpoint'},settlement={'accepted':True,'runId':row['id']})
        names = [root,prefix+'1',prefix+'2',prefix+'2extra',prefix+'3','night-asset-event:'+row['id']]
        for name in names:
            board = 'other-board' if name == prefix+'3' else 'night:retention-test'
            value = data if name == root else {'protected':name}
            self.sql("INSERT INTO runtime.competition_matches VALUES ("+','.join(["'"+name+"'", "'"+board+"'", "'"+json.dumps(value)+"'::jsonb",'1'])+");")
        read = lambda: json.loads(self.sql("SELECT json_object_agg(id,data) FROM runtime.competition_matches WHERE id IN ("+','.join("'"+name+"'" for name in names)+");"))
        before = read()
        # A failed root update must roll the child DELETE back in the same transaction.
        self.sql("CREATE FUNCTION runtime.retention_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture'; END$$; CREATE TRIGGER retention_test_failure BEFORE UPDATE ON runtime.competition_matches FOR EACH ROW EXECUTE FUNCTION runtime.retention_test_failure();")
        try:
            self.sql(retention.compact_sql(row, RULES), success=False)
            self.assertEqual(read(), before)
        finally:
            self.sql('DROP TRIGGER retention_test_failure ON runtime.competition_matches; DROP FUNCTION runtime.retention_test_failure();')
        with ThreadPoolExecutor(max_workers=2) as pool:
            counts = list(pool.map(lambda _: json.loads(self.sql(retention.compact_sql(row, RULES))), range(2)))
        self.assertEqual(sum(value['actions'] for value in counts), 2)
        after = read()
        expected = dict(before[root], state=None,retainedAt=after[root]['retainedAt'])
        self.assertEqual(after[root], expected)
        for name in names[3:]:
            self.assertEqual(after[name], before[name])
        self.assertNotIn(prefix+'1', after)
        self.assertNotIn(prefix+'2', after)
        self.assertEqual(json.loads(self.sql(retention.compact_sql(row, RULES)))['actions'], 0)
        self.assertEqual(read(), after)
        # A root reactivated or extended after selection is rechecked under the lock.
        self.sql("UPDATE runtime.competition_matches SET data=jsonb_set(data,'{status}','\"active\"') WHERE id='"+root+"';")
        self.assertEqual(json.loads(self.sql(retention.compact_sql(row, RULES))), {'runs':0,'actions':0})

    def test_old_rules_are_selected_before_expiry_but_valid_future_runs_are_preserved(self):
        old, current = item(), item()
        now = int(self.sql('SELECT (extract(epoch from now())*1000)::bigint;'))
        for row, version in [(old,'night-input-replay-v8'),(current,RULES['night-overwatch'])]:
            data = dict(row, kind='ranked-run-v1',version=version,status='finished',createdAt=now,
                        expiresAt=now+86400000,state={'large':'checkpoint'})
            self.sql("INSERT INTO runtime.competition_matches VALUES ('ranked-run:"+row['id']+"','night:retention-test','"+json.dumps(data)+"'::jsonb,1);")
        selected = json.loads(self.sql(retention.selection_sql(RULES)))
        self.assertIn(old['id'], [row['id'] for row in selected])
        self.assertNotIn(current['id'], [row['id'] for row in selected])
        self.assertEqual(json.loads(self.sql(retention.compact_sql(old,RULES))), {'runs':1,'actions':0})
        self.assertEqual(json.loads(self.sql(retention.compact_sql(current,RULES))), {'runs':0,'actions':0})


if __name__ == '__main__':
    unittest.main()
