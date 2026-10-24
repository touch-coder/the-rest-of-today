import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  const result = spawnSync(npx, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['vite', 'build']);
for (const platform of ['ios', 'android']) {
  if (!existsSync(platform)) run(['cap', 'add', platform]);
}
run(['cap', 'sync']);
