const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('lottery blocker details live only in the lottery settings status card', () => {
  const settingsDialog = read('src/components/SettingsDialog.vue');
  const energyBar = read('src/components/danmu/EnergyBar.vue');
  const chargingStart = read('src/components/danmu/ChargingStart.vue');
  const quickControls = read('src/components/LiveOverlayQuickControls.vue');

  assert.match(settingsDialog, /class="setting-card lottery-auto-status-card"/);
  assert.match(settingsDialog, /未开奖原因：剩余中奖名额为 0/);
  assert.match(settingsDialog, /当前主播灯牌 ≥ \$\{badgeLevel\} 级/);
  assert.match(settingsDialog, /无人满足时不会开奖/);

  assert.match(energyBar, /return '能量已充满'/);
  assert.match(energyBar, /return 'ENERGY FULL'/);
  for (const liveSurface of [energyBar, chargingStart, quickControls]) {
    assert.doesNotMatch(liveSurface, /未开奖原因：剩余中奖名额为 0/);
    assert.doesNotMatch(liveSurface, /无人满足时不会开奖/);
  }
});
