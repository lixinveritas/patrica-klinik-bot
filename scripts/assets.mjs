import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const commitResponse=await fetch('https://api.github.com/repos/lucide-icons/lucide/commits/main',{headers:{'User-Agent':'Patrica-asset-builder'}});
if(!commitResponse.ok)throw new Error('Lucide kaynak surumu alinamadi.');
const {sha}=await commitResponse.json();if(!/^[a-f0-9]{40}$/.test(sha))throw new Error('Kaynak surumu gecersiz.');
const root=`https://raw.githubusercontent.com/lucide-icons/lucide/${sha}/`;
const out=new URL('../assets/',import.meta.url);await mkdir(out,{recursive:true});
const manifest={source:'https://github.com/lucide-icons/lucide',commit:sha,license:'ISC + retained Feather notices',icons:[]};
for(const [name,file] of Object.entries({folder:'folder-open',calendar:'calendar-days',notes:'clipboard-list',receipt:'receipt-text',clock:'clock-3'})) {
  const url=`${root}icons/${file}.svg`;const res=await fetch(url);if(!res.ok)throw new Error(`Ikon indirilemedi: ${file}`);
  const source=await res.text();if(!source.includes('<svg'))throw new Error('SVG gecersiz.');
  await writeFile(new URL(`${name}.svg`,out),source);
  await sharp(Buffer.from(source.replaceAll('currentColor','#eae9de')),{density:256}).resize(64,64).png().toFile(new URL(`${name}.png`,out).pathname.replace(/^\/(\w:)/,'$1'));
  manifest.icons.push({name,url,sha256:createHash('sha256').update(source).digest('hex')});
}
const license=await fetch(`${root}LICENSE`);if(!license.ok)throw new Error('Lisans indirilemedi.');
await writeFile(new URL('LUCIDE-LICENSE.txt',out),await license.text());
await writeFile(new URL('sources.json',out),JSON.stringify(manifest,null,2));
console.log('Bes Lucide ikonu ve lisansi kaydedildi.');
