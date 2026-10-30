import { AttachmentBuilder, ChannelType, Guild, OverwriteResolvable, PermissionFlagsBits as P, TextChannel } from 'discord.js';
import { readFile } from 'node:fs/promises';
import { Store } from './store.js';
import { Actor, UserError } from './domain.js';
import { applicationPanel, financePanel, staffPanel, card, buttons, panelVisual } from './ui.js';
import { roadmapMessages } from './roadmap.js';

export const roles = {manager:'Patrica | Yonetim',finance:'Patrica | Finans',psychologist:'Patrica | Psikolog',reception:'Patrica | Resepsiyon',staff:'Patrica | Personel',candidate:'Patrica | Aday'};
export const roleColors={manager:0xFF3D71,finance:0xFFD43B,psychologist:0x339CFF,reception:0xB45CFF,staff:0x22DDB4,candidate:0xFF9B38};
export type RoleKey=keyof typeof roles;
export function overwrites(guild:Guild,s:Store,keys:RoleKey[],member?:string,readOnly=false):OverwriteResolvable[] {
  const allow=[P.ViewChannel,P.ReadMessageHistory,...(readOnly?[]:[P.SendMessages,P.SendMessagesInThreads,P.AttachFiles])];
  const records:OverwriteResolvable[]=[{id:guild.id,deny:[P.ViewChannel]},{id:guild.client.user.id,allow:[P.ViewChannel,P.ReadMessageHistory,P.SendMessages,P.SendMessagesInThreads,P.AttachFiles,P.ManageChannels,P.ManageThreads]}];
  for(const key of new Set<RoleKey>(['manager',...keys])) {
    const id=s.resource(guild.id,`role:${key}`);if(!id)throw new UserError('Once /klinik kur ile kurulumu tamamla.');
    records.push(key==='manager'?{id,allow:[...allow,P.ManageThreads,P.SendMessages,P.SendMessagesInThreads]}:{id,allow,...(readOnly?{deny:[P.SendMessages,P.SendMessagesInThreads,P.CreatePublicThreads,P.CreatePrivateThreads]}:{})});
  }
  if(member)records.push({id:member,type:1,allow});
  return records;
}
export async function textChannel(guild:Guild,s:Store,key:string):Promise<TextChannel> {
  const id=s.resource(guild.id,`channel:${key}`);const c=id?await guild.channels.fetch(id):null;
  if(!c||c.type!==ChannelType.GuildText)throw new UserError('Kanal eksik. /klinik kur ile kontrol et.');return c;
}
export async function fetchExistingMessage(channel:TextChannel,id:string) {
  try{return await channel.messages.fetch(id);}catch(e){
    if(e&&typeof e==='object'&&'code' in e&&e.code===10008)return null;
    throw e;
  }
}
export async function setup(guild:Guild,s:Store,actor:Actor) {
  await guild.roles.fetch();await guild.channels.fetch();
  const me=await guild.members.fetchMe();
  if(!me.permissions.has([P.ManageChannels,P.ManageThreads,P.ManageRoles,P.ViewChannel,P.SendMessages,P.SendMessagesInThreads,P.ReadMessageHistory,P.EmbedLinks,P.AttachFiles]))throw new UserError('Botun kanal, alt kanal, rol ve mesaj izinleri eksik.');
  for(const [key,name] of Object.entries(roles)) {
    const saved=s.resource(guild.id,`role:${key}`);
    if(saved) {const r=guild.roles.cache.get(saved);if(!r)throw new UserError(`${name} silinmis. Kaynak eslestirmesini yonetici kontrol etmeli.`);if(!r.editable)throw new UserError('Bot rolu Patrica rollerinin ustunde olmali.');await r.setColors({primaryColor:roleColors[key as RoleKey]});continue;}
    if(guild.roles.cache.some(r=>r.name===name))throw new UserError(`${name} zaten var ama bu kurulumla eslesmiyor. Otomatik sahiplenilmedi.`);
    const role=await guild.roles.create({name,colors:{primaryColor:roleColors[key as RoleKey]},permissions:[],reason:'Patrica kurulumu'});
    s.setResource(guild.id,`role:${key}`,role.id);
  }
  const owner=await guild.members.fetch(actor.id);
  await owner.roles.add([s.resource(guild.id,'role:manager')!,s.resource(guild.id,'role:staff')!],'Patrica kurulum sahibi');
  const ensureCategory=async(key:string,name:string,keys:RoleKey[],publicArea=false)=>{
    const saved=s.resource(guild.id,`category:${key}`);
    const perms:OverwriteResolvable[]=publicArea?[{id:guild.id,allow:[P.ViewChannel,P.ReadMessageHistory],deny:[P.SendMessages]},{id:me.id,allow:[P.ViewChannel,P.SendMessages,P.ManageChannels]}]:overwrites(guild,s,keys);
    if(saved) {const c=await guild.channels.fetch(saved);if(!c||c.type!==ChannelType.GuildCategory)throw new UserError('Kayitli kategori eksik.');await c.permissionOverwrites.set(perms);return c.id;}
    if(guild.channels.cache.some(c=>c?.name===name))throw new UserError(`${name} zaten var; yeniden kategori acilmadi.`);
    const c=await guild.channels.create({name,type:ChannelType.GuildCategory,permissionOverwrites:perms});s.setResource(guild.id,`category:${key}`,c.id);return c.id;
  };
  const categories={
    entry:await ensureCategory('entry','PATRICA | BASLANGIC',[],true),
    staff:await ensureCategory('staff','PATRICA | PERSONEL',['staff']),
    clinic:await ensureCategory('clinic','PATRICA | KLINIK ARSIV',['psychologist']),
    management:await ensureCategory('management','PATRICA | YONETIM',[]),
    finance:await ensureCategory('finance','PATRICA | FINANS',['finance'])
  };
  for(const [key,parent,name] of [
    ['welcome','entry','hos-geldiniz'],['rules','entry','kurallar'],['apply','entry','personel-basvurusu'],
    ['announcements','staff','kurum-duyurulari'],['staff','staff','calisma-masasi'],['chat','staff','personel-iletisim'],['appointments','staff','randevu-takvimi'],['shifts','staff','mesai-ve-devir'],
    ['people','staff','personel-dosyalari'],['personnel','management','personel-kayitlari'],
    ['applications','management','basvuru-degerlendirme'],['audit','management','islem-gecmisi'],['complaints','management','olay-ve-sikayet'],['index','management','dosya-indeksi'],
    ['records','clinic','danisan-dosyalari'],
    ['finance','finance','finans-masasi'],['cash','finance','tahsilat-kayitlari']
  ] as const) {
    const perms=parent==='entry'?[{id:guild.id,allow:[P.ViewChannel,P.ReadMessageHistory],deny:[P.SendMessages]} as OverwriteResolvable,{id:me.id,allow:[P.ViewChannel,P.SendMessages,P.ManageChannels]} as OverwriteResolvable]:overwrites(guild,s,parent==='staff'?['staff']:parent==='finance'?['finance']:parent==='clinic'?['psychologist']:[],undefined,key==='announcements'||key==='people');
    const saved=s.resource(guild.id,`channel:${key}`);
    if(saved){const c=await textChannel(guild,s,key);await c.permissionOverwrites.set(perms);continue;}
    if(guild.channels.cache.some(c=>c?.parentId===categories[parent]&&c.name===name))throw new UserError(`${name} eslesmeyen kanal var; yinelenmedi.`);
    const c=await guild.channels.create({name,type:ChannelType.GuildText,parent:categories[parent],topic:`Patrica:${key}`,permissionOverwrites:perms});
    s.setResource(guild.id,`channel:${key}`,c.id);
  }
  for(const icon of ['folder','calendar','notes','receipt','clock']) {
    const saved=s.resource(guild.id,`emoji:${icon}`);
    if(saved){const found=await guild.emojis.fetch(saved).catch(()=>null);if(found)continue;s.run('DELETE FROM resources WHERE guild=? AND key=?',guild.id,`emoji:${icon}`);}
    if(!me.permissions.has(P.ManageGuildExpressions))break;
    const name=`patrica_${icon}`;const emojis=await guild.emojis.fetch();
    const existing=emojis.find(e=>e.name===name);
    if(existing)throw new UserError(`${name} eslesmeyen emoji var. Otomatik sahiplenilmedi.`);
    const attachment=await readFile(new URL(`../../assets/${icon}.png`,import.meta.url)).catch(()=>null);
    if(!attachment)continue;
    const emoji=await guild.emojis.create({name,attachment,reason:'Lisansli Lucide ikon'});
    s.setResource(guild.id,`emoji:${icon}`,emoji.id);
  }
  await publishPanel(guild,s,'apply',applicationPanel(s,guild.id));
  await publishPanel(guild,s,'staff',staffPanel(s,guild.id));
  await publishPanel(guild,s,'finance',financePanel(s,guild.id));
  await publishPanel(guild,s,'personnel',{...panelVisual('personnel',card('Personel Isleri','Mazeretleri ve devir notlarini degerlendir. Tutanakta personelin aciklamasini ve karar gerekcesini kaydet. Otomatik ceza veya maas kesintisi yapilmaz.')),components:buttons(s,guild.id,[['hr:incident','Tutanak Ac'],['hr:pending:0','Bekleyen Kayitlar'],['hr:areas','Personel Alanlari']])});
  await publishPanel(guild,s,'welcome',{embeds:[card('Patrica Klinik','Hos geldin. Personel basvurusunu ilgili kanaldaki butondan gonderebilirsin. Onaylanana kadar personel ve klinik kayitlari kapali kalir.')]});
  await publishPanel(guild,s,'rules',{embeds:[card('Calisma Esaslari','Yalniz kurgu karakter bilgisi kaydet. IC ve OOC bilgiyi ayir. Danisan notlarini dosyasi disinda paylasma. Tahsilat bildirimini oyun ici hareketle eslestirmeden onaylama. Kendi finans kaydini onaylayamazsin.\n\nGuncel tarife: /klinik tarifeler. Seans kaydedildigi andaki tutar korunur.')]});
  await publishRoadmap(guild,s);
  s.audit(actor,'setup.complete',guild.id);
}
export async function publishRoadmap(guild:Guild,s:Store) {
  const parent=s.resource(guild.id,'category:staff');if(!parent)throw new UserError('Personel kategorisi once kurulmali.');
  await guild.channels.fetch();
  const id=s.resource(guild.id,'channel:roadmap');
  let channel=id?await textChannel(guild,s,'roadmap'):null;
  if(!channel) {
    if(guild.channels.cache.some(c=>c?.parentId===parent&&c.name==='roadmap'))throw new UserError('Roadmap isimli eslesmeyen kanal var; ikinci kanal acilmadi.');
    channel=await guild.channels.create({name:'roadmap',type:ChannelType.GuildText,parent,topic:'Patrica:roadmap | Personel kullanim rehberi',permissionOverwrites:overwrites(guild,s,['staff'],undefined,true)});
    s.setResource(guild.id,'channel:roadmap',channel.id);
  } else await channel.permissionOverwrites.set(overwrites(guild,s,['staff'],undefined,true));
  const messages=roadmapMessages(s,guild.id);
  for(const [index,content] of messages.entries()) {
    if(content.length>2000)throw new UserError('Rehber bolumu Discord mesaj sinirini asiyor.');
    const key=`roadmap:message:${index}`;const old=s.resource(guild.id,key);
    const message=old?await fetchExistingMessage(channel,old):null;
    const visual=index===0?{files:[new AttachmentBuilder(await readFile(new URL('../../assets/panels/roadmap.png',import.meta.url)),{name:'patrica-roadmap.png'})]}:{};
    if(message){if(message.author.id!==guild.client.user.id)throw new UserError('Rehber mesaji botla eslesmiyor.');await message.edit({content,attachments:[],...visual,allowedMentions:{parse:[]}});}
    else {const sent=await channel.send({content,...visual,allowedMentions:{parse:[]}});s.setResource(guild.id,key,sent.id);}
  }
  return channel;
}
export async function publishPanel(guild:Guild,s:Store,key:string,payload:ReturnType<typeof applicationPanel>|{embeds:ReturnType<typeof card>[]}) {
  const channel=await textChannel(guild,s,key);const old=s.resource(guild.id,`panel:${key}`);
  if(old) {const message=await fetchExistingMessage(channel,old);if(message){await message.edit({...payload,attachments:[]});return;}}
  const message=await channel.send({...payload,allowedMentions:{parse:[]}});s.setResource(guild.id,`panel:${key}`,message.id);
}
