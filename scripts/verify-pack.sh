#!/usr/bin/env bash
# Builds the package, packs the actual npm tarball, and installs *that
# tarball* (not source) into a throwaway consumer fixture, then verifies
# the distributed JS, CSS exports, and types resolve the way a real
# consumer's bundler/Node resolution would see them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# `npm pack` runs the `prepack` lifecycle script (which builds) itself, so
# we don't need to build separately here — doing so would just make the
# build run twice. `prepack`'s own stdout is interleaved with npm's, so we
# take only the last line, which is npm's actual tarball filename output.
TARBALL="$(npm pack --silent | tail -n1)"
TARBALL_PATH="$ROOT/$TARBALL"
echo "Packed: $TARBALL"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"; rm -f "$TARBALL_PATH"' EXIT

mkdir -p "$WORKDIR/consumer"
cd "$WORKDIR/consumer"
cat > package.json <<'EOF'
{ "name": "consumer-fixture", "version": "0.0.0", "type": "module", "private": true }
EOF

npm install "$TARBALL_PATH" --silent --no-audit --no-fund >/dev/null

node -e "
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cssPath = require.resolve('csp-safe-slider/styles.css');
assert.ok(fs.existsSync(cssPath), 'styles.css should resolve and exist');
assert.match(fs.readFileSync(cssPath, 'utf8'), /csp-slider__track/, 'styles.css should contain expected class');

const themePath = require.resolve('csp-safe-slider/theme.css');
assert.ok(fs.existsSync(themePath), 'theme.css should resolve and exist');

const dtsPath = path.join(require.resolve('csp-safe-slider'), '..', 'index.d.ts');
assert.ok(fs.existsSync(dtsPath), 'index.d.ts should exist next to the CJS entry');

const cjs = require('csp-safe-slider');
assert.equal(typeof cjs.createSlider, 'function', 'CJS import: createSlider should be a function');
console.log('CJS require() resolution: OK');
"

node --input-type=module -e "
import assert from 'node:assert/strict';
import { createSlider } from 'csp-safe-slider';
assert.equal(typeof createSlider, 'function', 'ESM import: createSlider should be a function');
console.log('ESM import resolution: OK');
"

echo "PASS: packed tarball installs and resolves JS/CSS/types like a real consumer."
