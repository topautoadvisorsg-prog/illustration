import { spawnSync } from 'node:child_process';

function run(command, args) {
  if (process.platform === 'win32' && command === 'corepack') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', command, ...args], { stdio: 'inherit' });
  }

  return spawnSync(command, args, { stdio: 'inherit' });
}

const steps = [
  ['corepack', ['yarn', 'workspace', '@wildlands/shared', 'build']],
  ['corepack', ['yarn', 'workspace', '@wildlands/backend', 'typecheck']],
  ['corepack', ['yarn', 'workspace', '@wildlands/backend', 'test']],
  ['corepack', ['yarn', 'workspace', 'frontend', 'build']],
  ['node', ['scripts/audit-layout-library.mjs']],
];

for (const [command, args] of steps) {
  const label = `${command} ${args.join(' ')}`;
  console.log(`\n==> ${label}`);
  const result = run(command, args);
  if (result.status !== 0) {
    console.error(`\nVerification failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nAutonomous verification passed.');
