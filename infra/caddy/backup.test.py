import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('caddy_backup', Path(__file__).with_name('backup.py'))
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def test_configuration_sources_follow_caddy_and_do_not_depend_on_website_release(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder)
            release = base / 'releases/test'
            release.mkdir(parents=True)
            (base / 'current').symlink_to(release)
            volumes = [{'Name': name, 'Driver': 'local', 'Mountpoint': folder} for name in backup.VOLUMES]
            with patch.object(backup, 'CADDY_DIR', base), patch.object(backup.subprocess, 'check_output', return_value=json.dumps(volumes)):
                sources = backup.live_sources()
            self.assertEqual(sources['deployment/Caddyfile'], release / 'caddy/Caddyfile')
            self.assertEqual(sources['deployment/release.json'], release / 'release.json')
            self.assertEqual(sources['deployment/website-directory'], release / 'website-directory')
            (base / 'current').unlink()
            (base / 'current').symlink_to(base)
            with patch.object(backup, 'CADDY_DIR', base), patch.object(backup.subprocess, 'check_output', return_value=json.dumps(volumes)):
                with self.assertRaisesRegex(ValueError, 'outside releases'):
                    backup.live_sources()

    @classmethod
    def setUpClass(cls):
        cls.keys = tempfile.TemporaryDirectory()
        folder = Path(cls.keys.name)
        subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
            '-nodes', '-days', '1', '-subj', '/CN=backup-test.invalid',
            '-keyout', str(folder / 'test.key'), '-out', str(folder / 'test.crt'),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.certificate = (folder / 'test.crt').read_bytes()
        cls.key = (folder / 'test.key').read_bytes()

    @classmethod
    def tearDownClass(cls):
        cls.keys.cleanup()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        data = self.root / 'data'
        certificates = data / 'caddy/certificates/test'
        certificates.mkdir(parents=True)
        (certificates / 'test.crt').write_bytes(self.certificate)
        (certificates / 'test.key').write_bytes(self.key)
        locks = data / 'caddy/locks'
        locks.mkdir()
        (locks / 'active.lock').write_text('must not be restored')
        config = self.root / 'config'
        config.mkdir()
        (config / 'autosave.json').write_text('{}')
        self.sources = {'data': data, 'config': config}
        self.destination = self.root / 'backups'

    def test_archive_restores_exact_files_with_private_permissions_and_checksums(self):
        before = backup.inventory(self.sources)
        archive = backup.create_backup(self.destination, self.sources)
        self.assertEqual(backup.inventory(self.sources), before)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.destination.stat().st_mode & 0o777, 0o700)
        self.assertEqual(backup.verify_archive(archive)['files'], before)
        self.assertEqual(
            archive.with_name(archive.name + '.sha256').read_text(),
            f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n',
        )
        restored = self.root / 'restored'
        with tarfile.open(archive) as contents:
            self.assertNotIn('data/caddy/locks', contents.getnames())
            # verify_archive above has already rejected links and unsafe paths.
            contents.extractall(restored)
        self.assertEqual((restored / 'data/caddy/certificates/test/test.key').read_bytes(), self.key)
        self.assertEqual((restored / 'config/autosave.json').read_text(), '{}')

    def test_failed_validation_keeps_old_backups_and_publishes_nothing(self):
        self.destination.mkdir()
        old = self.destination / 'caddy-20000101T000000Z-abcdef.tar.gz'
        old.write_text('previous backup')
        os.utime(old, (0, 0))
        (self.sources['data'] / 'caddy/certificates/test/test.key').write_text('invalid key')
        with self.assertRaises(subprocess.CalledProcessError):
            backup.create_backup(self.destination, self.sources)
        self.assertEqual(list(self.destination.iterdir()), [old])

    def test_rotation_only_removes_expired_backup_files_after_success(self):
        self.destination.mkdir()
        old = self.destination / 'caddy-20000101T000000Z-abcdef.tar.gz'
        old.write_text('expired')
        receipt = old.with_name(old.name + '.sha256')
        receipt.write_text('expired checksum')
        os.utime(old, (time.time() - 31 * 86400,) * 2)
        unrelated = self.destination / 'manual-notes.txt'
        unrelated.write_text('keep')
        backup.create_backup(self.destination, self.sources)
        self.assertFalse(old.exists())
        self.assertFalse(receipt.exists())
        self.assertTrue(unrelated.exists())

    def test_unstable_sources_and_symlinks_are_rejected(self):
        actual = backup.inventory(self.sources)
        with patch.object(backup, 'inventory', side_effect=[actual, {}] * 3), patch.object(backup.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'changed during all backup attempts'):
                backup.create_backup(self.destination, self.sources)
        self.assertEqual(list(self.destination.iterdir()), [])
        (self.sources['config'] / 'outside').symlink_to(self.root / 'data', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Unsupported backup entry'):
            backup.create_backup(self.destination, self.sources)


if __name__ == '__main__':
    unittest.main()
