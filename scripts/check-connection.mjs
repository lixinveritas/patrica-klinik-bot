import { readFile, writeFile } from 'node:fs/promises';
const app=process.env.APPLICATION_ID;const guild=process.env.GUILD_ID;
const headers={Authorization:`Bot ${process.env.DISCORD_TOKEN}`};
try {
 const response=await fetch('https://discord.com/api/v10/oauth2/applications/@me',{headers});
 if(!response.ok){console.log(`Uygulama dogrulanamadi: HTTP ${response.status}`);process.exitCode=1;}
 else {
  const data=await response.json();if(data.id!==app)throw new Error('Uygulama kimligi eslesmedi.');
  const owner=data.team?.owner_user_id??data.owner?.id;if(!/^\d{17,20}$/.test(owner))throw new Error('Uygulama sahibi belirlenemedi.');
  const path=new URL('../.env',import.meta.url);const env=await readFile(path,'utf8');await writeFile(path,env.replace(/^OWNER_IDS=.*$/m,`OWNER_IDS=${owner}`));
  console.log('Uygulama kimligi dogrulandi; uygulama sahibi yonetici olarak ayarlandi.');
  const target=await fetch(`https://discord.com/api/v10/guilds/${guild}`,{headers});
  console.log(target.ok?'Hedef sunucuya bot erisimi var.':`Hedef sunucu erisimi yok: HTTP ${target.status}`);
 }
} catch {console.log('Baglanti kontrolu tamamlanamadi. Gizli degerler yazdirilmadi.');process.exitCode=1;}
