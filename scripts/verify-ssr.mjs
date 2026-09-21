// Verifies the distributed entry point can be imported in a plain Node
// process with no `window`/`document` at all (true SSR, not a jsdom
// simulation) without throwing at import time.
import assert from 'node:assert/strict';

assert.equal(typeof globalThis.window, 'undefined', 'expected no window global in this check');
assert.equal(typeof globalThis.document, 'undefined', 'expected no document global in this check');

const esm = await import('../dist/index.js');
assert.equal(typeof esm.createSlider, 'function', 'ESM: createSlider export missing');

const require = (await import('node:module')).createRequire(import.meta.url);
const cjs = require('../dist/index.cjs');
assert.equal(typeof cjs.createSlider, 'function', 'CJS: createSlider export missing');

console.log('OK: ESM and CJS entry points import cleanly with no window/document present.');
