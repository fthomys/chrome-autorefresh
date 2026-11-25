import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')).version;
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (manifest !== pkg) {
  console.error(`Version mismatch: manifest.json has ${manifest}, package.json has ${pkg}.`);
  process.exit(1);
}

const out = `autorefresh-${manifest}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-qr', `../${out}`, '.', '-x', '*.DS_Store'], { cwd: 'dist', stdio: 'inherit' });
console.log(out);
