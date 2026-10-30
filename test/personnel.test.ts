import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Client,Collection,Guild,Interaction,ChatInputCommandInteraction,ChannelType,PermissionFlagsBits as P} from 'discord.js';
import sharp from 'sharp';
import {Store} from '../src/store.js';
import {PersonnelStore,dayRange,today} from '../src/personnel-store.js';
import {dailyCard,reportCard} from '../src/personnel-cards.js';
import {ClinicBot} from '../src/bot.js';
import {Actor} from '../src/domain.js';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {restoreBackup} from '../src/recovery.js';
import {roles,overwrites} from '../src/setup.js';
const guild='999999999999999999',uid='111111111111111111',manager='222222222222222222',stranger='333333333333333333';
const psy:Actor={id:uid,guild,jobs:['psychologist']},boss:Actor={id:manager,guild,jobs:['manager']};
test('absence is idempotent, overlaps rejected and only another manager can decide',()=>{
 const s=new Store(':memory:'),hr=new PersonnelStore(s);try{const r=hr.submit(psy,'absence',uid,today(),today(),'Bugunku vardiyaya katilamayacagim.','-','request');assert.equal(hr.submit(psy,'absence',uid,today(),today(),'Tekrar gonderilen ayni istek.','-','request').id,r.id);
 assert.throws(()=>hr.submit(psy,'absence',uid,today(),today(),'Ayni gun icin ikinci bildirim.','-','request2'),/kaydin var/);assert.throws(()=>hr.decide({...psy,jobs:['manager']},r.id,'accepted','Uygun goruldu'),/Kendi/);assert.throws(()=>hr.decide(psy,r.id,'accepted','Uygun goruldu'),/yetkin/);
 assert.equal(hr.decide(boss,r.id,'rejected','Takvim tekrar gorusulecek').state,'rejected');assert.equal(hr.decide(boss,r.id,'rejected','Tekrar gelen istek').state,'rejected');assert.throws(()=>hr.decide(boss,r.id,'accepted','Farkli bir karar'));
 assert.ok(hr.submit(psy,'absence',uid,today(),today(),'Duzeltilmis yeni tarih aciklamasi.','-','request3'));assert.equal(s.all('SELECT * FROM ledger').length,0);
 assert.ok(s.get("SELECT * FROM outbox WHERE kind='report'"));assert.ok(s.get("SELECT * FROM outbox WHERE kind='workspace'"));
 }finally{s.close();}
});
test('report and statement access is subject/manager scoped and guild isolated',()=>{
 const s=new Store(':memory:'),hr=new PersonnelStore(s);try{const r=hr.submit(boss,'incident',uid,today(),today(),'Vardiya devri kaydi eksik birakildi.','RD-0001','incident');assert.throws(()=>hr.submit(psy,'incident',stranger,today(),today(),'Yetkisiz tutanak denemesi.','-','fake'));
 assert.throws(()=>hr.report({...psy,id:stranger},r.id),/ait degil/);assert.throws(()=>hr.report({...boss,guild:'888888888888888888'},r.id),/bulunamadi/);assert.throws(()=>hr.statement(boss,r.id,'Personel yerine aciklama veriyorum.','fake'));
 hr.statement(psy,r.id,'Devir kaydini sonradan tamamladim.','statement');hr.statement(psy,r.id,'Tekrar gelen teslim istegi.','statement');assert.equal(s.all('SELECT * FROM staff_statements').length,1);assert.throws(()=>hr.statement(psy,r.id,'Baska bir aciklama ile degistireyim.','statement2'),/zaten kayitli/);
 assert.throws(()=>s.run("UPDATE staff_statements SET body='changed'"));assert.throws(()=>s.run("UPDATE staff_reports SET body='changed'"));assert.throws(()=>s.run('DELETE FROM staff_reports'));
 assert.equal(hr.decide(boss,r.id,'closed','Aciklama goruldu, inceleme tamamlandi').state,'closed');assert.throws(()=>hr.statement(psy,r.id,'Kapanan kayda yeniden aciklama.','statement3'));
 }finally{s.close();}
});
test('handover is own-only, bounded dates are validated',()=>{
 const s=new Store(':memory:'),hr=new PersonnelStore(s);try{assert.throws(()=>hr.submit(boss,'handover',uid,today(),today(),'Baska personel adina devir.','-','wrong'));
 assert.throws(()=>hr.submit(psy,'absence',uid,'2026-02-30','2026-02-30','Gecersiz tarihle mazeret.','-','date'));
 assert.throws(()=>hr.submit(psy,'absence',uid,today(),'2099-01-01','Yillarca devam eden mazeret.','-','range'));
 const r=hr.submit(psy,'handover',uid,today(),today(),'Yarinki randevu icin saat teyidi bekleniyor.','RD-0001','handover');assert.equal(hr.decide(boss,r.id,'acknowledged','Devir bilgisi teslim alindi').state,'acknowledged');
 }finally{s.close();}
});
test('daily summaries use Istanbul midnight and never contain clinical note bodies',()=>{
 const s=new Store(':memory:'),hr=new PersonnelStore(s);try{const day='2026-10-30',range=dayRange(day);assert.equal(new Date(range.start).toISOString(),'2026-10-29T21:00:00.000Z');assert.equal(today(Date.parse('2026-10-29T21:00:00Z')),day);
 const c=s.openCase(psy,'Sentetik Danisan','555',uid,'case');const v=s.addVisit(psy,c.id,'ilk','Gizli klinik notu bu ozette gorunmemeli.','visit');s.run('UPDATE visits SET at=? WHERE id=?',range.start,v.id);
 s.run('INSERT INTO shifts(guild,staff,starts,ends) VALUES(?,?,?,?)',guild,uid,range.start-1800000,range.start+1800000);
 const d=hr.daily(psy,uid,day);assert.equal(d.visits.length,1);assert.equal(d.minutes,30);assert.ok(!JSON.stringify(d).includes('Gizli klinik'));assert.throws(()=>hr.daily(psy,stranger,day));
 s.run('UPDATE visits SET at=? WHERE id=?',range.start-1,v.id);assert.equal(hr.daily(psy,uid,day).visits.length,0);
 }finally{s.close();}
});
function fixture(){
 const s=new Store(':memory:');for(const [n,key] of Object.keys(roles).entries())s.setResource(guild,`role:${key}`,String(400000000000000000n+BigInt(n)));
 let active=true,created=0,sends=0,edits=0;const members=new Set<string>(),messages=new Map();
 const thread:any={id:'555555555555555555',type:ChannelType.PrivateThread,parentId:'444444444444444444',name:`psikolog-ornek-${uid}`,archived:false,locked:false,invitable:false,
 members:{add:async(id:string)=>{members.add(id);},remove:async(id:string)=>{members.delete(id);}},setArchived:async(v:boolean)=>{thread.archived=v;},setLocked:async(v:boolean)=>{thread.locked=v;},setInvitable:async(v:boolean)=>{thread.invitable=v;},messages:{fetch:async(id:string)=>messages.get(id)},send:async()=>{sends++;const message={id:String(600000000000000000n+BigInt(sends)),edit:async()=>{edits++;}};messages.set(message.id,message);return message;}};
 const parent:any={id:'444444444444444444',type:ChannelType.GuildText,permissionOverwrites:{set:async()=>{}},threads:{cache:new Collection(),fetchActive:async()=>{},fetchArchived:async()=>({threads:new Collection(),hasMore:false}),create:async(o:any)=>{created++;thread.name=o.name;parent.threads.cache.set(thread.id,thread);return thread;}}};
 const member:any={id:uid,user:{bot:false},displayName:'Ornek Psikolog',roles:{get cache(){return new Collection(active?[[s.resource(guild,'role:psychologist')!,{}],[s.resource(guild,'role:staff')!,{}]]:[]);}}};
 const g:any={id:guild,client:{user:{id:'777777777777777777'}},members:{fetch:async()=>member},channels:{fetch:async(id:string)=>id===parent.id?parent:id===thread.id?thread:null}};
 s.setResource(guild,'channel:people',parent.id);const bot=new ClinicBot({} as Client,s,{guild,owners:[manager],app:g.client.user.id,token:'unused',data:'unused'});
 return {s,bot,g:g as Guild,parent,thread,members,setActive:(value:boolean)=>{active=value;},counts:()=>({created,sends,edits})};
}
test('personal thread is private, reuses its ID and daily card, and revokes inactive staff',async()=>{
 const f=fixture();try{await f.bot.personnel.refresh(f.g,uid);await f.bot.personnel.refresh(f.g,uid);assert.deepEqual(f.counts(),{created:1,sends:1,edits:1});assert.ok(f.members.has(uid));assert.equal(f.s.resource(guild,`workspace:${uid}`),f.thread.id);assert.equal(f.s.resource(guild,`workspace-start:${uid}`),undefined);
 const perms=overwrites(f.g,f.s,['staff'],undefined,true);assert.ok(!perms.some(p=>p.id===uid));assert.ok(perms.some(p=>p.id===guild&&'deny' in p&&(p.deny as bigint[]).includes(P.ViewChannel)));assert.ok(perms.some(p=>p.id===f.s.resource(guild,'role:staff')));
 f.setActive(false);await f.bot.personnel.refresh(f.g,uid);assert.ok(!f.members.has(uid));assert.equal(f.thread.locked,true);assert.equal(f.thread.archived,true);assert.equal(f.s.resource(guild,`workspaceactive:${uid}`),'0');
 f.setActive(true);await f.bot.personnel.refresh(f.g,uid);assert.ok(f.members.has(uid));assert.equal(f.thread.archived,false);assert.equal(f.counts().created,1);
 }finally{f.s.close();}
});
test('uncertain workspace recovers archived thread without a duplicate',async()=>{
 const f=fixture();try{f.s.setResource(guild,`workspace-start:${uid}`,'1');f.thread.archived=true;f.parent.threads.fetchArchived=async()=>({threads:new Collection([[f.thread.id,f.thread]]),hasMore:false});await f.bot.personnel.ensure(f.g,uid);assert.equal(f.counts().created,0);assert.equal(f.s.resource(guild,`workspace:${uid}`),f.thread.id);assert.equal(f.thread.archived,false);
 }finally{f.s.close();}
});
test('unknown create result blocks rather than creating a second workspace',async()=>{
 const f=fixture();try{f.s.setResource(guild,`workspace-start:${uid}`,'1');await assert.rejects(f.bot.personnel.ensure(f.g,uid),{name:'DeliveryUncertain'});assert.equal(f.counts().created,0);}finally{f.s.close();}
});
test('forged personnel statement button cannot submit for a different employee',async()=>{
 const f=fixture();try{const r=f.bot.personnel.data.submit(boss,'incident',stranger,today(),today(),'Sentetik olay tutanagi aciklamasi.','-','r');const replies:unknown[]=[];
 const i={id:'forged',guild:f.g,guildId:guild,user:{id:uid},customId:`pk:hr:statement:${r.id}`,deferred:false,replied:false,isChatInputCommand:()=>false,isButton:()=>false,isModalSubmit:()=>true,deferReply:async()=>{i.deferred=true;},editReply:async(r:unknown)=>{replies.push(r);},fields:{getTextInputValue:()=> 'Baska personel yerine aciklama.'}};
 await f.bot.handle(i as unknown as Interaction);assert.equal(f.s.all('SELECT * FROM staff_statements').length,0);assert.match(JSON.stringify(replies),/ait degil/);
 }finally{f.s.close();}
});
test('Sharp cards render escaped content with bundled fonts and bounded image size',async()=>{
 const s=new Store(':memory:'),hr=new PersonnelStore(s);try{const r=hr.submit(psy,'absence',uid,today(),today(),'<span size="99999">markup denemesi</span> & metin','-','r');
 const images=await Promise.all([dailyCard('Uzun Ornek Personel Adi <b>metin</b>','Psikolog',{day:today(),cases:100,appointments:12,minutes:120,pending:10,visits:[1],activeShift:true},true),reportCard('Ornek Personel',r,true)]);
 for(const bytes of images){const m=await sharp(bytes).metadata();assert.equal(m.width,1200);assert.equal(m.height,760);assert.equal(m.format,'png');assert.ok(bytes.byteLength<1000000);}
 }finally{s.close();}
});
test('personnel reports and original statements survive full backup and restore',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrica-hr-'));const s=new Store(join(dir,'live.sqlite')),hr=new PersonnelStore(s);
 try{const r=hr.submit(boss,'incident',uid,today(),today(),'Sentetik vardiya devri kaydi.','RD-0001','r');hr.statement(psy,r.id,'Sentetik personel aciklamasi.','statement');hr.decide(boss,r.id,'closed','Aciklama okunarak kapatildi.');
 await s.backup(join(dir,'backup.sqlite'));const counts=restoreBackup(join(dir,'backup.sqlite'),join(dir,'restored.sqlite'));assert.equal(counts.staff_reports,1);assert.equal(counts.staff_statements,1);
 const restored=new Store(join(dir,'restored.sqlite'));try{const h=new PersonnelStore(restored);assert.equal(h.report(psy,r.id).state,'closed');assert.equal(restored.get<{body:string}>('SELECT body FROM staff_statements')!.body,'Sentetik personel aciklamasi.');}finally{restored.close();}
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('concurrent Sharp requests serialize font registration safely',async()=>{
 const images=await Promise.all(Array.from({length:6},(_,i)=>dailyCard(`Ornek ${i}`,'Psikolog',{day:today(),cases:i,appointments:0,minutes:0,pending:0,visits:[],activeShift:false},true)));assert.equal(images.length,6);for(const image of images)assert.equal((await sharp(image).metadata()).width,1200);
});
test('manual recovery requires an exact report code and never replaces a different card',async()=>{
 const f=fixture();try{const r=f.bot.personnel.data.submit(boss,'incident',uid,today(),today(),'Sentetik olay tutanagi aciklamasi.','-','r');let title='IK-00010 | Personel tutanagi';
 const channel={id:'666666666666666666',type:ChannelType.GuildText,isTextBased:()=>true,messages:{fetch:async()=>({author:{id:'777777777777777777'},embeds:[{title}]})}};
 f.s.setResource(guild,'channel:personnel',channel.id);const previous=f.g.channels.fetch.bind(f.g.channels);Object.assign(f.g.channels,{fetch:async(id:string)=>id===channel.id?channel:previous(id)});
 const i={guild:f.g,options:{getSubcommand:()=> 'personel-kurtar',getString:(key:string)=>({tur:'report-manager',hedef:`IK-${String(r.id).padStart(4,'0')}`,kimlik:'888888888888888888'} as Record<string,string>)[key],getBoolean:()=>false},editReply:async()=>{}} as unknown as ChatInputCommandInteraction;
 await assert.rejects(f.bot.personnel.command(i,boss),/eslesmiyor/);assert.equal(f.s.resource(guild,`hrmsg:${r.id}:management`),undefined);
 title='IK-0001 | Personel tutanagi';await f.bot.personnel.command(i,boss);assert.equal(f.s.resource(guild,`hrmsg:${r.id}:management`),'888888888888888888');
 }finally{f.s.close();}
});
