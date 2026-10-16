#!/usr/bin/env python3
"""Back up Caddy volumes without stopping or modifying running containers."""

import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tarfile
import tempfile
import time

BACKUP_DIR = Path('/var/backups/company-caddy')
CADDY_DIR = Path(os.environ.get('CADDY_DEPLOY_DIR', '/opt/small-games/caddy'))
VOLUMES = ('company-web_caddy_data', 'company-web_caddy_config')
BACKUP_NAME = re.compile(r'caddy-\d{8}T\d{6}Z-[a-f0-9]{6}\.tar\.gz')


def excluded(name):
    # Process locks are not certificate state and must not be restored.
    return name == 'data/caddy/locks' or name.startswith('data/caddy/locks/')


def inventory(sources):
    result = {}
    for prefix, source in sources.items():
        entries = [source, *sorted(source.rglob('*'))] if source.is_dir() else [source]
        for entry in entries:
            name = prefix if entry == source else f'{prefix}/{entry.relative_to(source).as_posix()}'
            if excluded(name):
                continue
            if entry.is_symlink() or not (entry.is_file() or entry.is_dir()):
                raise ValueError(f'Unsupported backup entry: {name}')
            if entry.is_file():
                result[name] = hashlib.sha256(entry.read_bytes()).hexdigest()
    return result


def verify_archive(filename):
    with tarfile.open(filename, 'r:gz') as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate archive entries')
        for member in members:
            path = Path(member.name)
            if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe archive entry')
        manifest = json.load(archive.extractfile('MANIFEST.json'))
        actual = {}
        for member in members:
            if member.isfile() and member.name != 'MANIFEST.json':
                actual[member.name] = hashlib.sha256(archive.extractfile(member).read()).hexdigest()
        if actual != manifest['files']:
            raise ValueError('Archive file checksum mismatch')
        certificates = [name for name in actual if name.startswith('data/') and name.endswith('.crt')]
        if not certificates:
            raise ValueError('No Caddy certificates in backup')
        for certificate in certificates:
            key = certificate[:-4] + '.key'
            if key not in actual:
                raise ValueError(f'Missing certificate key: {certificate}')
            cert_public = subprocess.check_output(
                ['openssl', 'x509', '-pubkey', '-noout'],
                input=archive.extractfile(certificate).read(), stderr=subprocess.DEVNULL,
            )
            key_public = subprocess.check_output(
                ['openssl', 'pkey', '-pubout', '-passin', 'pass:'],
                input=archive.extractfile(key).read(), stderr=subprocess.DEVNULL,
            )
            if cert_public != key_public:
                raise ValueError(f'Certificate/key mismatch: {certificate}')
        return manifest


