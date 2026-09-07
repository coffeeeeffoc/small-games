"""Crop rendered layers and pack alpha PNG atlases; never changes animation timing."""
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

ROOT=Path(__file__).resolve().parent
OUT=ROOT.parent/'public'/'office-scene'
FRAMES=ROOT/'frames'
META_ONLY='--metadata-only' in sys.argv
meta=json.loads((ROOT/'projection.json').read_text(encoding='utf-8'))
clips=[('work',12,1.,True),('pickup',18,.6,False),('use',16,1.,True),('stow',18,.6,False),('stow-fast',12,.4,False),('watch',12,.7,True),('talk',16,1.1,True),('relief',16,1.2,False),('boss-far',8,1.,True),('boss-near',8,1.,True),('boss-watch',8,1.,True),('boss-leave',8,1.,True)]
manifest={
 'version':1,'scene':meta['scene'],
 'layers':{n:{'image':n+'.png','draw':{'x':0,'y':0,'w':390,'h':500}} for n in ['background','foreground']},
 'hotspots':{},'screenCorners':meta['screenCorners'],'clips':{},'license':meta['license'],
 'bossPath':{name:dict(zip(('x','y'),meta['hotspots'][source])) for name,source in [('far','bossFar'),('near','bossNear')]},
 'productionStatus':'rendering' if META_ONLY else 'complete',
}
for name,source,w,h in [('monitor','computer',94,72),('phone','phone',44,52),('drawer','drawer',44,52),('phone-rest','phone',44,52),('file','file',60,34)]:
    x,y=meta['hotspots'][source]
    manifest['hotspots'][name]={'x':round(x-w/2,2),'y':round(y-h/2,2),'w':w,'h':h}
# Incoming paper is painted by the runtime on this clear desktop area, away from the phone.
manifest['hotspots']['file']={'x':210,'y':401,'w':60,'h':34}
manifest['hotspots']['phoneHeld']={'x':122,'y':324,'w':48,'h':60}
for name,count,duration,loop in clips:
    bbox=(0,0,780,1000)
    if not META_ONLY:
        images=[Image.open(FRAMES/f'{name}-{i:03}.png').convert('RGBA') for i in range(count)]
        boxes=[im.getchannel('A').getbbox() for im in images]
        assert all(boxes),f'Empty frame in {name}'
        bbox=(max(0,min(b[0] for b in boxes)-3),max(0,min(b[1] for b in boxes)-3),min(780,max(b[2] for b in boxes)+3),min(1000,max(b[3] for b in boxes)+3))
    x,y,right,bottom=bbox
    # 1.5 source pixels per logical pixel; native PNG remains broadly compatible.
    w=math.ceil((right-x)*.75);h=math.ceil((bottom-y)*.75)
    columns=min(range(1,count+1),key=lambda n:max(n*w,math.ceil(count/n)*h))
    rows=math.ceil(count/columns)
    if not META_ONLY:assert max(columns*w,rows*h)<=2048,(name,w,h,columns,rows)
    rects=[{'x':(i%columns)*w,'y':(i//columns)*h,'w':w,'h':h} for i in range(count)]
    if not META_ONLY:
        atlas=Image.new('RGBA',(columns*w,rows*h))
        for im,r in zip(images,rects):
            cropped=im.crop(bbox).resize((w,h),Image.Resampling.LANCZOS)
            atlas.paste(cropped,(r['x'],r['y']))
        atlas.save(OUT/f'{name}.png',optimize=True)
        # One check per clip: authored movement must change actual rendered pixels.
        assert any(ImageChops.difference(images[0],im).convert('RGB').getbbox() for im in images[1:]),f'No animation in {name}'
    events=[]
    if name=='pickup':events=[{'at':round(duration*.32,3),'name':'phone-grip'},{'at':duration,'name':'phone-ready'}]
    if name.startswith('stow'):events=[{'at':round(duration*.68,3),'name':'phone-screen-off'},{'at':duration,'name':'hands-back-at-work'}]
    if name in ['boss-near','boss-leave']:events=[{'at':0,'name':'footfall-left'},{'at':duration/2,'name':'footfall-right'}]
    manifest['clips'][name]={'image':name+'.png','frames':rects,'draw':{'x':x/2,'y':y/2,'w':(right-x)/2,'h':(bottom-y)/2},'duration':duration,'loop':loop,'events':events}
if not META_ONLY:
    for name in ['background','foreground']:
        Image.open(FRAMES/f'{name}.png').save(OUT/f'{name}.png',optimize=True)
    manifest['measurements']={'downloadBytes':sum(p.stat().st_size for p in OUT.glob('*.png')),'decodedRgbaBytes':sum(Image.open(p).width*Image.open(p).height*4 for p in OUT.glob('*.png'))}
    preview=Image.new('RGB',(780,1000*2),(30,35,37))
    for row,clip in enumerate(['work','use']):
        frame=Image.open(FRAMES/'background.png').convert('RGBA')
        frame.alpha_composite(Image.open(FRAMES/'boss-far-000.png').convert('RGBA'))
        frame.alpha_composite(Image.open(FRAMES/f'{clip}-000.png').convert('RGBA'))
        frame.alpha_composite(Image.open(FRAMES/'foreground.png').convert('RGBA'))
        preview.paste(frame,(0,row*1000))
    preview.save(ROOT/'composite-check.jpg',quality=94)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':manifest['productionStatus'],'clips':len(manifest['clips']),'measurements':manifest.get('measurements')},ensure_ascii=False))
