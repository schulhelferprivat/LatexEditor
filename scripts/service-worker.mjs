import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const paths = [];
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await scan(file);
    else if (entry.name !== 'sw.js') paths.push(file.slice(5));
  }
}
await scan('dist');
const hash = createHash('sha256');
for (const path of paths.sort()) hash.update(await readFile(`dist/${path}`));
const version = 'latexhelper-' + hash.digest('hex').slice(0, 16);
await writeFile(
  'dist/sw.js',
  `const CACHE=${JSON.stringify(version)};\nconst ASSETS=${JSON.stringify(paths)};\nconst BASE=new URL('./',self.location).pathname;\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));\nself.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('latexhelper-')&&key!==CACHE).map(key=>caches.delete(key))))));\nself.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;const path=url.pathname.slice(BASE.length)||'index.html';if(!ASSETS.includes(path))return;event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(path))||fetch(event.request)));});\n`,
);
console.log(`Offline-Cache: ${paths.length} Ressourcen, ${version}`);
