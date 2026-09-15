const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  SETTINGS_VERSION,
  createPersistentSettingsStore,
  consumeRemainingWinnerCount,
  finalizeLotteryBatch,
  reserveLotteryBatch,
  restoreRemainingWinnerCount,
  setRemainingWinnerCount
} = require('../persistent-settings.cjs');

function withTemporaryStore(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dycast-settings-'));
  try {
    return run(createPersistentSettingsStore(root), root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('persists settings sections and never writes a plaintext AI key', () => {
  withTemporaryStore((store) => {
    store.updateSection('app', {
      showGiftPrice: false,
      aiCurationEndpoint: 'https://example.com/v1/chat/completions',
      aiCurationApiKey: 'secret-key'
    });
    store.updateSection('danmu', { lotteryThreshold: 500, fontSize: 20 });

    const reloaded = createPersistentSettingsStore(store.rootDirectory).read();
    assert.equal(reloaded.sections.app.showGiftPrice, false);
    assert.equal(reloaded.sections.app.aiCurationApiKey, undefined);
    assert.deepEqual(reloaded.sections.danmu, { lotteryThreshold: 500, fontSize: 20 });
  });
});

test('seeds legacy settings once and preserves newer public settings', () => {
  withTemporaryStore((store) => {
    store.seedMissingSections({
      app: { giftHighlightDuration: 5 },
      audio: { masterVolume: 70, volumeNormalization: true, configs: {} }
    });
    store.updateSection('app', { giftHighlightDuration: 12 });
    store.seedMissingSections({
      app: { giftHighlightDuration: 3 },
      danmu: { redDanmuNicknameKeywords: '张总' }
    });

    const saved = store.read();
    assert.equal(saved.sections.app.giftHighlightDuration, 12);
    assert.equal(saved.sections.danmu.redDanmuNicknameKeywords, '张总');
    assert.equal(saved.sections.audio.masterVolume, 70);
  });
});

test('keeps a backup when the public settings file is corrupt', () => {
  withTemporaryStore((store, root) => {
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(store.filePath, '{broken', 'utf8');
    assert.deepEqual(store.read().sections, {});
    assert.equal(
      fs.readdirSync(root).some(name => /^settings\.corrupt-\d+(?:-[a-z0-9]+)?\.json$/.test(name)),
      true
    );
  });
});

test('rejects unknown sections and oversized payloads', () => {
  withTemporaryStore((store) => {
    assert.throws(() => store.updateSection('unknown', {}), /不支持的设置分区/);
    assert.throws(
      () => store.updateSection('app', { value: 'x'.repeat(129 * 1024) }),
      /超过大小限制/
    );
  });
});

test('upgrades older documents to the current schema version', () => {
  withTemporaryStore((store) => {
    fs.mkdirSync(store.rootDirectory, { recursive: true });
    fs.writeFileSync(store.filePath, JSON.stringify({
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
      sections: { windows: { sidebarAlwaysOnTop: true } }
    }), 'utf8');

    const saved = store.read();
    assert.equal(saved.version, SETTINGS_VERSION);
    assert.equal(saved.sections.windows.sidebarAlwaysOnTop, true);
    assert.equal(JSON.parse(fs.readFileSync(store.filePath, 'utf8')).version, SETTINGS_VERSION);
  });
});

test('recovers the previous settings file after an interrupted replacement', () => {
  withTemporaryStore((store) => {
    store.updateSection('app', { showGiftPrice: false });
    fs.unlinkSync(store.filePath);

    const recovered = store.read();
    assert.equal(recovered.sections.app.showGiftPrice, false);
    assert.equal(fs.existsSync(store.filePath), true);
    assert.equal(fs.existsSync(store.previousPath), true);
  });
});

test('does not downgrade or rewrite a document created by a future version', () => {
  withTemporaryStore((store) => {
    const futureDocument = {
      version: SETTINGS_VERSION + 3,
      updatedAt: '2030-01-02T03:04:05.000Z',
      futureMetadata: { channel: 'next' },
      sections: {
        app: { showGiftPrice: true, futureDisplayMode: 'hologram' },
        futurePlugin: { enabled: true, options: { intensity: 8 } }
      }
    };
    const serialized = `${JSON.stringify(futureDocument, null, 2)}\n`;
    fs.mkdirSync(store.rootDirectory, { recursive: true });
    fs.writeFileSync(store.filePath, serialized, 'utf8');

    const loaded = store.read();

    assert.equal(loaded.version, SETTINGS_VERSION + 3);
    assert.equal(loaded.sections.app.futureDisplayMode, 'hologram');
    assert.deepEqual(loaded.sections.futurePlugin, futureDocument.sections.futurePlugin);
    assert.deepEqual(loaded.futureMetadata, futureDocument.futureMetadata);
    assert.equal(fs.readFileSync(store.filePath, 'utf8'), serialized);
    assert.equal(fs.existsSync(store.previousPath), false);
  });
});

test('updating a known section preserves future versions, sections, and fields', () => {
  withTemporaryStore((store) => {
    fs.mkdirSync(store.rootDirectory, { recursive: true });
    fs.writeFileSync(store.filePath, JSON.stringify({
      version: SETTINGS_VERSION + 1,
      updatedAt: '2030-01-02T03:04:05.000Z',
      futureMetadata: { format: 'extended' },
      sections: {
        app: {
          showGiftPrice: true,
          futureDisplayMode: 'hologram',
          futureOptions: { glow: true, palette: { primary: '#00ffaa' } }
        },
        futurePlugin: { enabled: true, options: { intensity: 8 } }
      }
    }), 'utf8');

    const saved = store.updateSection('app', { showGiftPrice: false });
    const onDisk = JSON.parse(fs.readFileSync(store.filePath, 'utf8'));
    const previous = JSON.parse(fs.readFileSync(store.previousPath, 'utf8'));

    assert.equal(saved.version, SETTINGS_VERSION + 1);
    assert.equal(onDisk.version, SETTINGS_VERSION + 1);
    assert.equal(onDisk.sections.app.showGiftPrice, false);
    assert.equal(onDisk.sections.app.futureDisplayMode, 'hologram');
    assert.deepEqual(onDisk.sections.app.futureOptions, {
      glow: true,
      palette: { primary: '#00ffaa' }
    });
    assert.deepEqual(onDisk.sections.futurePlugin, { enabled: true, options: { intensity: 8 } });
    assert.deepEqual(onDisk.futureMetadata, { format: 'extended' });
    assert.equal(previous.version, SETTINGS_VERSION + 1);
    assert.equal(previous.sections.app.showGiftPrice, true);
  });
});

test('keeps the latest valid backup and restores it when the current file is corrupt', () => {
  withTemporaryStore((store, root) => {
    store.updateSection('app', { displayTheme: 'first' });
    assert.equal(fs.existsSync(store.previousPath), true);
    store.updateSection('app', { displayTheme: 'second' });

    const backupBeforeCorruption = JSON.parse(fs.readFileSync(store.previousPath, 'utf8'));
    assert.equal(backupBeforeCorruption.sections.app.displayTheme, 'first');
    fs.writeFileSync(store.filePath, '{broken', 'utf8');

    const recovered = store.read();
    const restoredCurrent = JSON.parse(fs.readFileSync(store.filePath, 'utf8'));
    const retainedBackup = JSON.parse(fs.readFileSync(store.previousPath, 'utf8'));

    assert.equal(recovered.sections.app.displayTheme, 'first');
    assert.equal(restoredCurrent.sections.app.displayTheme, 'first');
    assert.equal(retainedBackup.sections.app.displayTheme, 'first');
    assert.equal(
      fs.readdirSync(root).some(name => /^settings\.corrupt-\d+(?:-[a-z0-9]+)?\.json$/.test(name)),
      true
    );
  });
});

test('atomically consumes remaining winner slots from the canonical app section', () => {
  withTemporaryStore((store) => {
    store.updateSection('app', {
      remainingWinnerCount: 10,
      liveCountdownRunning: true
    });

    const first = consumeRemainingWinnerCount(store, 6);
    const second = consumeRemainingWinnerCount(store, 6);
    const saved = store.read().sections.app;

    assert.deepEqual(
      { consumed: first.consumed, remaining: first.remainingWinnerCount },
      { consumed: 6, remaining: 4 }
    );
    assert.deepEqual(
      { consumed: second.consumed, remaining: second.remainingWinnerCount },
      { consumed: 4, remaining: 0 }
    );
    assert.equal(saved.remainingWinnerCount, 0);
    assert.equal(saved.liveCountdownRunning, true);
  });
});

test('serializes explicit winner-count changes, reservations, and cancelled-batch refunds', () => {
  withTemporaryStore((store) => {
    store.updateSection('app', { remainingWinnerCount: 3, futureField: 'kept' });

    const set = setRemainingWinnerCount(store, 12);
    const consumed = consumeRemainingWinnerCount(store, 5);
    const restored = restoreRemainingWinnerCount(store, 2);
    const saved = store.read().sections.app;

    assert.equal(set.remainingWinnerCount, 12);
    assert.deepEqual(
      { consumed: consumed.consumed, remaining: consumed.remainingWinnerCount },
      { consumed: 5, remaining: 7 }
    );
    assert.deepEqual(
      { restored: restored.restored, remaining: restored.remainingWinnerCount },
      { restored: 2, remaining: 9 }
    );
    assert.equal(saved.remainingWinnerCount, 9);
    assert.equal(saved.futureField, 'kept');
  });
});

test('lottery batch reservations are idempotent across restart and refunds happen once', () => {
  withTemporaryStore((store) => {
    store.updateSection('app', { remainingWinnerCount: 5, futureField: 'kept' });

    const first = reserveLotteryBatch(store, { batchId: 'batch-safe-1', requested: 3 });
    const retriedAfterRestart = reserveLotteryBatch(
      createPersistentSettingsStore(store.rootDirectory),
      { batchId: 'batch-safe-1', requested: 3 }
    );
    assert.deepEqual(
      { reserved: first.reserved, remaining: first.remainingWinnerCount, status: first.status },
      { reserved: 3, remaining: 2, status: 'active' }
    );
    assert.deepEqual(
      { reserved: retriedAfterRestart.reserved, remaining: retriedAfterRestart.remainingWinnerCount },
      { reserved: 3, remaining: 2 }
    );

    const finalized = finalizeLotteryBatch(store, { batchId: 'batch-safe-1', unrevealed: 2 });
    const duplicateFinalize = finalizeLotteryBatch(
      createPersistentSettingsStore(store.rootDirectory),
      { batchId: 'batch-safe-1', unrevealed: 2 }
    );
    assert.deepEqual(
      { restored: finalized.restored, remaining: finalized.remainingWinnerCount, status: finalized.status },
      { restored: 2, remaining: 4, status: 'finalized' }
    );
    assert.deepEqual(
      { restored: duplicateFinalize.restored, remaining: duplicateFinalize.remainingWinnerCount },
      { restored: 0, remaining: 4 }
    );
    assert.equal(store.read().sections.app.futureField, 'kept');
  });
});

test('adopts an old pending batch without charging it a second time', () => {
  withTemporaryStore((store) => {
    store.updateSection('app', { remainingWinnerCount: 7 });

    const adopted = reserveLotteryBatch(store, {
      batchId: 'legacy-batch-1',
      requested: 2,
      legacyAlreadyReserved: true
    });
    const finalized = finalizeLotteryBatch(store, {
      batchId: 'legacy-batch-1',
      unrevealed: 2
    });

    assert.equal(adopted.reserved, 2);
    assert.equal(adopted.remainingWinnerCount, 7);
    assert.equal(finalized.restored, 2);
    assert.equal(finalized.remainingWinnerCount, 9);
  });
});
