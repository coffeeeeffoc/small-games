import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { createZip } from '../src/archive.js';

test('paired ZIP has independent CRCs, intact files and central directory offsets', async () => {
  const files = [
    { name: 'echo-lab-original.wav', blob: new Blob(['RIFF original']) },
    { name: 'echo-lab-processed.wav', blob: new Blob(['RIFF processed tail']) },
    { name: '房间.json', blob: new Blob(['{"format":"echo-lab"}']) },
  ];
  const zip = Buffer.from(await (await createZip(files)).arrayBuffer());
  const offsets = [];
  let offset = 0;
  for (const file of files) {
    offsets.push(offset);
    const expected = Buffer.from(await file.blob.arrayBuffer());
    assert.equal(zip.readUInt32LE(offset), 0x04034b50);
    assert.equal(zip.readUInt16LE(offset + 6), 0x800);
    assert.equal(zip.readUInt16LE(offset + 8), 0);
    assert.equal(zip.readUInt32LE(offset + 14), crc32(expected));
    assert.equal(zip.readUInt32LE(offset + 18), expected.length);
    const length = zip.readUInt16LE(offset + 26);
    assert.equal(zip.toString('utf8', offset + 30, offset + 30 + length), file.name);
    assert.deepEqual(
      zip.subarray(offset + 30 + length, offset + 30 + length + expected.length),
      expected,
    );
    offset += 30 + length + expected.length;
  }
  const directoryOffset = offset;
  for (const [index, file] of files.entries()) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    assert.equal(zip.readUInt32LE(offset + 42), offsets[index]);
    const length = zip.readUInt16LE(offset + 28);
    assert.equal(zip.toString('utf8', offset + 46, offset + 46 + length), file.name);
    offset += 46 + length;
  }
  assert.equal(zip.readUInt32LE(offset), 0x06054b50);
  assert.equal(zip.readUInt16LE(offset + 10), files.length);
  assert.equal(zip.readUInt32LE(offset + 12), offset - directoryOffset);
  assert.equal(zip.readUInt32LE(offset + 16), directoryOffset);
  assert.equal(zip.length, offset + 22);
});
