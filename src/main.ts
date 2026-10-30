import { Client, Events, GatewayIntentBits } from 'discord.js';
import { mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { Store } from './store.js';
import { ClinicBot } from './bot.js';
import { diskAvailable } from './recovery.js';
const c=config();mkdirSync(c.data,{recursive:true});
const lock=resolve(c.data,'bot.lock');
try {const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);}catch{console.error('Bot kilidi var. Ikinci kopya acilmadi. Bot kapaliysa data/bot.lock dosyasini kontrol et.');process.exit(1);}
const s=new Store(resolve(c.data,'patrica.sqlite'));
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers],allowedMentions:{parse:[]}});
const bot=new ClinicBot(client,s,c);
let timer:ReturnType<typeof setInterval>|undefined;
const health=()=>writeFileSync(resolve(c.data,'health.json'),JSON.stringify({pid:process.pid,at:Date.now(),ready:client.isReady(),uptime:Math.floor(process.uptime()),diskFree:diskAvailable(c.data),lowDisk:diskAvailable(c.data)<200*1024*1024}));
const heartbeat=setInterval(health,30000);health();
let stopping=false;
function stop() {
  if(stopping)return;stopping=true;if(timer)clearInterval(timer);clearInterval(heartbeat);client.destroy();s.close();if(readFileSync(lock,'utf8')===String(process.pid))unlinkSync(lock);
}
process.once('SIGINT',()=>{stop();process.exit(0);});process.once('SIGTERM',()=>{stop();process.exit(0);});
client.once(Events.ClientReady,async ready=>{
  if(ready.user.id!==c.app){console.error('Bot tokeni APPLICATION_ID ile eslesmiyor.');stop();return;}
  console.log('Patrica bot baglandi. Kurulum icin hedef sunucuda /klinik kur kullan.');
  if(s.resource(c.guild,'channel:people'))await bot.personnel.bootstrap(await ready.guilds.fetch(c.guild)).catch(()=>console.error('Mevcut personel eslestirmesi tamamlanamadi.'));
  let ticking=false;
  const tick=async()=>{if(ticking||stopping)return;ticking=true;try{await bot.tick();}catch{console.error('Bakim veya hatirlatma tamamlanamadi. Kayitlar korundu.');}finally{ticking=false;}};
  timer=setInterval(()=>void tick(),60_000);
  void tick();health();
});
client.on(Events.InteractionCreate,i=>void bot.handle(i));
client.on(Events.GuildMemberAdd,m=>void bot.onJoin(m).catch(()=>console.error('Aday rolu atanamadi.')));
client.on(Events.GuildMemberRemove,m=>{if(m.guild.id===c.guild){void bot.revokeCaseAccess(m.guild,m.id).catch(()=>console.error('Dosya erisimi kaldirilamadi.'));void bot.personnel.revoke(m.guild,m.id).catch(()=>console.error('Personel alani kapatilamadi.'));}});
client.on(Events.GuildMemberUpdate,(_old,m)=>{
  if(m.guild.id!==c.guild)return;
  bot.personnel.schedule(m.guild.id,m.id);
  void bot.actor(m.guild,m.id).then(a=>{
    if(!a.jobs.some(j=>j==='manager'||j==='psychologist'))return bot.revokeCaseAccess(m.guild,m.id);
  }).catch(()=>console.error('Personel erisimi kontrol edilemedi.'));
});
client.on(Events.Error,()=>console.error('Discord baglanti hatasi.'));
try {await client.login(c.token);}catch{console.error('Discord girisi basarisiz. Tokeni ve intent ayarini kontrol et.');stop();process.exitCode=1;}
