import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(root, { recursive: true })
  .filter((file) => ['.ts', '.tsx'].includes(extname(file)) && !file.includes('.check.'));

for (const file of files) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (line.includes('split(/[·,]/)')) return;
    if (/·|\p{Extended_Pictographic}/u.test(line)) throw new Error(`${file}:${index + 1} has a prohibited user-copy character`);
  });
}

console.log('user-copy.check passed: no central dots or pictographs in UI source');
