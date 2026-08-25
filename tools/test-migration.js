'use strict';

/**
 * The v1→v2 settings migration.
 *
 * Changing a default is not enough on its own: v1 wrote its size filters to
 * disk, and a stored setting outranks a default, so every existing install
 * would keep hiding 96GB cards after an update. This checks the migration
 * clears exactly those stale defaults and nothing a user actually picked.
 */
const V1_DEFAULT_RAM = [16, 32, 48, 64];
const V1_DEFAULT_VRAM = [16, 32];
const sameList = (a, b) => Array.isArray(a) && a.length === b.length && b.every((v, i) => a[i] === v);

// A stand-in for the Store, so this runs without Electron.
function fakeStore(initial) {
  let settings = { ...initial };
  return {
    getSettings: () => settings,
    setSettings: (patch) => {
      settings = { ...settings, ...patch };
    },
    read: () => settings
  };
}

// Mirrors main.js migrateSettings.
const DEFAULTS = { settingsVersion: 2, autoRefreshMinutes: 30, refreshOnLaunch: true, countries: ['IN'], ramCapacities: [], gpuVram: [] };
function migrateSettings(store) {
  const s = store.getSettings();
  if (!Object.keys(s).length) return store.setSettings(DEFAULTS);
  if (Number(s.settingsVersion) >= 2) return;
  const patch = { settingsVersion: 2 };
  if (sameList(s.ramCapacities, V1_DEFAULT_RAM)) patch.ramCapacities = [];
  if (sameList(s.gpuVram, V1_DEFAULT_VRAM)) patch.gpuVram = [];
  store.setSettings(patch);
}

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? 'ok   ' : 'FAIL '} ${name}${ok || !detail ? '' : '\n          ' + detail}`);
  if (!ok) failures++;
};

// 1. A fresh profile.
let st = fakeStore({});
migrateSettings(st);
check('empty profile gets the v2 defaults', st.read().settingsVersion === 2 && st.read().gpuVram.length === 0);

// 2. The exact v1 profile — the case that broke.
st = fakeStore({ autoRefreshMinutes: 30, refreshOnLaunch: true, countries: ['IN', 'SG'], ramCapacities: [16, 32, 48, 64], gpuVram: [16, 32] });
migrateSettings(st);
check('v1 stale size defaults are cleared', st.read().gpuVram.length === 0 && st.read().ramCapacities.length === 0);
check('v1 migration stamps version 2', st.read().settingsVersion === 2);
check('v1 migration preserves unrelated settings', st.read().autoRefreshMinutes === 30 && st.read().countries.length === 2);

// 3. A deliberate user choice must survive.
st = fakeStore({ ramCapacities: [96], gpuVram: [24, 32], settingsVersion: 1 });
migrateSettings(st);
check('a chosen VRAM selection is not cleared', sameList(st.read().gpuVram, [24, 32]), JSON.stringify(st.read().gpuVram));
check('a chosen kit selection is not cleared', sameList(st.read().ramCapacities, [96]));

// 4. Partial match: only the one that matches the old default is cleared.
st = fakeStore({ ramCapacities: [16, 32, 48, 64], gpuVram: [48] });
migrateSettings(st);
check('only the stale list is cleared', st.read().ramCapacities.length === 0 && sameList(st.read().gpuVram, [48]));

// 5. Idempotent — running twice must not clear a later deliberate choice.
st = fakeStore({ ramCapacities: [16, 32, 48, 64], gpuVram: [16, 32] });
migrateSettings(st);
st.setSettings({ gpuVram: [16, 32] }); // user re-picks these on purpose
migrateSettings(st);
check('migration does not re-run once stamped', sameList(st.read().gpuVram, [16, 32]));

// 6. Same order, different content must not be mistaken for the default.
st = fakeStore({ gpuVram: [32, 16] });
migrateSettings(st);
check('a reordered list is treated as a user choice', sameList(st.read().gpuVram, [32, 16]));

// 7. Against the real settings file on this machine, if present.
const fs = require('fs');
const path = require('path');
const real = path.join(process.env.APPDATA || '', 'PCComponentsWatcher', 'ramwatch-data.json');
if (fs.existsSync(real)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(real, 'utf8'));
    const before = parsed.settings || {};
    const s2 = fakeStore(before);
    migrateSettings(s2);
    const after = s2.read();
    console.log(`\n  real profile: gpuVram ${JSON.stringify(before.gpuVram)} -> ${JSON.stringify(after.gpuVram)}`);
    console.log(`                ramCapacities ${JSON.stringify(before.ramCapacities)} -> ${JSON.stringify(after.ramCapacities)}`);
    check('the real profile ends with no size filter', (after.gpuVram || []).length === 0 && (after.ramCapacities || []).length === 0);
  } catch (err) {
    console.log('  (could not read the real profile: ' + err.message + ')');
  }
}

if (failures) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log('\nmigration behaves correctly.');
