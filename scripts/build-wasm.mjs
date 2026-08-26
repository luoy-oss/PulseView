import { mkdir, rename, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = path.join(root, 'wasm-core', 'Cargo.toml');
const wasm = path.join(root, 'wasm-core', 'target', 'wasm32-unknown-unknown', 'release', 'pulseview_wasm_core.wasm');
const output = path.join(root, 'src', 'wasm', 'pkg');
const staging = path.join(root, 'src', 'wasm', '.pkg-staging');

function run(command, args) {
  const executable = process.platform === 'win32' ? `${command}.exe` : command;
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') {
    throw new Error(`${command} is not installed or is not on PATH`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
run('cargo', ['build', '--manifest-path', manifest, '--target', 'wasm32-unknown-unknown', '--release']);
run('wasm-bindgen', [wasm, '--target', 'web', '--out-dir', staging, '--out-name', 'pulseview_wasm_core']);
await rm(output, { recursive: true, force: true });
await rename(staging, output);
