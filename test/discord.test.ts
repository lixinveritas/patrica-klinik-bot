import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, Client, Collection, Guild, Interaction, PermissionFlagsBits as P, TextChannel, ThreadChannel } from 'discord.js';
import { Store } from '../src/store.js';
import { ClinicBot } from '../src/bot.js';
import { fetchExistingMessage, overwrites, publishRoadmap, roles, setup } from '../src/setup.js';
import { forms, modal, applicationPanel, staffPanel, financePanel } from '../src/ui.js';
import { command } from '../src/commands.js';
import { roadmapMessages } from '../src/roadmap.js';
const gid='999999999999999999';const uid='111111111111111111';const boss='222222222222222222';
function fixture(){
 const s=new Store(':memory:');for(const [i,k] of Object.keys(roles).entries())s.setResource(gid,`role:${k}`,String(400000000000000000n+BigInt(i)));
 const guild={id:gid,client:{user:{id:'777777777777777777'}},members:{fetch:async()=>({roles:{cache:new Collection([[s.resource(gid,'role:psychologist')!,{}]])}})}} as unknown as Guild;
 const client={} as Client;const bot=new ClinicBot(client,s,{guild:gid,owners:[boss],token:'test-unused',app:'777777777777777777',data:'unused'});
 return {s,guild,bot};
}
test('klinik kanal izinleri resepsiyon ve ortak personel rolunu acmaz',()=>{
 const {s,guild}=fixture();try{const p=overwrites(guild,s,[],uid);assert.equal(p.length,4);assert.ok(p.some(r=>r.id===gid&&'deny' in r&&(r.deny as bigint[]).includes(P.ViewChannel)));assert.ok(!p.some(r=>r.id===s.resource(gid,'role:staff')));assert.ok(!p.some(r=>r.id===s.resource(gid,'role:reception')));assert.ok(p.some(r=>r.id===uid));}finally{s.close();}
});
test('tum formlar Discord sinirlarina uygun serilestirilir',()=>{
 const {s}=fixture();try{for(const [k,f] of Object.entries(forms)){const m=modal(`form:${k}`,f.title,f.fields).toJSON();assert.ok(m.components.length<=5);assert.ok(m.custom_id.length<=100);}
 for(const panel of [applicationPanel(s,gid),staffPanel(s,gid),financePanel(s,gid)]){for(const row of panel.components){assert.ok(row.toJSON().components.length<=5);for(const b of row.components){const j=b.toJSON();assert.equal('emoji' in j?j.emoji:undefined,undefined);}}}
 assert.ok(command.toJSON().options!.length<=25);
 }finally{s.close();}
});
test('yalniz yuklenmis ozel emoji kimligi kullanilir',()=>{
 const {s}=fixture();try{s.setResource(gid,'emoji:folder','888888888888888888');const b=staffPanel(s,gid).components[0]!.components[1]!.toJSON();assert.deepEqual('emoji' in b?b.emoji:undefined,{id:'888888888888888888'});}finally{s.close();}
});
test('roadmap metinleri mesaj sinirinda ve personel yazma izni acikca kapali',()=>{
 const {s,guild}=fixture();try{for(const m of roadmapMessages(s,gid)){assert.ok(m.length<=2000,`Mesaj uzun: ${m.length}`);assert.ok(m.length>100);}
 const p=overwrites(guild,s,['staff'],undefined,true);const staff=p.find(r=>r.id===s.resource(gid,'role:staff'))!;
 assert.ok('deny' in staff&&(staff.deny as bigint[]).includes(P.SendMessages));
 const manager=p.find(r=>r.id===s.resource(gid,'role:manager'))!;assert.ok('allow' in manager&&(manager.allow as bigint[]).includes(P.SendMessages));
 }finally{s.close();}
});
test('yalniz Unknown Message silinmis kabul edilir, ag hatasi yukari iletilir',async()=>{
 const channel=(error:unknown)=>({messages:{fetch:async()=>{throw error;}}}) as unknown as TextChannel;
 assert.equal(await fetchExistingMessage(channel({code:10008}),'old'),null);
 await assert.rejects(fetchExistingMessage(channel(new Error('network')),'old'),/network/);
 await assert.rejects(fetchExistingMessage(channel({code:50013}),'old'));
});
test('gecici fetch hatasinda roadmap mesaji kopyalanmaz ve kimlik korunur',async()=>{
 const {s,guild}=fixture();try{let sent=0;
 s.setResource(gid,'category:staff','444444444444444444');s.setResource(gid,'channel:roadmap','555555555555555555');s.setResource(gid,'roadmap:message:0','666666666666666666');
 const c={id:'555555555555555555',type:ChannelType.GuildText,permissionOverwrites:{set:async()=>{}},messages:{fetch:async()=>{throw new Error('temporary');}},send:async()=>{sent++;}};
 Object.assign(guild,{channels:{fetch:async()=>c}});
 await assert.rejects(publishRoadmap(guild,s),/temporary/);assert.equal(sent,0);assert.equal(s.resource(gid,'roadmap:message:0'),'666666666666666666');
 }finally{s.close();}
});
test('onayli karakter adi Discord takma adina uygulanir; yetki yoksa manuel durum saklanir',async()=>{
 const {s,guild,bot}=fixture();try{
  s.setResource(gid,`staffname:${uid}`,'Mira Patrica');let nickname='Discord Adi';let allowed=true;
  Object.assign(guild,{members:{fetch:async()=>({displayName:nickname,manageable:allowed,setNickname:async(name:string)=>{nickname=name;}})}});
  assert.equal(await bot.syncCharacterName(guild,uid),true);assert.equal(nickname,'Mira Patrica');assert.equal(s.resource(gid,`nameapplied:${uid}`),'done');
  s.setResource(gid,`staffname:${uid}`,'Mira Patrici');allowed=false;
  assert.equal(await bot.syncCharacterName(guild,uid),false);assert.equal(nickname,'Mira Patrica');assert.equal(s.resource(gid,`nameapplied:${uid}`),'manual');
 }finally{s.close();}
});
test('gorev butonundan basvuru kaydedilir ve yonetim karti tek kez gonderilir',async()=>{
 const {s,guild,bot}=fixture();try{
  const sent:any[]=[];const channel={id:'333333333333333333',type:ChannelType.GuildText,send:async(payload:any)=>{sent.push(payload);return {id:'444444444444444444'};}};
  s.setResource(gid,'channel:applications',channel.id);Object.assign(guild,{channels:{fetch:async()=>channel},members:{fetch:async()=>({roles:{cache:new Collection()}})}});
  const open=interaction(guild,'button','apply:psychologist');Object.assign(open.i,{member:{roles:[]}});await bot.handle(open.i);
  const form=open.replies[0] as {toJSON:()=>any};assert.equal(form.toJSON().custom_id,'pk:form:apply:psychologist');assert.equal(form.toJSON().components.length,4);
  const submit=interaction(guild,'modal','form:apply:psychologist',{name:'Asuka Shindo',ic:'Klinikte calisma gecmisi ve iletisim bilgisi.',ooc:'Duzenli RP deneyimi ve uygun saatler.',scenario:'Danisan notlari sadece yetkili dosyada kalir.'});Object.assign(submit.i,{member:{roles:[]}});await bot.handle(submit.i);
  assert.equal(s.all('SELECT id FROM applications').length,1);assert.equal(s.application(gid,1).job,'psychologist');assert.equal(sent.length,1);
  assert.equal(s.resource(gid,'appmsg:1'),'444444444444444444');assert.match(String(submit.replies[0]),/BAS-0001 basvurun kaydedildi/);
  const reception=interaction(guild,'button','apply:reception');Object.assign(reception.i,{member:{roles:[]}});await bot.handle(reception.i);assert.equal((reception.replies[0] as {toJSON:()=>any}).toJSON().custom_id,'pk:form:apply:reception');
 }finally{s.close();}
});
function interaction(guild:Guild,kind:'button'|'modal',id:string,fields:Record<string,string>={}) {
 const replies:unknown[]=[];
 const i={id:'123456789123456789',guild,guildId:gid,user:{id:uid},member:{roles:['400000000000000002']},customId:`pk:${id}`,deferred:false,replied:false,
 isChatInputCommand:()=>false,isButton:()=>kind==='button',isModalSubmit:()=>kind==='modal',
 fields:{getTextInputValue:(key:string)=>fields[key]??'',getUploadedFiles:()=>fields.proof?new Collection([['123',{name:'chatlog.txt',url:'https://cdn.discordapp.com/attachments/123/456/chatlog.txt',size:Buffer.byteLength(fields.proof)}]]):new Collection()},
 deferReply:async()=>{i.deferred=true;},editReply:async(r:unknown)=>{replies.push(r);},reply:async(r:unknown)=>{i.replied=true;replies.push(r);},showModal:async(r:unknown)=>{replies.push(r);}
 };
 return {i:i as unknown as Interaction,replies};
}
test('buton islemi gecikmeden formu acar, tahsilat bildirimi kasayi arttirmaz',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('[21:00:00] Klinik hesabina 20000 dolar odeme yapildi.'));
 const {s,guild,bot}=fixture();try{
 const c=s.openCase({id:uid,guild:gid,jobs:['psychologist']},'Deneme Kisi','555',uid,'case');const v=s.addVisit({id:uid,guild:gid,jobs:['psychologist']},c.id,'ilk','Yeterli uzunlukta gorusme notu.','visit');
 const open=interaction(guild,'button','income');await bot.handle(open.i);assert.equal(open.replies.length,1);assert.ok('toJSON' in (open.replies[0] as object));
 let published=0;bot.publishCash=async()=>{published++;};
 const submit=interaction(guild,'modal','form:income',{visit:`SN-${v.id}`,proof:'[21:00:00] Klinik hesabina 20000 dolar odeme yapildi.'});
 await bot.handle(submit.i);assert.equal(published,1);assert.match(String(submit.replies[0]),/onay bekliyor/);assert.equal(s.summary({id:boss,guild:gid,jobs:['manager']}).balance,0);
 }finally{s.close();}
});
test('psikolog yonetim butonunu taklit ederek finans onayina ulasamaz',async()=>{
 const {s,guild,bot}=fixture();try{const x=interaction(guild,'button','cashapprove:1');await bot.handle(x.i);assert.match(JSON.stringify(x.replies),/yetkin yok/);const submit=interaction(guild,'modal','decision:cashapprove:1',{reason:'Onaylamak istiyorum'});await bot.handle(submit.i);assert.match(JSON.stringify(submit.replies),/yetkin yok/);}finally{s.close();}
});
test('farkli sunucudan gelen interaction etkisiz kalir',async()=>{
 const {s,guild,bot}=fixture();try{const wrong={...guild,id:'888888888888888888'} as Guild;const x=interaction(wrong,'button','shiftin');Object.assign(x.i,{guildId:wrong.id});await bot.handle(x.i);assert.equal(x.replies.length,0);assert.equal(s.all('SELECT * FROM shifts').length,0);}finally{s.close();}
});
test('seans bildirimi gidemese de kalici kod doner ve tek seans yazilir',async()=>{
 const {s,guild,bot}=fixture();try{
 const a={id:uid,guild:gid,jobs:['psychologist'] as ['psychologist']};const c=s.openCase(a,'Deneme Kisi','555',uid,'case');
 bot.ensureCaseChannel=async()=>({send:async()=>{throw new Error('network');}} as unknown as ThreadChannel);
 const x=interaction(guild,'modal','form:visit',{case:`PK-${c.id}`,service:'ilk',note:'Beyan ve hedefler gorusmede kaydedildi.'});await bot.handle(x.i);
 assert.match(String(x.replies[0]),/SN-0001 kaydedildi/);assert.match(String(x.replies[0]),/yeniden seans acma/);assert.equal(s.all('SELECT * FROM visits').length,1);
 }finally{s.close();}
});
test('finans bildirimi gidemese de kayit kodu gorunur',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('Kira odemesine ait yeterli uzunlukta kanit kaydi.'));
 const {s,guild,bot}=fixture();try{bot.publishCash=async()=>{throw new Error('network');};const x=interaction(guild,'modal','form:expense',{reference:'Kira',amount:'2000',proof:'Kira odemesine ait yeterli uzunlukta kanit kaydi.'});await bot.handle(x.i);assert.match(String(x.replies[0]),/FIN-0001 kaydedildi/);assert.match(String(x.replies[0]),/yeni kayit acma/);assert.equal(s.all('SELECT * FROM cash').length,1);}finally{s.close();}
});
test('dosyalar ana kanal izinlerine bagli, davete kapali ozel thread olarak acilir',async()=>{
 const {s,guild,bot}=fixture();try{
 const a={id:uid,guild:gid,jobs:['psychologist'] as ['psychologist']};const row=s.openCase(a,'Deneme Kisi','555',uid,'case');let created:any;let added='';
 const parent={id:'123123123123123123',type:ChannelType.GuildText,threads:{fetchActive:async()=>{},cache:new Collection(),create:async(o:any)=>{
   created=o;return {...o,id:'321321321321321321',members:{add:async(id:string)=>{added=id;}}};
 }}};
 s.setResource(gid,'channel:records',parent.id);Object.assign(guild,{channels:{fetch:async()=>parent}});
 await bot.ensureCaseChannel(guild,row);assert.equal(created.type,ChannelType.PrivateThread);assert.equal(created.invitable,false);assert.equal(added,uid);assert.equal(s.case(a,row.id).channel,'321321321321321321');
 const roleGate=overwrites(guild,s,['psychologist']);assert.ok(roleGate.some(p=>p.id===s.resource(gid,'role:psychologist')));assert.ok(!roleGate.some(p=>p.id===uid));
 }finally{s.close();}
});
test('kurulum tekrarinda kanal, rol ve panel kopyasi uretilmez',async()=>{
 const s=new Store(':memory:');let next=600000000000000000n;const roleCache=new Collection<string,any>();const channelCache=new Collection<string,any>();let sends=0;
 const guild:any={id:gid,client:{user:{id:'777777777777777777'}},
 roles:{cache:roleCache,fetch:async()=>roleCache,create:async(o:any)=>{const r={...o,id:String(next++),editable:true,setColors:async()=>{}};roleCache.set(r.id,r);return r;}},
 members:{fetch:async()=>({roles:{add:async()=>{}}}),fetchMe:async()=>({id:'777777777777777777',permissions:{has:(p:unknown)=>p!==P.ManageGuildExpressions}})},
 channels:{cache:channelCache,fetch:async(id?:string)=>id?channelCache.get(id):channelCache,create:async(o:any)=>{const messages=new Collection<string,any>();const c={...o,parentId:o.parent,id:String(next++),permissionOverwrites:{set:async(p:unknown)=>{c.permissionOverwritesData=p;}},permissionOverwritesData:o.permissionOverwrites,messages:{fetch:async(id:string)=>messages.get(id)},send:async(payload:any)=>{sends++;const msg={id:String(next++),author:{id:'777777777777777777'},payload,edit:async(p:any)=>{msg.payload=p;}};messages.set(msg.id,msg);return msg;}};channelCache.set(c.id,c);return c;}},emojis:{fetch:async()=>new Collection()}};
 try{const a={id:boss,guild:gid,jobs:['manager'] as const};await setup(guild,s,{...a,jobs:['manager']});const count=channelCache.size;const countRoles=roleCache.size;const sent=sends;await setup(guild,s,{...a,jobs:['manager']});assert.equal(channelCache.size,count);assert.equal(roleCache.size,countRoles);assert.equal(sends,sent);assert.equal(channelCache.filter(c=>c.type===ChannelType.GuildCategory).size,5);}finally{s.close();}
});
