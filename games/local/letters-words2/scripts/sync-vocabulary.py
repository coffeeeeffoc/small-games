"""Reuse the shared database export, then overlay evidence-backed textbook units."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[2] / 'assets/english-dict'
OUTPUT = ROOT / 'assets/english-dict'
spec = importlib.util.spec_from_file_location('vocabulary_export', ROOT.parent / 'letters-words/scripts/export-vocabulary.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
catalog = exporter.export(SOURCE / '精简词库/英语词库.sqlite', OUTPUT)
publishers = json.loads((OUTPUT / 'publishers.json').read_text('utf-8'))
reviewed = SOURCE / '完整素材/reviewed-units'
if (reviewed / 'catalog.json').exists():
    for book in json.loads((reviewed / 'catalog.json').read_text('utf-8'))['books']:
        assert book['verification']['status'] in ('source-reviewed', 'pdf-reviewed')
        assert book['verification']['evidence'], f'Missing evidence: {book["id"]}'
        assert book['url'] == f'books/{book["id"]}.json'
        payload = (reviewed / book['url']).read_bytes()
        data = json.loads(payload)
        assert data['id'] == book['id'] and len(data['entries']) == book['count']
        assert list(dict.fromkeys(e['unit'] for e in data['entries'] if e['unit'])) == book['units']
        assert all(e['unit'] in book['units'] for e in data['entries'])
        (OUTPUT / book['url']).write_bytes(payload)
        catalog['books'] = [item for item in catalog['books'] if item['id'] != book['id']]
        catalog['books'].append({**book, 'bytes': len(payload), 'revision': hashlib.sha256(payload).hexdigest()})
        if not any(item['id'] == book['publisherId'] for item in publishers):
            publishers.append({'id': book['publisherId'], 'name': book['publisher']})
catalog['books'].sort(key=lambda book: (not bool(book.get('verification')), book['publisherId'], book.get('grade') or 99, not book['id'].startswith('fltrp-sun-'), book.get('volume') != '上册', book['id']))
catalog['publishers'] = publishers
catalog['note'] = '仅带来源核验信息的教材支持按单元练习；历史词表不代表新版教材。'
(OUTPUT / 'catalog.json').write_bytes(exporter.encode(catalog))
print(f'Reviewed textbooks: {sum(bool(book.get("verification")) for book in catalog["books"])}')
