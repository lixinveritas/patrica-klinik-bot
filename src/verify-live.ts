import assert from 'node:assert/strict';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits as P,ChannelType } from 'discord.js';
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
  for(const key of ['apply','staff','finance','welcome','rules','personnel']) {
   const ch=await textChannel(guild,s,key);const msg=await ch.messages.fetch(s.resource(guild.id,`panel:${key}`)!);
   assert.equal(msg.author.id,c.app);assert.ok(msg.embeds.length);panels++;
   if(key==='apply')assert.deepEqual(msg.components.flatMap(row=>'components' in row?row.components.map(button=>'customId' in button?button.customId:undefined):[]),['pk:apply:psychologist','pk:apply:reception','pk:applicationstatus']);
  }
  const commands=await guild.commands.fetch({withLocalizations:false});const klinik=commands.find(x=>x.applicationId===c.app&&x.name==='klinik');assert.ok(klinik);
  for(const sub of ['ara','seanslar','uzlastir','teslim','tarife','saglik','bildirim','tekrar','personelim','personel-kaydi','personel-isleri','personel-kurtar'])assert.ok(klinik.options.some(x=>x.name===sub));
  const roadmap=await textChannel(guild,s,'roadmap');assert.equal(roadmap.permissionsFor(s.resource(guild.id,'role:staff')!)?.has(P.SendMessages),false);
  for(let n=0;n<6;n++){const m=await roadmap.messages.fetch(s.resource(guild.id,`roadmap:message:${n}`)!);assert.equal(m.author.id,c.app);if(n===0)assert.ok(m.attachments.some(a=>a.name==='patrica-roadmap.png'));}
  const people=await textChannel(guild,s,'people');assert.equal(people.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel),false);assert.equal(people.permissionsFor(s.resource(guild.id,'role:candidate')!)?.has(P.ViewChannel),false);assert.equal(people.permissionsFor(s.resource(guild.id,'role:staff')!)?.has(P.ViewChannel),true);
  const personnel=await textChannel(guild,s,'personnel');assert.equal(personnel.permissionsFor(s.resource(guild.id,'role:staff')!)?.has(P.ViewChannel),false);
  let workspaces=0;
  for(const row of s.all<{key:string;value:string}>("SELECT key,value FROM resources WHERE guild=? AND key LIKE 'workspace:%' AND key!='workspace:bucket'",guild.id)) {
    const user=row.key.slice(10);if(s.resource(guild.id,`workspaceactive:${user}`)==='0')continue;
    const thread=await guild.channels.fetch(row.value);assert.equal(thread?.type,ChannelType.PrivateThread);
    if(thread?.type!==ChannelType.PrivateThread)throw new Error('Personel alani ozel degil.');assert.equal(thread.parentId,people.id);assert.equal(thread.invitable,false);const members=await thread.members.fetch();assert.ok(members.has(user));
    for(const id of members.keys())if(id!==user&&id!==c.app&&!c.owners.includes(id)){const member=await guild.members.fetch(id);assert.ok(member.roles.cache.has(s.resource(guild.id,'role:manager')!));}
    const key=`workspacemsg:${user}:${new Date(Date.now()+3*3600000).toISOString().slice(0,10)}`;const message=await thread.messages.fetch(s.resource(guild.id,key)!);assert.equal(message.author.id,c.app);assert.ok(message.embeds[0]?.image);assert.ok(message.components.length);workspaces++;
  }
  assert.ok(workspaces>0,'Kurulum sahibinin personel alani olusmali.');
  console.log(`Canli API kontrolu: ${panels} panel, ${icons} ozel ikon, 6 canli rol rengi, yeni komutlar, 6 rehber, ${workspaces} ozel personel alani ve rol izinleri dogrulandi.`);
  console.log('Gercek aday/personel hesaplariyla buton ve ozel thread uyelik testi yapilmadi.');
 }catch(e){console.error(`Canli kontrol basarisiz: ${e instanceof Error?e.name:'Error'}`);process.exitCode=1;}
 finally{clearTimeout(timeout);client.destroy();s.close();}
});
try{await client.login(c.token);}catch{clearTimeout(timeout);client.destroy();s.close();console.error('Canli kontrol baglantisi basarisiz.');process.exitCode=1;}
