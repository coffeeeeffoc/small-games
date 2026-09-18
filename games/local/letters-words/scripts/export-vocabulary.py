"""Export the shared SQLite corpus to independently downloadable books. Stdlib only."""
import argparse
import hashlib
import json
import re
import shutil
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT.parents[2] / 'assets/english-dict/精简词库/英语词库.sqlite'


def encode(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def export(db_path, output, unit_path=None):
    publishers = json.loads((ROOT / 'assets/english-dict/publishers.json').read_text('utf-8'))
    # Optional reviewed mapping: {list_id: {source ordinal: unit name}}. Never infer units.
    units = json.loads(unit_path.read_text('utf-8')) if unit_path else {}
    connection = sqlite3.connect(db_path.resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    books = []
    payloads = {}
    mapped = set()
    for row in connection.execute('SELECT * FROM wordlists ORDER BY id'):
        book = dict(row)
        book_id = book['id']
        if not re.fullmatch(r'[A-Za-z0-9_-]+', book_id):
            raise ValueError(f'Unsafe book id: {book_id}')
        matches = [p['id'] for p in publishers if any(book_id.startswith(s) for s in p['listPrefixes'])]
        if len(matches) != 1:
            raise ValueError(f'{book_id}: must match exactly one publisher')
        entries = []
        for item in connection.execute('''SELECT ordinal, word, meaning, phonetic, unit
                FROM vocabulary WHERE list_id=? ORDER BY ordinal''', (book_id,)):
            entry = dict(item)
            mapping = units.get(book_id, {})
            ordinal = str(entry['ordinal'])
            if ordinal in mapping:
                if not isinstance(mapping[ordinal], str) or not mapping[ordinal].strip():
                    raise ValueError(f'Invalid unit: {book_id}/{ordinal}')
                entry['unit'] = mapping[ordinal].strip()
                mapped.add((book_id, ordinal))
            entry['unit'] = entry['unit'] or None
            entries.append(entry)
        if len(entries) != book['entry_count']:
            raise ValueError(f'{book_id}: source count mismatch')
        payload = encode({'id': book_id, 'entries': entries})
        payloads[book_id] = payload
        books.append({
            **{k: book[k] for k in ('id', 'title', 'stage', 'edition', 'grade', 'volume', 'kind', 'status', 'source')},
            'publisherId': matches[0], 'count': len(entries),
            'units': list(dict.fromkeys(e['unit'] for e in entries if e['unit'])),
            'unitCount': sum(bool(e['unit']) for e in entries),
            'url': f'books/{book_id}.json', 'bytes': len(payload),
            'revision': hashlib.sha256(payload).hexdigest(),
        })
    requested = {(book, str(ordinal)) for book, mapping in units.items() for ordinal in mapping}
    if requested != mapped:
        raise ValueError(f'Unknown unit mapping rows: {requested - mapped}')
    catalog = {
        'schema': 1,
        'note': '现有教材词表为历史版本，尚未核验新版教材对应关系；未标注单元的书仅提供整册练习。',
        'sources': [dict(row) for row in connection.execute('SELECT * FROM sources ORDER BY id')],
        'books': books,
    }
    connection.close()
    (output / 'books').mkdir(parents=True, exist_ok=True)
    for book_id, payload in payloads.items():
        (output / 'books' / f'{book_id}.json').write_bytes(payload)
    (output / 'catalog.json').write_bytes(encode(catalog))
    (output / 'publishers.json').write_bytes(encode(publishers))
    shutil.copyfile(db_path.parent / 'LICENSE-ECDICT.txt', output / 'LICENSE-ECDICT.txt')
    print(f'Exported {len(books)} books / {sum(b["count"] for b in books)} entries')
    return catalog


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--out', type=Path, default=ROOT / 'assets/english-dict')
    parser.add_argument('--units', type=Path, help='Reviewed per-book ordinal-to-unit JSON mapping')
    args = parser.parse_args()
    export(args.db, args.out, args.units)
