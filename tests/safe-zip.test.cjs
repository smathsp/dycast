const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const yazl = require('yazl');
const { openSafeZip, writeSafeZipFile } = require('../safe-zip.cjs');

async function makeTemporaryDirectory(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dycast-safe-zip-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.promises.rm(resolved, { recursive: true, force: true });
  });
  return directory;
}

async function writeRawZip(filePath, entries) {
  const zipFile = new yazl.ZipFile();
  for (const entry of entries) zipFile.addBuffer(Buffer.from(entry.data), entry.archivePath);
  const completion = pipeline(zipFile.outputStream, fs.createWriteStream(filePath, { flags: 'wx' }));
  zipFile.end();
  await completion;
}

async function replaceAllSameLength(filePath, original, replacement) {
  const originalBytes = Buffer.from(original);
  const replacementBytes = Buffer.from(replacement);
  assert.equal(originalBytes.length, replacementBytes.length);
  const bytes = await fs.promises.readFile(filePath);
  let offset = 0;
  let replacements = 0;
  while ((offset = bytes.indexOf(originalBytes, offset)) >= 0) {
    replacementBytes.copy(bytes, offset);
    offset += replacementBytes.length;
    replacements += 1;
  }
  assert.ok(replacements >= 2, 'local and central ZIP names should both be replaced');
  await fs.promises.writeFile(filePath, bytes);
}

async function setCentralUncompressedSize(filePath, archivePath, size) {
  const bytes = await fs.promises.readFile(filePath);
  const centralSignature = 0x02014b50;
  let offset = 0;
  let changed = false;
  while (offset <= bytes.length - 46) {
    const signatureOffset = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset);
    if (signatureOffset < 0) break;
    const nameLength = bytes.readUInt16LE(signatureOffset + 28);
    const extraLength = bytes.readUInt16LE(signatureOffset + 30);
    const commentLength = bytes.readUInt16LE(signatureOffset + 32);
    assert.equal(bytes.readUInt32LE(signatureOffset), centralSignature);
    const nameStart = signatureOffset + 46;
    const name = bytes.subarray(nameStart, nameStart + nameLength).toString('utf8');
    if (name === archivePath) {
      bytes.writeUInt32LE(size, signatureOffset + 24);
      changed = true;
    }
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  assert.equal(changed, true, 'target central directory entry should exist');
  await fs.promises.writeFile(filePath, bytes);
}

function expectCode(code) {
  return error => {
    assert.equal(error?.code, code);
    return true;
  };
}

test('writes and lazily reads a DyCast-compatible ZIP round trip', async t => {
  const directory = await makeTemporaryDirectory(t);
  const sourcePath = path.join(directory, 'source.mp3');
  const outputPath = path.join(directory, 'audio-pack.zip');
  const extractedPath = path.join(directory, 'extracted.mp3');
  const audio = Buffer.from('safe audio bytes');
  const manifest = Buffer.from(JSON.stringify({
    format: 'dycast-audio-pack',
    version: 1,
    tracks: [{
      id: 'local:charging:source.mp3',
      category: 'charging',
      name: 'source',
      archivePath: 'audio/charging/001-source.mp3',
      mimeType: 'audio/mpeg',
      size: audio.length
    }],
    settings: {}
  }));
  await fs.promises.writeFile(sourcePath, audio);
  await fs.promises.writeFile(outputPath, 'previous export');

  await writeSafeZipFile(outputPath, [
    { archivePath: 'audio/charging/001-source.mp3', filePath: sourcePath },
    { archivePath: 'manifest.json', data: manifest }
  ], { maxEntries: 4, maxEntrySize: 1024, maxTotalSize: 2048, maxArchiveSize: 4096 });

  const archive = await openSafeZip(outputPath, {
    maxEntries: 4,
    maxEntrySize: 1024,
    maxTotalSize: 2048,
    maxArchiveSize: 4096
  });
  t.after(() => archive.close());
  assert.deepEqual(
    archive.listEntries().map(entry => entry.archivePath),
    ['audio/charging/001-source.mp3', 'manifest.json']
  );
  assert.deepEqual(await archive.readBuffer('manifest.json', { maxSize: 1024 }), manifest);
  await archive.extractToFile('audio/charging/001-source.mp3', extractedPath, { maxSize: 1024 });
  assert.deepEqual(await fs.promises.readFile(extractedPath), audio);
});

