#!/usr/bin/env node
/* Local rebuild: `node tools/build.mjs`
   Reads data/projects.json and regenerates all project pages, the home/gallery blocks and sitemap.xml.
   Not needed when you publish through /admin/ (the admin does the same thing in the browser). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../admin/build.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const data = JSON.parse(read('data/projects.json'));
const files = {};
for (const rel of ['index.html', 'ua/index.html', 'gallery.html', 'ua/gallery.html']) files[rel] = read(rel);

const { out, generated } = buildSite(data, files);

let changed = 0;
for (const [rel, text] of Object.entries(out)) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const old = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  if (old !== text) { fs.writeFileSync(full, text); changed++; }
}

let removed = 0;
for (const dir of ['projects', 'ua/projects']) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  for (const name of fs.readdirSync(full)) {
    const rel = `${dir}/${name}`;
    if (name.endsWith('.html') && !generated.has(rel)) { fs.unlinkSync(path.join(root, rel)); removed++; }
  }
}
console.log(`Готово: оновлено файлів — ${changed}, видалено застарілих сторінок — ${removed}`);

const missing = [...new Set(data.projects.flatMap((p) => [...p.files, ...(p.video ? [p.video] : [])]))]
  .filter((f) => !fs.existsSync(path.join(root, 'images', f)));
if (missing.length) console.log(`УВАГА: у папці images немає файлів: ${missing.join(', ')}`);
