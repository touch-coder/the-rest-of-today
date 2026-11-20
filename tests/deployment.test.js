import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const sw = await readFile(new URL('../web/public/sw.js', import.meta.url), 'utf8');
const assets = [...sw.match(/const ASSETS = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);

test('every Service Worker precache URL is served in development, including index.html', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: root, env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    const port = await new Promise((accept, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Development server did not start')), 5000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) { clearTimeout(timer); accept(match[1]); }
      });
    });
    const base = `http://127.0.0.1:${port}/`;
    for (const asset of assets) {
      const response = await fetch(new URL(asset, base));
      assert.equal(response.status, 200, `Precache install would fail: ${asset}`);
    }
    assert.equal(await (await fetch(`${base}index.html`)).text(), await (await fetch(base)).text());
  } finally {
    child.kill();
  }
});

test('built module graph and precache assets stay inside a GitHub Pages subdirectory', { timeout: 15000 }, async () => {
  await run(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const base = new URL('https://example.invalid/the-rest-of-today/');
  const pending = [new URL('src/app.js', base)];
  const seen = new Set();
  for (const asset of assets) {
    await readFile(resolve(root, 'dist', asset === './' ? 'index.html' : asset));
  }
  while (pending.length) {
    const url = pending.pop();
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    assert.ok(url.pathname.startsWith(base.pathname), `Import escaped the deployed app: ${url.href}`);
    const source = await readFile(resolve(root, 'dist', url.pathname.slice(base.pathname.length)), 'utf8');
    for (const [, specifier] of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.\.?\/[^'"]+)['"]/g)) {
      pending.push(new URL(specifier, url));
    }
  }
  assert.ok(seen.has(new URL('src/charts.js', base).href));
  assert.ok(seen.has(new URL('shared/domain.js', base).href));
});
