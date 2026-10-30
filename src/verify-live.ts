import assert from 'node:assert/strict';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { resolve } from 'node:path';
import { config } from './config.js';
import { Store } from './store.js';
import { textChannel, roleColors, RoleKey } from './setup.js';
const c=config();const s=new Store(resolve(c.data,'patrica.sqlite'));
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const timeout=setTimeout(()=>{console.error('Canli kontrol zaman asimi.');client.destroy();s.close();process.exit(1);},30_000);
client.once(Events.ClientReady,async()=>{
 try {
  const guild=await client.guilds.fetch(c.guild);await guild.roles.fetch();
  assert.equal(client.user?.id,c.app);
  for(const [key,color] of Object.entries(roleColors))assert.equal(guild.roles.cache.get(s.resource(guild.id,`role:${key as RoleKey}`)!)?.color,color);
  const records=await textChannel(guild,s,'records');
  for(const key of ['reception','staff','finance','candidate'])assert.equal(records.permissionsFor(s.resource(guild.id,`role:${key}`)!)?.has(P.ViewChannel),false,`${key} arsiv erisimi kapali olmali`);
  assert.equal(records.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel),false);
  assert.equal(records.permissionsFor(s.resource(guild.id,'role:psychologist')!)?.has(P.ViewChannel),true);
  assert.equal(records.permissionsFor(s.resource(guild.id,'role:manager')!)?.has(P.ManageThreads),true);
  const welcome=await textChannel(guild,s,'welcome');assert.equal(welcome.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel),true);assert.equal(welcome.permissionsFor(guild.roles.everyone)?.has(P.SendMessages),false);
  const emojis=await guild.emojis.fetch();let icons=0;
  for(const name of ['folder','calendar','notes','receipt','clock']){assert.ok(emojis.has(s.resource(guild.id,`emoji:${name}`)!));icons++;}
  let panels=0;
  for(const key of ['apply','staff','finance','welcome','rules']) {
   const ch=await textChannel(guild,s,key);const msg=await ch.messages.fetch(s.resource(guild.id,`panel:${key}`)!);
   assert.equal(msg.author.id,c.app);assert.ok(msg.embeds.length);panels++;
  }
  const commands=await guild.commands.fetch({withLocalizations:false});const klinik=commands.find(x=>x.applicationId===c.app&&x.name==='klinik');assert.ok(klinik);
  for(const sub of ['ara','seanslar','uzlastir','teslim','tarife','saglik','bildirim','tekrar'])assert.ok(klinik.options.some(x=>x.name===sub));
  const roadmap=await textChannel(guild,s,'roadmap');assert.equal(roadmap.permissionsFor(s.resource(guild.id,'role:staff')!)?.has(P.SendMessages),false);
  for(let n=0;n<6;n++){const m=await roadmap.messages.fetch(s.resource(guild.id,`roadmap:message:${n}`)!);assert.equal(m.author.id,c.app);}
  console.log(`Canli API kontrolu: ${panels} panel, ${icons} ozel ikon, 6 canli rol rengi, yeni komutlar, 6 rehber mesaji ve arsiv rol izinleri dogrulandi.`);
  console.log('Gercek aday/personel hesaplariyla buton ve ozel thread uyelik testi yapilmadi.');
 }catch(e){console.error(`Canli kontrol basarisiz: ${e instanceof Error?e.name:'Error'}`);process.exitCode=1;}
 finally{clearTimeout(timeout);client.destroy();s.close();}
});
try{await client.login(c.token);}catch{clearTimeout(timeout);client.destroy();s.close();console.error('Canli kontrol baglantisi basarisiz.');process.exitCode=1;}