test('rejects traversal names and duplicate archive paths', async t => {
  const directory = await makeTemporaryDirectory(t);
  const traversalPath = path.join(directory, 'traversal.zip');
  await writeRawZip(traversalPath, [{ archivePath: 'safe.mp3', data: 'a' }]);
  await replaceAllSameLength(traversalPath, 'safe.mp3', '../a.mp3');
  await assert.rejects(
    openSafeZip(traversalPath, { maxArchiveSize: 4096 }),
    error => {
      assert.ok(['ZIP_INVALID_PATH', 'ZIP_INVALID_ARCHIVE'].includes(error?.code));
      return true;
    }
  );

  const duplicatePath = path.join(directory, 'duplicate.zip');
  await writeRawZip(duplicatePath, [
    { archivePath: 'first.mp3', data: 'a' },
    { archivePath: 'other.mp3', data: 'b' }
  ]);
  await replaceAllSameLength(duplicatePath, 'other.mp3', 'first.mp3');
  await assert.rejects(
    openSafeZip(duplicatePath, { maxArchiveSize: 4096 }),
    expectCode('ZIP_DUPLICATE_PATH')
  );
});

test('enforces entry-count, single-file, and total declared-size limits', async t => {
  const directory = await makeTemporaryDirectory(t);
  const filePath = path.join(directory, 'limits.zip');
  await writeRawZip(filePath, [
    { archivePath: 'a.mp3', data: Buffer.alloc(6, 1) },
    { archivePath: 'b.mp3', data: Buffer.alloc(6, 2) },
    { archivePath: 'manifest.json', data: '{}' }
  ]);

  await assert.rejects(
    openSafeZip(filePath, { maxEntries: 2, maxEntrySize: 10, maxTotalSize: 100, maxArchiveSize: 4096 }),
    expectCode('ZIP_TOO_MANY_ENTRIES')
  );
  await assert.rejects(
    openSafeZip(filePath, { maxEntries: 5, maxEntrySize: 5, maxTotalSize: 100, maxArchiveSize: 4096 }),
    expectCode('ZIP_ENTRY_TOO_LARGE')
  );
  await assert.rejects(
    openSafeZip(filePath, { maxEntries: 5, maxEntrySize: 10, maxTotalSize: 10, maxArchiveSize: 4096 }),
    expectCode('ZIP_TOTAL_TOO_LARGE')
  );
});

test('checks actual inflated bytes when a ZIP directory understates the size', async t => {
  const directory = await makeTemporaryDirectory(t);
  const filePath = path.join(directory, 'size-lie.zip');
  await writeRawZip(filePath, [{ archivePath: 'bomb.mp3', data: Buffer.alloc(64 * 1024, 65) }]);
  await setCentralUncompressedSize(filePath, 'bomb.mp3', 8);

  const archive = await openSafeZip(filePath, {
    maxEntries: 2,
    maxEntrySize: 32,
    maxTotalSize: 128,
    maxArchiveSize: 4096
  });
  t.after(() => archive.close());
  await assert.rejects(
    archive.readBuffer('bomb.mp3', { maxSize: 32 }),
    error => {
      assert.ok([
        'ZIP_ENTRY_TOO_LARGE',
        'ZIP_ENTRY_SIZE_MISMATCH',
        'ZIP_ENTRY_READ_FAILED'
      ].includes(error?.code));
      return true;
    }
  );
});

test('rejects duplicate references and duplicate output paths', async t => {
  const directory = await makeTemporaryDirectory(t);
  const inputPath = path.join(directory, 'single.zip');
  await writeRawZip(inputPath, [{ archivePath: 'one.mp3', data: 'audio' }]);
  const archive = await openSafeZip(inputPath, { maxArchiveSize: 4096 });
  t.after(() => archive.close());
  await archive.readBuffer('one.mp3');
  await assert.rejects(archive.readBuffer('one.mp3'), expectCode('ZIP_DUPLICATE_READ'));

  await assert.rejects(
    writeSafeZipFile(path.join(directory, 'duplicate-output.zip'), [
      { archivePath: 'Audio/one.mp3', data: 'a' },
      { archivePath: 'audio/one.mp3', data: 'b' }
    ], { maxArchiveSize: 4096 }),
    expectCode('ZIP_DUPLICATE_PATH')
  );
});
