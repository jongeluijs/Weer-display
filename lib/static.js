import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const ALLOWED = new Set(Object.keys(MIME));

export function createStatic({ publicDir }) {
  const root = path.resolve(publicDir);

  async function serve(req, res, urlPath) {
    // normaliseer en bescherm tegen path traversal
    const decoded = decodeURIComponent(urlPath.split('?')[0]);
    const rel = decoded.replace(/^\/+/, '');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(abs).toLowerCase();
    if (!ALLOWED.has(ext)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    try {
      const stat = await fsp.stat(abs);
      if (!stat.isFile()) throw new Error('not a file');
      const headers = {
        'Content-Type': MIME[ext],
        'Content-Length': stat.size,
      };
      if (ext === '.html') {
        headers['Cache-Control'] = 'no-cache';
      } else {
        headers['Cache-Control'] = 'public, max-age=300';
      }
      res.writeHead(200, headers);
      fs.createReadStream(abs).pipe(res);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }

  return { serve, root };
}
