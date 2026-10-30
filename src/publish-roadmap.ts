import assert from 'node:assert/strict';
import { Client, Events, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { resolve } from 'node:path';
import { config } from './config.js';
import { Store } from './store.js';
import { overwrites, publishRoadmap, textChannel } from './setup.js';
import { roadmapMessages } from './roadmap.js';
const c=config();const s=new Store(resolve(c.data,'patrica.sqlite'));const client=new Client({intents:[GatewayIntentBits.Guilds]});
const timer=setTimeout(()=>{console.error('Rehber yayini zaman asimina ugradi.');client.destroy();s.close();process.exit(1);},45000);
client.once(Events.ClientReady,async()=>{
 try{
  assert.equal(client.user!.id,c.app);const guild=await client.guilds.fetch(c.guild);
  const channel=await publishRoadmap(guild,s);const staff=s.resource(guild.id,'role:staff')!;const candidate=s.resource(guild.id,'role:candidate')!;
  const announcements=await textChannel(guild,s,'announcements');await announcements.permissionOverwrites.set(overwrites(guild,s,['staff'],undefined,true));
  assert.equal(announcements.permissionsFor(staff)?.has(P.SendMessages),false);
  assert.equal(channel.permissionsFor(staff)?.has(P.ViewChannel),true);assert.equal(channel.permissionsFor(staff)?.has(P.SendMessages),false);assert.equal(channel.permissionsFor(candidate)?.has(P.ViewChannel),false);
  const expected=roadmapMessages(s,guild.id);
  for(const [index,content] of expected.entries()){const m=await channel.messages.fetch(s.resource(guild.id,`roadmap:message:${index}`)!);assert.equal(m.content,content);if(index===0)assert.ok(m.attachments.some(a=>a.name==='patrica-roadmap.png'));}
  console.log(`Roadmap kanali olusturuldu/guncellendi; ${expected.length} rehber mesaji ve personel okuma izinleri canli dogrulandi.`);
  console.log(`https://discord.com/channels/${guild.id}/${channel.id}`);
 }catch(e){console.error(`Rehber yayini tamamlanamadi: ${e instanceof Error?e.name:'Error'}`);process.exitCode=1;}
 finally{clearTimeout(timer);client.destroy();s.close();}
});
try{await client.login(c.token);}catch{clearTimeout(timer);client.destroy();s.close();console.error('Discord baglantisi kurulamadi.');process.exitCode=1;}
