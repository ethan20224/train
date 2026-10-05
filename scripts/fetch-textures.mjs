// Downloads CC0 PBR texture sets (diffuse, GL normal, packed ARM) from Poly Haven into public/textures/<name>/.
// API: GET https://api.polyhaven.com/files/<id> -> { Diffuse|nor_gl|arm: { "<res>": { jpg: { url, md5, size } } } }
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/materials/textureManifest.json'), 'utf8'));
const UA = { 'User-Agent': 'GrandMeridianTerminal/0.1 (texture fetch script)' };
const MAPS = [['Diffuse', 'diff'], ['nor_gl', 'nor'], ['arm', 'arm']];
const outRoot = path.join(root, 'public/textures');

async function getJSON(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

const credits = [];
for (const [name, spec] of Object.entries(manifest.textures)) {
  const files = await getJSON(`https://api.polyhaven.com/files/${spec.asset}`);
  const info = await getJSON(`https://api.polyhaven.com/info/${spec.asset}`);
  const dir = path.join(outRoot, name);
  await fs.mkdir(dir, { recursive: true });
  for (const [apiKey, suffix] of MAPS) {
    const entry = files[apiKey]?.[spec.res]?.jpg;
    if (!entry) throw new Error(`${spec.asset}: no ${apiKey} ${spec.res} jpg`);
    const dest = path.join(dir, `${suffix}.jpg`);
    try {
      const have = crypto.createHash('md5').update(await fs.readFile(dest)).digest('hex');
      if (have === entry.md5) { console.log(`ok   ${name}/${suffix}.jpg (cached)`); continue; }
    } catch { /* not present */ }
    const r = await fetch(entry.url, { headers: UA });
    if (!r.ok) throw new Error(`${entry.url} -> HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    if (md5 !== entry.md5) throw new Error(`${name}/${suffix}: md5 mismatch`);
    await fs.writeFile(dest, buf);
    console.log(`got  ${name}/${suffix}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  credits.push({ name, spec, title: info.name, authors: Object.keys(info.authors ?? {}).join(', ') });
}

const lines = [
  '# Texture credits',
  '',
  'All PBR texture sets are CC0 (public domain) from [Poly Haven](https://polyhaven.com), fetched by `npm run fetch-textures`.',
  'Maps used: diffuse (`diff.jpg`, sRGB), OpenGL normal (`nor.jpg`), packed ARM (`arm.jpg`: R = AO, G = roughness, B = metalness).',
  '',
  '| Material | Poly Haven asset | Resolution | Author(s) | License | Notes |',
  '|---|---|---|---|---|---|',
  ...credits.map(c => `| ${c.name} | [${c.spec.asset}](https://polyhaven.com/a/${c.spec.asset}) (${c.title}) | ${c.spec.res} | ${c.authors} | CC0 | ${c.spec.note} |`),
  '',
  'Brass, trainPaint, trainGold and glass are procedural (no downloaded textures).',
  '',
];
await fs.writeFile(path.join(outRoot, 'CREDITS.md'), lines.join('\n'));
console.log('wrote public/textures/CREDITS.md');
