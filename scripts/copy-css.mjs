import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, 'css');
const to = join(root, 'dist');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });

console.log('CSS copied to dist/');
