import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

// Baseline enforcing policy: `*-attr`/`*-elem` granularity, everything else
// locked to 'none' or 'self'. This is the primary contract under test.
export const STRICT_CSP =
  "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self'; " +
  "style-src-elem 'self'; style-src-attr 'none'; img-src 'self'; media-src 'self'; " +
  "font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; " +
  "frame-ancestors 'none'; form-action 'none'";

// Fallback policy: only the coarse directives, no `*-attr`/`*-elem` split.
// Proves the package doesn't rely on the finer-grained directives existing.
export const FALLBACK_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
  "media-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; " +
  "base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

function policyFor(pathname) {
  if (pathname.startsWith('/fallback/')) return FALLBACK_CSP;
  return STRICT_CSP;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    // Map /dist/* to the built package output so fixtures import the real
    // distributed artifact, not source.
    let filePath;
    if (pathname.startsWith('/dist/')) {
      filePath = join(REPO_ROOT, pathname);
    } else if (pathname.startsWith('/fallback/')) {
      const rest = pathname.slice('/fallback/'.length) || 'strict.html';
      filePath = join(ROOT, rest);
    } else {
      filePath = join(ROOT, pathname === '/' ? 'strict.html' : pathname);
    }

    filePath = normalize(filePath);
    if (!filePath.startsWith(REPO_ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const data = await readFile(filePath);
      const ext = extname(filePath);
      res.setHeader('Content-Security-Policy', policyFor(pathname));
      res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
      res.writeHead(200);
      res.end(data);
    } catch {
      res.setHeader('Content-Security-Policy', policyFor(pathname));
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 4173;
  createServer().listen(port, () => {
    console.log(`CSP fixture server listening on http://localhost:${port}`);
  });
}
