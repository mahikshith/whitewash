import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../dist/theme.js', import.meta.url), 'utf8');

function boot({ saved = null, darkSystem = false, blocked = false } = {}) {
  const root = { dataset: {} };
  const attributes = {};
  const writes = [];
  let ready = false;
  let initialize;
  let click;
  let systemChange;
  const button = { setAttribute: (name, value) => { attributes[name] = value; }, addEventListener: (_, fn) => { click = fn; } };
  const icon = {};
  const system = { matches: darkSystem, addEventListener: (_, fn) => { systemChange = fn; } };
  const document = {
    documentElement: root,
    getElementById: (id) => ready ? (id === 'theme-toggle' ? button : icon) : null,
    addEventListener: (_, fn) => { initialize = fn; },
  };
  runInNewContext(script, { document, window: {
    matchMedia: () => system,
    localStorage: {
      getItem: () => { if (blocked) throw new Error('Storage disabled'); return saved; },
      setItem: (key, value) => { if (blocked) throw new Error('Storage disabled'); writes.push([key, value]); },
    },
  } });
  return { root, attributes, writes, button,
    ready: () => { ready = true; initialize(); },
    toggle: () => click(),
    changeSystem: (dark) => { system.matches = dark; systemChange(); },
  };
}

test('device theme applies before controls load and follows device changes', () => {
  const page = boot({ darkSystem: true });
  assert.equal(page.root.dataset.theme, 'dark');
  page.ready();
  assert.equal(page.attributes['aria-pressed'], 'true');
  page.changeSystem(false);
  assert.equal(page.root.dataset.theme, 'light');
});

test('saved choice overrides the device; switching stores only the appearance choice', () => {
  const page = boot({ saved: 'light', darkSystem: true });
  page.ready();
  assert.equal(page.root.dataset.theme, 'light');
  page.toggle();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.attributes['aria-pressed'], 'true');
  assert.equal(page.button.title, 'Switch to light mode');
  assert.deepEqual(page.writes, [['whitewash-theme', 'dark']]);
  page.changeSystem(false);
  assert.equal(page.root.dataset.theme, 'dark');
});

test('disabled storage does not break initialization or switching', () => {
  const page = boot({ blocked: true });
  page.ready();
  page.toggle();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.writes.length, 0);
});

test('unrecognized saved values fall back to the device preference', () => {
  const page = boot({ saved: 'unexpected', darkSystem: true });
  assert.equal(page.root.dataset.theme, 'dark');
});