def create_backup(destination, sources):
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination.chmod(0o700)
    with tempfile.TemporaryDirectory(prefix='.working-', dir=destination) as working:
        candidate = Path(working) / 'backup.tar.gz'
        for attempt in range(3):
            before = inventory(sources)
            manifest = {'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'files': before}
            with tarfile.open(candidate, 'w:gz') as archive:
                def include(member):
                    return None if excluded(member.name) else member

                for prefix, source in sources.items():
                    archive.add(source, arcname=prefix, filter=include)
                body = json.dumps(manifest, sort_keys=True).encode()
                info = tarfile.TarInfo('MANIFEST.json')
                info.size, info.mode = len(body), 0o600
                archive.addfile(info, io.BytesIO(body))
            # shortcut: online copy, use storage snapshots if write churn prevents a stable copy.
            if before == inventory(sources):
                verify_archive(candidate)
                break
            if attempt == 2:
                raise RuntimeError('Caddy files changed during all backup attempts')
            time.sleep(1)
        name = f'caddy-{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}-{secrets.token_hex(3)}.tar.gz'
        candidate.chmod(0o600)
        checksum = hashlib.sha256(candidate.read_bytes()).hexdigest()
        receipt = Path(working) / 'checksum'
        receipt.write_text(f'{checksum}  {name}\n')
        receipt.chmod(0o600)
        final = destination / name
        candidate.replace(final)
        receipt.replace(destination / f'{name}.sha256')
    # Rotate only after a new archive has passed integrity and certificate/key checks.
    cutoff = time.time() - 30 * 86400
    for old in destination.iterdir():
        if BACKUP_NAME.fullmatch(old.name) and not old.is_symlink() and old.is_file():
            if old != final and old.stat().st_mtime < cutoff:
                old.unlink()
                old.with_name(old.name + '.sha256').unlink(missing_ok=True)
    return final


def live_sources():
    volumes = json.loads(subprocess.check_output(['docker', 'volume', 'inspect', *VOLUMES]))
    by_name = {volume['Name']: volume for volume in volumes}
    if set(by_name) != set(VOLUMES) or any(volume['Driver'] != 'local' for volume in volumes):
        raise ValueError('Expected the two existing local Caddy volumes')
    current = (CADDY_DIR / 'current').resolve(strict=True)
    if current.parent != CADDY_DIR / 'releases':
        raise ValueError('Caddy current release is outside releases directory')
    sources = {
        'data': Path(by_name[VOLUMES[0]]['Mountpoint']),
        'config': Path(by_name[VOLUMES[1]]['Mountpoint']),
        'deployment/Caddyfile': current / 'caddy/Caddyfile',
        'deployment/compose.yaml': current / 'compose.yaml',
        'deployment/release.json': current / 'release.json',
        'deployment/website-directory': current / 'website-directory',
    }
    if (current / 'ingress.json').is_file():
        for name in ('ingress.json', 'nginx-compose.yaml', 'nginx-rollback.yaml', 'nginx'):
            sources['deployment/' + name] = current / name
        ingress = json.loads((current / 'ingress.json').read_text())
        legacy = Path(ingress['nginx']['legacyRelease'])
        if not re.fullmatch(r'/opt/small-games/releases/[a-z0-9-]+', str(legacy)) or legacy.resolve() != legacy:
            raise ValueError('Unsafe legacy Nginx backup path')
        sources['deployment/nginx-legacy'] = legacy / 'nginx'
    return sources


def preflight(directory):
    global CADDY_DIR
    CADDY_DIR = Path(directory)
    sources = live_sources()
    archive = create_backup(BACKUP_DIR, sources)
    expected = archive.with_name(archive.name + '.sha256').read_text()
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    if expected != f'{checksum}  {archive.name}\n':
        raise ValueError('Backup receipt mismatch')
    manifest = verify_archive(archive)
    with tempfile.TemporaryDirectory(prefix='.restore-', dir=BACKUP_DIR) as folder:
        restored = Path(folder)
        # verify_archive already rejects absolute/traversal/link/device entries.
        with tarfile.open(archive, 'r:gz') as contents:
            for name in manifest['files']:
                target = restored / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(contents.extractfile(name).read())
                target.chmod(0o600)
        actual = {str(item.relative_to(restored)).replace(os.sep, '/'): hashlib.sha256(item.read_bytes()).hexdigest() for item in restored.rglob('*') if item.is_file()}
        if actual != manifest['files']:
            raise ValueError('Isolated backup restore differs')
    print(json.dumps({'archive': archive.name, 'sha256': checksum}))


def main():
    os.umask(0o077)
    if len(sys.argv) == 3 and sys.argv[1] == '--preflight':
        BACKUP_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (BACKUP_DIR / 'backup.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            preflight(sys.argv[2])
        return
    if len(sys.argv) == 3 and sys.argv[1] == '--verify':
        manifest = verify_archive(Path(sys.argv[2]))
        print(f"Verified {len(manifest['files'])} files and all certificate/key pairs")
        return
    if len(sys.argv) != 1:
        raise ValueError('Usage: backup.py [--verify archive.tar.gz]')
    BACKUP_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    BACKUP_DIR.chmod(0o700)
    with (BACKUP_DIR / 'backup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        archive = create_backup(BACKUP_DIR, live_sources())
        print(f'Backup complete: {archive.name} ({archive.stat().st_size} bytes); retention=30 days')


if __name__ == '__main__':
    main()
