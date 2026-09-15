const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateHighlightWindowBounds,
  calculateResizeBounds,
  fitAspectRatioBounds,
  fitWindowBoundsToWorkArea,
  normalizeWindowSize
} = require('../window-layout.cjs');

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

test('resizes the sidebar from the bottom-left while keeping its right edge fixed', () => {
  const result = calculateResizeBounds({
    bounds: { x: 1438, y: 12, width: 470, height: 920 },
    workArea,
    minimumWidth: 380,
    minimumHeight: 620,
    edge: 'bottom-left',
    deltaX: -120,
    deltaY: 80
  });
  assert.deepEqual(result, { x: 1318, y: 12, width: 590, height: 1000 });
  assert.equal(result.x + result.width, 1908);
});

test('resizes highlight windows from the bottom-right and clamps them to the work area', () => {
  const result = calculateResizeBounds({
    bounds: { x: 420, y: 180, width: 1080, height: 680 },
    workArea,
    minimumWidth: 680,
    minimumHeight: 520,
    edge: 'bottom-right',
    deltaX: 900,
    deltaY: 900
  });
  assert.deepEqual(result, { x: 420, y: 180, width: 1500, height: 900 });
});

test('normalizes persisted window sizes and rejects invalid values', () => {
  assert.deepEqual(normalizeWindowSize({ width: 300, height: 400 }, 380, 620), { width: 380, height: 620 });
  assert.deepEqual(normalizeWindowSize({ width: 500.4, height: 700.6 }, 380, 620), { width: 500, height: 701 });
  assert.equal(normalizeWindowSize({ width: 'invalid', height: 700 }, 380, 620), null);
});

test('resizes the live overlay from the bottom-right while preserving its aspect ratio', () => {
  const horizontalResize = calculateResizeBounds({
    bounds: { x: 100, y: 100, width: 1080, height: 200 },
    workArea,
    minimumWidth: 648,
    minimumHeight: 120,
    edge: 'bottom-right',
    deltaX: 270,
    deltaY: 10,
    aspectRatio: 5.4
  });
  assert.deepEqual(horizontalResize, { x: 100, y: 100, width: 1350, height: 250 });

  const verticalResize = calculateResizeBounds({
    bounds: { x: 100, y: 100, width: 1080, height: 200 },
    workArea,
    minimumWidth: 648,
    minimumHeight: 120,
    edge: 'bottom-right',
    deltaX: 10,
    deltaY: 100,
    aspectRatio: 5.4
  });
  assert.deepEqual(verticalResize, { x: 100, y: 100, width: 1620, height: 300 });
});

test('clamps aspect-ratio resize to the work area and compatible minimum size', () => {
  const expanded = calculateResizeBounds({
    bounds: { x: 420, y: 180, width: 1080, height: 200 },
    workArea,
    minimumWidth: 648,
    minimumHeight: 120,
    edge: 'bottom-right',
    deltaX: 2000,
    deltaY: 2000,
    aspectRatio: 5.4
  });
  assert.deepEqual(expanded, { x: 420, y: 180, width: 1500, height: 278 });

  const shrunk = calculateResizeBounds({
    bounds: { x: 100, y: 100, width: 1080, height: 200 },
    workArea,
    minimumWidth: 648,
    minimumHeight: 120,
    edge: 'bottom-right',
    deltaX: -1000,
    deltaY: -1000,
    aspectRatio: 5.4
  });
  assert.deepEqual(shrunk, { x: 100, y: 100, width: 648, height: 120 });
});

test('corrects legacy overlay proportions and keeps restored bounds visible', () => {
  const corrected = fitAspectRatioBounds({
    bounds: { x: 2100, y: -80, width: 1080, height: 608 },
    workArea,
    aspectRatio: 5.4,
    minimumWidth: 648,
    minimumHeight: 120
  });
  assert.deepEqual(corrected, { x: 840, y: 0, width: 1080, height: 200 });

  const relocated = fitAspectRatioBounds({
    bounds: { x: 2300, y: 1200, width: 2400, height: 444 },
    workArea,
    aspectRatio: 5.4,
    minimumWidth: 648,
    minimumHeight: 120
  });
  assert.deepEqual(relocated, { x: 0, y: 724, width: 1920, height: 356 });
});

test('fits an auxiliary window inside a mixed-coordinate work area', () => {
  const result = fitWindowBoundsToWorkArea({
    bounds: { x: 0, y: 1000, width: 1400, height: 900 },
    workArea: { x: 1920, y: -100, width: 1280, height: 720 },
    margin: 24,
    minimumWidth: 680,
    minimumHeight: 520
  });
  assert.deepEqual(result, { x: 1944, y: -76, width: 1232, height: 672 });
});

test('reduces effective minimums safely on an unusually small work area', () => {
  const result = fitWindowBoundsToWorkArea({
    bounds: { x: 500, y: 500, width: 1080, height: 780 },
    workArea: { x: 0, y: 0, width: 40, height: 30 },
    margin: 24,
    minimumWidth: 680,
    minimumHeight: 520,
    center: true
  });
  assert.deepEqual(result, { x: 19, y: 14, width: 1, height: 1 });
});

test('keeps a saved highlight size for short content', () => {
  const result = calculateHighlightWindowBounds({
    workArea,
    preferredSize: { width: 900, height: 520 },
    content: '短弹幕'
  });
  assert.deepEqual(result, { x: 510, y: 280, width: 900, height: 520 });
});

test('temporarily expands a saved short highlight window for long content', () => {
  const result = calculateHighlightWindowBounds({
    workArea,
    preferredSize: { width: 1080, height: 520 },
    content: '长'.repeat(500)
  });
  assert.deepEqual(result, { x: 420, y: 150, width: 1080, height: 780 });
});

test('counts explicit line breaks and caps highlight expansion to the visible work area', () => {
  const lineBreaks = calculateHighlightWindowBounds({
    workArea,
    preferredSize: { width: 1080, height: 520 },
    content: '第一行\n\n第三行'
  });
  assert.deepEqual(lineBreaks, { x: 420, y: 279, width: 1080, height: 522 });

  const constrained = calculateHighlightWindowBounds({
    workArea: { x: 1920, y: -100, width: 800, height: 600 },
    preferredSize: { width: 1080, height: 520 },
    content: '长'.repeat(500)
  });
  assert.deepEqual(constrained, { x: 1944, y: -76, width: 752, height: 552 });
});
