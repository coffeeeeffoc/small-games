"""Render sequential three-frame chunks so each Blender process releases its memory."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT=Path(__file__).resolve().parent
BLENDER=Path(sys.argv[1]) if len(sys.argv)>1 else Path(r'D:\setup\Blender\blender.exe')
assert BLENDER.is_file(),f'Blender not found: {BLENDER}'
script=ROOT/'build_scene.py'
signature=hashlib.sha256(script.read_bytes()).hexdigest()
ledger=ROOT/'render-progress.json'
progress=json.loads(ledger.read_text()) if ledger.exists() else {}
if progress.get('source')!=signature:progress={'source':signature,'done':[]}
jobs=[('layers',0,1)]+[(name,start,min(start+3,count)) for name,count in [('work',12),('pickup',18),('use',16),('watch',12),('talk',16),('relief',16),('boss-far',8),('boss-near',8),('boss-watch',8),('boss-leave',8)] for start in range(0,count,3)]
covered={}
for chunk in progress['done']:
    name,start,end=chunk.split(':');covered.setdefault(name,set()).update(range(int(start),int(end)))
for number,(name,start,end) in enumerate(jobs):
    key=f'{name}:{start}:{end}'
    if all(i in covered.get(name,set()) for i in range(start,end)):continue
    print(f'[{number+1}/{len(jobs)}] {key}',flush=True)
    args=[str(BLENDER),'--background','--factory-startup','--python',str(script),'--','render','--cpu','--clip',name,'--start',str(start),'--end',str(end)]
    with (ROOT/'render-log.txt').open('w',encoding='utf-8') as log:
        result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
    if result.returncode:
        print((ROOT/'render-log.txt').read_text(encoding='utf-8')[-3500:])
        raise SystemExit(f'Render failed at {key}; completed chunks are recorded for resume')
    progress['done'].append(key);ledger.write_text(json.dumps(progress,indent=2),encoding='utf-8')
# Exact reversals preserve the hand-device contact and cancel path without duplicate rendering.
for name,count in [('stow',18),('stow-fast',12)]:
    for i in range(count):
        source=17-round(i*17/(count-1))
        shutil.copyfile(ROOT/'frames'/f'pickup-{source:03}.png',ROOT/'frames'/f'{name}-{i:03}.png')
subprocess.run([sys.executable,str(ROOT/'pack_scene.py')],check=True)
print('All Office PNG atlases packed and checked.',flush=True)
