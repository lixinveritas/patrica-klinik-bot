import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client,Guild,Interaction,TextChannel} from 'discord.js';
import {Store} from '../src/store.js';
import {Actor} from '../src/domain.js';
import {ClinicBot} from '../src/bot.js';
import {auditBatches,deliver,DeliveryUncertain,recordHtml} from '../src/delivery.js';
import {inspectBackup,restoreBackup} from '../src/recovery.js';
const guild='999999999999999999',owner='111111111111111111',other='222222222222222222';
const psy:Actor={id:owner,guild,jobs:['psychologist']},boss:Actor={id:other,guild,jobs:['manager']};
test('outbox commits with data, survives reopen, and retries do not duplicate financial records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrica-queue-'));let s=new Store(join(dir,'db.sqlite'));
 try{const c=s.openCase(psy,'Deneme Kisi','555',owner,'case');s.addVisit(psy,c.id,'ilk','Yeterli uzunlukta gorusme notu','visit');s.close();s=new Store(join(dir,'db.sqlite'));
 const j=s.claim(guild)!;assert.ok(j);s.finish(j,{code:429});assert.equal(s.get<{state:string}>('SELECT state FROM outbox WHERE guild=? AND kind=? AND target=?',guild,j.kind,j.target)!.state,'pending');
 assert.equal(s.all('SELECT * FROM visits').length,1);assert.equal(s.all('SELECT * FROM ledger').length,0);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('queue rollback, new version while running, leases and blocked permission failures',()=>{
 const s=new Store(':memory:');try{
 assert.throws(()=>s.tx(()=>{s.enqueue(guild,'cash','1');throw new Error('abort');}));assert.equal(s.claim(guild),undefined);
 s.enqueue(guild,'cash','1');const first=s.claim(guild)!;assert.equal(s.claim(guild),undefined);s.enqueue(guild,'cash','1');s.finish(first);const second=s.claim(guild)!;assert.ok(second.version>first.version);
 s.finish(second,{code:50013});assert.equal(s.claim(guild),undefined);assert.equal(s.get<{state:string}>('SELECT state FROM outbox')!.state,'blocked');
 s.enqueue(guild,'cash','2');s.claim(guild);const recovered=s.claim(guild,Date.now()+300001);assert.equal(recovered?.target,'2');
 }finally{s.close();}
});
test('100 audit events split without lost entries',()=>{
 const events=Array.from({length:100},(_,id)=>({id,text:'x'.repeat(250)}));const batches=auditBatches(events,r=>`${r.id} ${r.text}`);
 assert.equal(batches.flat().length,100);assert.deepEqual(batches.flat(),events);for(const b of batches)assert.ok(b.map(r=>`${r.id} ${r.text}`).join('\n').length<=1900);
});
test('delivery edits saved ID, nonce retries and old uncertain sends require review',async()=>{
 const s=new Store(':memory:');let sent=0,edited=0;const nonces:string[]=[];
 const ch={messages:{fetch:async()=>({id:'123',edit:async()=>{edited++;}})},send:async(p:{nonce:string;enforceNonce:boolean})=>{sent++;nonces.push(p.nonce);assert.equal(p.enforceNonce,true);return {id:'123'};}} as unknown as TextChannel;
 try{await deliver(s,guild,'msg:1',ch,{content:'test'});await deliver(s,guild,'msg:1',ch,{content:'updated'});assert.equal(sent,1);assert.equal(edited,1);
 s.setResource(guild,'send:msg:2',String(Date.now()-120001));await assert.rejects(deliver(s,guild,'msg:2',ch,{content:'test'}),DeliveryUncertain);assert.equal(sent,1);
 const broken={...ch,send:async(p:{nonce:string})=>{nonces.push(p.nonce);throw new Error('timeout');}} as unknown as TextChannel;
 await assert.rejects(deliver(s,guild,'msg:3',broken,{content:'test'}));await assert.rejects(deliver(s,guild,'msg:3',broken,{content:'test'}));assert.equal(nonces.at(-1),nonces.at(-2));
 }finally{s.close();}
});
test('case search scopes and pagination with 100 records; clinical notes excluded',()=>{
 const s=new Store(':memory:');try{for(let n=0;n<100;n++)s.openCase(boss,`Danisan ${n}`,'555',n%2?owner:other,`case${n}`);
 const all=[];for(let p=0;p<5;p++){const rows=s.findCases(psy,'',p).slice(0,10);assert.ok(rows.every(r=>r.owner===owner));all.push(...rows);}
 assert.equal(all.length,50);assert.equal(new Set(all.map(r=>r.id)).size,50);assert.equal(s.findCases(psy,'PK-0001').length,0);assert.equal(s.findCases(boss,'PK-0001')[0]?.id,1);
 const receptionist:Actor={id:'333333333333333333',guild,jobs:['reception']};assert.equal(s.findCases(receptionist).length,11);assert.equal(Object.hasOwn(s.findCases(receptionist)[0]!,'note'),false);
 assert.throws(()=>s.findCases({...psy,jobs:['finance']}));assert.throws(()=>s.findCases(psy,'',-1));
 }finally{s.close();}
});
test('transfer conflict rolls back owner and appointments; cancel alternative works',()=>{
 const s=new Store(':memory:');try{const a=s.openCase(boss,'Kisi Bir','555',owner,'a'),b=s.openCase(boss,'Kisi Iki','555',other,'b');const start=Date.now()+3600000;
 const ap=s.book(boss,a.id,start,30,'ra');s.book(boss,b.id,start,30,'rb');assert.throws(()=>s.transfer(boss,a.id,other),/cakisiyor/);assert.equal(s.case(boss,a.id).owner,owner);assert.equal(s.get<{staff:string}>('SELECT staff FROM appointments WHERE id=?',ap.id)!.staff,owner);
 s.transfer(boss,a.id,other,true);assert.equal(s.case(boss,a.id).owner,other);assert.equal(s.get<{state:string}>('SELECT state FROM appointments WHERE id=?',ap.id)!.state,'cancelled');assert.ok(s.resource(guild,`revoke:${a.id}:${owner}`));
 }finally{s.close();}
});
test('tariff snapshots, reconciliation and custody leave ledger immutable',()=>{
 const s=new Store(':memory:');try{const c=s.openCase(psy,'Kisi Test','555',owner,'c');const v=s.addVisit(psy,c.id,'ilk','Yeterli uzunlukta gorusme notu','v');s.tariff(boss,'takip',17000);const next=s.addVisit(psy,c.id,'takip','Yeterli uzunlukta ikinci not','v2');assert.equal(v.amount,20000);assert.equal(next.amount,17000);assert.equal(s.visit(psy,v.id).amount,20000);
 const cash=s.submitCash(psy,'income',`SN-${v.id}`,v.amount,'Yeterli uzunlukta odeme kaniti','cash');s.decideCash(boss,cash.id,true,'Oyunda dogrulandi');assert.equal(s.summary(boss).undelivered,20000);s.receive(boss,cash.id);s.receive(boss,cash.id);assert.equal(s.summary(boss).undelivered,0);
 const r=s.reconcile(boss,18000,'Oyunda sayilan kasa','reconcile');assert.equal(r.difference,-2000);assert.equal(s.reconcile(boss,18000,'Yeniden deneme','reconcile').id,r.id);assert.equal(s.summary(boss).balance,20000);assert.equal(s.all('SELECT * FROM ledger').length,1);
 }finally{s.close();}
});
test('safe HTML exports escape malicious notes',()=>{const html=recordHtml('<script>','<img src=x onerror=alert(1)> & "');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);assert.match(html,/default-src 'none'/);});
test('full restore preserves evidence bytes, resources, ledger and rejects overwrite or corruption',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrica-restore-'));const s=new Store(join(dir,'live.sqlite'));try{
 const data=Buffer.from('Odeme kanitinin orijinal dosya verisi.');const hash='a'.repeat(64);const c=s.openCase(psy,'Kisi Test','555',owner,'c'),v=s.addVisit(psy,c.id,'ilk','Yeterli uzunlukta gorusme notu','v');const cash=s.submitCash(psy,'income',`SN-${v.id}`,v.amount,'Kanit dosyasi eklendi.','cash',{hash,data,mime:'text/plain',name:'kanit.txt'});s.decideCash(boss,cash.id,true,'Oyunda kontrol edildi');s.setResource(guild,'channel:cash','444444444444444444');
 const backup=join(dir,'backup.sqlite'),target=join(dir,'restored.sqlite');await s.backup(backup);const counts=restoreBackup(backup,target);assert.equal(counts.cash_evidence,1);const restored=new Store(target);try{assert.deepEqual(Buffer.from(restored.evidence(boss,cash.id)!.data),data);assert.equal(restored.summary(boss).balance,20000);assert.equal(restored.resource(guild,'channel:cash'),'444444444444444444');assert.equal(inspectBackup(target).resources,counts.resources);}finally{restored.close();}
 assert.throws(()=>restoreBackup(backup,target));assert.throws(()=>inspectBackup(join(dir,'missing.sqlite')));assert.ok(readFileSync(target).length>0);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('interaction acknowledges before fresh member lookup, modal opens without lookup',async()=>{
 const s=new Store(':memory:');let ack=false,fetches=0;
 const g={id:guild,members:{fetch:async()=>{fetches++;assert.ok(ack);return {roles:{cache:new Map()}};}}} as unknown as Guild;
 const bot=new ClinicBot({} as Client,s,{guild,app:'777777777777777777',owners:[],data:'unused',token:'unused'});
 const i={id:'123',guild:g,guildId:guild,user:{id:owner},member:{roles:[]},deferred:false,replied:false,customId:'pk:applicationstatus',isChatInputCommand:()=>false,isButton:()=>true,isModalSubmit:()=>false,deferReply:async()=>{ack=true;i.deferred=true;},editReply:async()=>{},reply:async()=>{},showModal:async()=>{ack=true;}};
 try{await bot.handle(i as unknown as Interaction);assert.ok(ack);assert.equal(fetches,1);ack=false;i.customId='pk:apply:psychologist';i.deferred=false;await bot.handle(i as unknown as Interaction);assert.ok(ack);assert.equal(fetches,1);}finally{s.close();}
});
test('old schema backup restores and new optional tables migrate on open',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrica-old-'));const s=new Store(join(dir,'old.sqlite'));
 try{for(const table of ['cash_evidence','outbox','tariffs','reconciliations','custody'])s.db.exec(`DROP TABLE ${table}`);s.close();const target=join(dir,'new.sqlite');const counts=restoreBackup(join(dir,'old.sqlite'),target);assert.equal(counts.outbox,0);assert.equal(counts.cash_evidence,0);const restored=new Store(target);try{restored.enqueue(guild,'case','1');assert.ok(restored.claim(guild));}finally{restored.close();}}
 finally{try{s.close();}catch{}rmSync(dir,{recursive:true,force:true});}
});
test('transfer does not commit when former thread access cannot be revoked',async()=>{
 const s=new Store(':memory:');const c=s.openCase(boss,'Dosya Test','555',owner,'c');s.run('UPDATE cases SET channel=? WHERE id=?','444444444444444444',c.id);
 const g={id:guild,channels:{fetch:async()=>({type:12,members:{remove:async()=>{throw new Error('permission denied');}}})},members:{fetch:async()=>({roles:{cache:new Map()}})}} as unknown as Guild;
 const bot=new ClinicBot({} as Client,s,{guild,app:'777777777777777777',owners:[other],data:'unused',token:'unused'});let reply='';
 const i={id:'transfer',guild:g,guildId:guild,user:{id:other},deferred:false,replied:false,commandName:'klinik',isChatInputCommand:()=>true,isButton:()=>false,isModalSubmit:()=>false,deferReply:async()=>{i.deferred=true;},editReply:async(r:unknown)=>{reply=JSON.stringify(r);},options:{getSubcommand:()=> 'devret',getString:()=>`PK-${c.id}`,getUser:()=>({id:other}),getBoolean:()=>false}};
 try{await bot.handle(i as unknown as Interaction);assert.equal(s.case(boss,c.id).owner,owner);assert.ok(!reply.includes('Dosya ve gelecekteki randevular kaydedildi'));}finally{s.close();}
});
test('audit second-send failure advances cursor only through confirmed events',async()=>{
 const s=new Store(':memory:');let sent=0;const messages=new Map();const ch={type:0,messages:{fetch:async(id:string)=>messages.get(id)},send:async()=>{sent++;if(sent===2)throw new Error('timeout');const m={id:String(sent),edit:async()=>{}};messages.set(m.id,m);return m;}};
 const g={id:guild,channels:{fetch:async()=>ch}} as unknown as Guild;const client={guilds:{fetch:async()=>g}} as unknown as Client;
 try{for(let n=0;n<100;n++)s.audit(boss,'event.test',`${n}-`+'x'.repeat(150));s.setResource(guild,'channel:appointments','444444444444444444');s.setResource(guild,'channel:audit','555555555555555555');s.setResource(guild,'backup:last',String(Date.now()));const bot=new ClinicBot(client,s,{guild,app:'777777777777777777',owners:[other],data:'unused',token:'unused'});
 await assert.rejects(bot.tick());const cursor=Number(s.resource(guild,'audit:cursor'));assert.ok(cursor>0&&cursor<100);await bot.tick();assert.equal(Number(s.resource(guild,'audit:cursor')),100);
 }finally{s.close();}
});
test('Windows supervisor restarts crashed isolated child and preserves foreign lock',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrica-supervisor-'));mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'dist/src'),{recursive:true});writeFileSync(join(dir,'.env'),'');
 copyFileSync(new URL('../../scripts/supervise.mjs',import.meta.url),join(dir,'scripts/supervise.mjs'));
 const fake="const fs=require('fs');fs.writeFileSync('data/bot.lock',String(process.pid));fs.appendFileSync('data/starts','start\\n');setTimeout(()=>process.exit(1),20);";
 writeFileSync(join(dir,'dist/src/main.js'),fake);
 const run=()=>spawn(process.execPath,['scripts/supervise.mjs'],{cwd:dir,windowsHide:true,stdio:'ignore'});
 let child=run();const exited=new Promise(r=>child.once('exit',r));
 try{const until=Date.now()+9000;while(Date.now()<until){if(existsSync(join(dir,'data/starts'))&&readFileSync(join(dir,'data/starts'),'utf8').trim().split('\n').length>=2)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(readFileSync(join(dir,'data/starts'),'utf8').trim().split('\n').length>=2);child.kill();await exited;await new Promise(r=>setTimeout(r,100));
 for(const name of ['supervisor.lock','bot.lock'])if(existsSync(join(dir,'data',name)))rmSync(join(dir,'data',name));
 writeFileSync(join(dir,'dist/src/main.js'),"require('fs').writeFileSync('data/bot.lock','foreign');process.exit(1);");child=run();await new Promise(r=>child.once('exit',r));assert.equal(readFileSync(join(dir,'data/bot.lock'),'utf8'),'foreign');
 }finally{child.kill();rmSync(dir,{recursive:true,force:true});}
});
