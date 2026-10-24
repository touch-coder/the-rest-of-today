import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
for (const path of ['src/app.js', 'src/storage.js']) {
  const target = resolve(dist, path);
  const source = await readFile(target, 'utf8');
  await writeFile(target, source.replaceAll('../../shared/', '../shared/').replaceAll('../../app/', '../app/'));
}
await cp(resolve(root, 'shared'), resolve(dist, 'shared'), { recursive: true });
await cp(resolve(root, 'app'), resolve(dist, 'app'), { recursive: true });
console.log('部署文件已生成至 dist/，包含网页、共享领域逻辑和原生桥接模块。');
