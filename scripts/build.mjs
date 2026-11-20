import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const path of ['index.html', 'styles.css', 'src']) {
  const source = resolve(root, 'web', path);
  const target = resolve(dist, path);
  await cp(source, target, { recursive: true });
}
for (const path of ['assets', 'manifest.webmanifest', 'sw.js', 'privacy']) {
  await cp(resolve(root, 'web', 'public', path), resolve(dist, path), { recursive: true });
}
// Every web module moves one directory closer to shared/ and app/ in dist.
// Keep this derived from the files, so new modules cannot miss the rewrite.
for (const entry of await readdir(resolve(dist, 'src'), { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
  const target = resolve(dist, 'src', entry.name);
  const source = await readFile(target, 'utf8');
  await writeFile(target, source.replaceAll('../../shared/', '../shared/').replaceAll('../../app/', '../app/'));
}
await cp(resolve(root, 'shared'), resolve(dist, 'shared'), { recursive: true });
await cp(resolve(root, 'app'), resolve(dist, 'app'), { recursive: true });
console.log('部署文件已生成至 dist/，包含网页、共享领域逻辑和原生桥接模块。');
