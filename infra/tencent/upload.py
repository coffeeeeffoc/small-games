"""Upload one immutable site release with Tencent's official COS SDK."""
import mimetypes
import os
from pathlib import Path
import sys
from concurrent.futures import ThreadPoolExecutor


def upload(directory, release):
    from qcloud_cos import CosConfig, CosS3Client

    client = CosS3Client(CosConfig(
        Region=os.environ['COS_REGION'], SecretId=os.environ['COS_SECRET_ID'],
        SecretKey=os.environ['COS_SECRET_KEY'], Token=os.environ.get('COS_SESSION_TOKEN') or None,
        Scheme='https',
    ))
    root = Path(directory).resolve()
    prefix = f"{os.environ['COS_PREFIX']}/releases/{release}"
    files = sorted(p for p in root.rglob('*') if p.is_file())
    overrides = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
                 '.json': 'application/json', '.html': 'text/html; charset=utf-8', '.css': 'text/css'}

    def put(file):
        if file.is_symlink() or not file.resolve().is_relative_to(root):
            raise ValueError('Symlinks cannot be published')
        client.upload_file(
            Bucket=os.environ['COS_BUCKET'], Key=f'{prefix}/{file.relative_to(root).as_posix()}',
            LocalFilePath=str(file), EnableMD5=True,
            ContentType=overrides.get(file.suffix.lower()) or mimetypes.guess_type(file.name)[0] or 'application/octet-stream',
            CacheControl='public,max-age=31536000,immutable',
        )

    # No sync/delete: a failed upload cannot damage the active or previous release.
    with ThreadPoolExecutor(max_workers=4) as pool:
        for count, _ in enumerate(pool.map(put, files), 1):
            if count % 100 == 0:
                print(f'COS: {count}/{len(files)}', flush=True)
    print(f'COS: uploaded {len(files)} files to {prefix}', flush=True)


if __name__ == '__main__':
    try:
        upload(sys.argv[1], sys.argv[2])
    except Exception as error:
        # SDK exceptions can carry signed request details; do not print credentials/headers.
        print(f'COS upload failed ({type(error).__name__}); check bucket, credentials and network.', file=sys.stderr)
        sys.exit(1)
