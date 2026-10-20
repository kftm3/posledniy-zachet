import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const root = 'dist';
assert(existsSync(join(root, 'index.html')), 'Run npm run build first');
const files = [join(root, 'index.html'), ...readdirSync(join(root, 'assets'))
  .filter(name => /\.(js|css)$/.test(name)).map(name => join(root, 'assets', name))];
const referenced = new Set();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\/(?:posledniy-zachet\/)?(?:assets|audio|video|fonts)\/[^\s"'`<>;}]*?\.(?:webp|png|jpe?g|mp3|wav|flac|mp4|woff2|otf|ttf|js|css)(?=["'`\s),;]|$)/g)) {
    const url = match[0];
    if (url.includes('${')) continue; // Dynamic branches checked below and by the browser tests.
    const relative = text[match.index - 1] === '.';
    assert(relative || url.startsWith('/posledniy-zachet/'), `Missing GitHub Pages base: ${url} in ${file}`);
    const path = join(root, decodeURI(url.replace(/^\/(?:posledniy-zachet\/)?/, '')));
    assert(existsSync(path), `Missing static asset: ${path} in ${file}`);
    referenced.add(path);
  }
}
for (const folder of [...Array.from({ length: 5 }, (_, i) => `student_boy${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `student_girl${i + 1}`), 'student_male6', 'student_male7']) {
  for (const name of ['normal', 'confident', 'smile', 'thinking', 'worried', 'card', 'card-256', 'card-512']) {
    assert(existsSync(join(root, 'assets/characters', folder, `${name}.webp`)), `${folder}/${name} is missing`);
  }
}
for (let i = 1; i <= 12; i++) {
  assert(existsSync(join(root, 'assets/achievements/icons', `achievement-${String(i).padStart(2, '0')}.webp`)));
}
// Safari cannot reliably sniff an MP3 prefixed with HTML (the former classroom file).
const classroomAudio = readFileSync(join(root, 'audio/classroom/C418-Aria_Math-clean.mp3'));
assert(classroomAudio[0] === 0xff && (classroomAudio[1] & 0xe0) === 0xe0,
  'Classroom music must start with an MPEG frame, without HTML or embedded cover art');
console.log(`Validated ${referenced.size} static asset references, all character variants and achievement icons.`);
