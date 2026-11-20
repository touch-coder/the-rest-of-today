// Isolated browser regression: legacy cache -> current release -> offline use.
// PLAYWRIGHT_MODULE and CHROME_EXECUTABLE can point to an existing test runtime.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createState, today, addDays, saveRecord } from '../shared/domain.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const scope = '/the-rest-of-today/';
let legacy = true, sourceRevision = false;
const legacyHtml = '<!doctype html><html lang="zh-CN"><link rel="icon" href="data:,"><div id="app"></div><script type="module" src="./src/app.js"></script></html>';
const legacyApp = `
  document.querySelector('#app').innerHTML='<h1>周月总结</h1><button id="update" hidden>更新应用</button>';
  let waiting;
  function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange',()=>{
      if(worker.state==='installed' && navigator.serviceWorker.controller) {
        waiting=worker; document.querySelector('#update').hidden=false;
      }
    });
  }
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    if(reg.waiting) {waiting=reg.waiting;document.querySelector('#update').hidden=false;}
    watch(reg.installing);reg.addEventListener('updatefound',()=>watch(reg.installing));
  });
  document.querySelector('#update').onclick=()=>waiting.postMessage('SKIP_WAITING');
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(waiting)location.reload();});
`;
// Same cache-first behavior and global cache namespace as the original release.
const legacyWorker = `
  const CACHE='sleeping-table-v1.0.1';
  self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./','./index.html','./src/app.js']))));
  self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch',event=>{
    event.respondWith(caches.match(event.request,{ignoreSearch:true}).then(cached=>cached||fetch(event.request)));
  });
`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(scope)) throw new Error('Outside app scope');
    const asset = pathname.slice(scope.length) || 'index.html';
    const file = resolve(root, asset);
    if (!file.startsWith(root + sep)) throw new Error('Outside dist');
    let content = legacy && asset === 'index.html' ? legacyHtml
      : legacy && asset === 'src/app.js' ? legacyApp
      : legacy && asset === 'sw.js' ? legacyWorker
      : await readFile(file);
    if (sourceRevision && asset === 'src/app.js') {
      content = content.toString().replace('<h1>睡眠总结</h1>', '<h1>睡眠总结 · 更新测试</h1>');
    }
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise(accept => server.listen(0, '127.0.0.1', accept));
const base = `http://127.0.0.1:${server.address().port}${scope}`;
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
    headless: true
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 });
  assert.equal(await page.locator('h1').innerText(), '周月总结');
  const date = today();
  const state = saveRecord(createState(), {
    id: 'upgrade-fixture', type: 'night', start: `${addDays(date, -1)}T23:00`, end: `${date}T07:00`, note: '升级测试样本'
  });
  const saved = JSON.stringify(state);
  await page.evaluate(async value => {
    localStorage.setItem('sleeping-table:v1', value);
    const cache = await caches.open('sleeping-table-other-installation');
    await cache.put('/unrelated-sentinel', new Response('preserve'));
  }, saved);
  legacy = false;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForSelector('#update:visible', { timeout: 10000 });
  assert.equal(await page.locator('h1').innerText(), '周月总结', 'Update must wait until saved edits can be preserved');
  await page.locator('#update').click();
  await page.waitForSelector('.sidebar [data-page="report"]', { timeout: 10000 });
  await page.locator('.sidebar [data-page="report"]').click();
  assert.equal(await page.locator('h1').innerText(), '睡眠总结');
  assert.equal(await page.locator('[data-action="report-week"]').innerText(), '每周总结');
  assert.equal(await page.locator('[data-action="report-month"]').innerText(), '每月总结');
  assert.equal(await page.locator('[data-stat="recorded-days"] strong').innerText(), '1天');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('sleeping-table:v1'))), state);
  assert.equal(await page.evaluate(async () => (await caches.open('sleeping-table-other-installation')).match('/unrelated-sentinel').then(r => r?.text())), 'preserve');
  console.log('PASS legacy cache upgrade on Pages subpath, update prompt, summary UI, saved sleep data and unrelated caches');

  // Leave sw.js unchanged: a source-only release must not stay stuck behind cache.
  sourceRevision = true;
  await page.reload();
  await page.locator('.sidebar [data-page="report"]').click();
  assert.equal(await page.locator('h1').innerText(), '睡眠总结 · 更新测试');
  await context.setOffline(true);
  await page.reload();
  await page.locator('.sidebar [data-page="report"]').click();
  assert.equal(await page.locator('h1').innerText(), '睡眠总结 · 更新测试');
  assert.equal(await page.locator('[data-stat="recorded-days"] strong').innerText(), '1天');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('../artifacts/update-summary-mobile.png', import.meta.url)), fullPage: true });
  console.log('PASS source-only release without cache bump, offline reload, mobile summary layout and zero runtime errors');
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(accept => server.close(accept));
}
