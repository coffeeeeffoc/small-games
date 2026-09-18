"""Small reproducible check of export and reviewed-unit mapping, without the large source DB."""
import json
import runpy
import sqlite3
import tempfile
from pathlib import Path

export = runpy.run_path(str(Path(__file__).with_name('export-vocabulary.py')))['export']

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    source = root / 'source.sqlite'
    db = sqlite3.connect(source)
    db.executescript('''
        CREATE TABLE wordlists(id, title, stage, edition, grade, volume, kind, status, source, entry_count);
        INSERT INTO wordlists VALUES('PEPTest', 'test book', 'middle', 'pep', 7, 'first', 'textbook', 'test', 'fixture', 2);
        CREATE TABLE vocabulary(list_id, ordinal, word, meaning, phonetic, unit);
        INSERT INTO vocabulary VALUES('PEPTest', 1, 'apple', 'apple meaning', '', NULL);
        INSERT INTO vocabulary VALUES('PEPTest', 2, 'pear', 'pear meaning', '', NULL);
        CREATE TABLE sources(id, url, revision, license_note);
    ''')
    db.commit()
    db.close()
    (root / 'LICENSE-ECDICT.txt').write_text('test fixture', encoding='utf-8')
    output = root / 'output'
    original = export(source, output)
    assert original['books'][0]['units'] == []
    payload = (output / 'books/PEPTest.json').read_bytes()
    assert export(source, output) == original
    assert (output / 'books/PEPTest.json').read_bytes() == payload
    mapping = root / 'units.json'
    mapping.write_text(json.dumps({'PEPTest': {'1': 'Unit 5'}}), encoding='utf-8')
    mapped = export(source, output, mapping)
    assert mapped['books'][0]['units'] == ['Unit 5']
    assert mapped['books'][0]['unitCount'] == 1
    assert mapped['books'][0]['revision'] != original['books'][0]['revision']
    mapped_payload = (output / 'books/PEPTest.json').read_bytes()
    mapping.write_text(json.dumps({'PEPTest': {'999': 'Unit 5'}}), encoding='utf-8')
    try:
        export(source, output, mapping)
        raise AssertionError('Unknown ordinals must fail')
    except ValueError:
        pass
    assert (output / 'books/PEPTest.json').read_bytes() == mapped_payload

print('Export determinism, unit mapping, unknown ordinals and preservation passed')
