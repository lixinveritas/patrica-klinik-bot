import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base=new URL('../assets/fonts/',import.meta.url);mkdirSync(base,{recursive:true});
const manifest=[];
for(const [directory,file,local] of [['manrope','Manrope[wght].ttf','Manrope.ttf'],['newsreader','Newsreader[opsz,wght].ttf','Newsreader.ttf']]) {
 const res=await fetch(`https://api.github.com/repos/google/fonts/commits?path=ofl/${directory}&per_page=1`);if(!res.ok)throw new Error(`Font kaynagi HTTP ${res.status}`);
 const rows=await res.json();const commit=rows[0]?.sha;if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Font commit gecersiz.');
 for(const [name,target] of [[file,local],['OFL.txt',`${directory}-OFL.txt`]]) {
  const url=`https://raw.githubusercontent.com/google/fonts/${commit}/ofl/${directory}/${encodeURIComponent(name)}`;const r=await fetch(url);if(!r.ok)throw new Error(`Font dosyasi HTTP ${r.status}`);const bytes=Buffer.from(await r.arrayBuffer());
  if(name==='OFL.txt'&&!bytes.toString().includes('SIL OPEN FONT LICENSE'))throw new Error('Font lisansi dogrulanamadi.');
  if(bytes.length>2000000)throw new Error('Font beklenenden buyuk.');writeFileSync(new URL(target,base),bytes);manifest.push({file:target,url,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
}
writeFileSync(new URL('sources.json',base),JSON.stringify(manifest,null,2)+'\n');console.log('Manrope ve Newsreader lisanslariyla yerel olarak hazir.');
