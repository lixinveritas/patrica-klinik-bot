import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MAX_EVIDENCE, discordFileUrl, downloadEvidence, validateEvidence } from '../src/evidence.js';
import { Store } from '../src/store.js';
import { ClinicBot } from '../src/bot.js';
import { Client } from 'discord.js';
import { modal, forms } from '../src/ui.js';
const text=Buffer.from('[21:00:00] ODEME: Klinik hesabina 20000 dolar gonderildi.');
const a={id:'111111111111111111',guild:'999999999999999999',jobs:['manager'] as ['manager']};
test('yalniz Discord attachment CDN URLleri kabul edilir',()=>{
 for(const url of ['http://cdn.discordapp.com/attachments/1/2/a.txt','https://evil.test/attachments/1/2/a.txt','https://cdn.discordapp.com.evil.test/attachments/1/2/a.txt','https://cdn.discordapp.com:8443/attachments/1/2/a.txt','https://user@cdn.discordapp.com/attachments/1/2/a.txt','https://cdn.discordapp.com/other/a.txt'])assert.throws(()=>discordFileUrl(url));
 assert.equal(discordFileUrl('https://cdn.discordapp.com/attachments/1/2/a.txt?ex=123').hostname,'cdn.discordapp.com');
});
test('UTF8 TXT ve LOG kabul, binary ve farkli uzanti reddedilir',async()=>{
 assert.equal((await validateEvidence('chat.log',text)).mime,'text/plain');
 await assert.rejects(validateEvidence('evil.exe',text));await assert.rejects(validateEvidence('chat.txt',Buffer.alloc(100)));
 await assert.rejects(validateEvidence('chat.txt',Buffer.alloc(256*1024+1,65)));await assert.rejects(validateEvidence('chat.txt',Buffer.from([0xff,0xfe,0x00])));
});
test('gercek gorsel PNGye normalize edilir, sahte ve animasyonlu dosya reddedilir',async()=>{
 const jpeg=await sharp({create:{width:100,height:50,channels:3,background:'#123f36'}}).jpeg().toBuffer();
 const e=await validateEvidence('chat.jpg',jpeg);assert.equal(e.mime,'image/png');assert.equal((await sharp(e.data).metadata()).format,'png');
 await assert.rejects(validateEvidence('fake.png',text));await assert.rejects(validateEvidence('wrong.webp',jpeg));
});
test('indirme byte siniri, boyut eslesmesi ve redirect engeli',async()=>{
 const upload={name:'chat.txt',url:'https://cdn.discordapp.com/attachments/1/2/a.txt',size:text.byteLength};
 const ok=await downloadEvidence(upload,async(_url,options)=>{assert.equal(options?.redirect,'error');assert.ok(options?.signal);return new Response(text);});assert.equal(ok.mime,'text/plain');
 await assert.rejects(downloadEvidence({...upload,size:1},async()=>new Response(text)),/eslesmedi/);
 await assert.rejects(downloadEvidence(upload,async()=>new Response(Buffer.alloc(MAX_EVIDENCE+1))),/siniri/);
 await assert.rejects(downloadEvidence(upload,async()=>new Response('',{status:403})),/indirilemedi/);
});
test('dosya kaniti para kaydiyla atomik saklanir, ad degisimi ayni dosyayi cogaltmaz',async()=>{
 const s=new Store(':memory:');try{
 const e=await validateEvidence('ilk.txt',text);const r=s.submitCash(a,'expense','Kira',1000,'Dosya kaniti eklendi.','one',e);
 const recovered=s.evidence(a,r.id)!;assert.equal(Buffer.from(recovered.data).toString(),text.toString());
 await assert.rejects(async()=>s.submitCash(a,'expense','Baska gider',2000,'Dosya kaniti eklendi.','two',await validateEvidence('isim-degisti.log',text)),/daha once/);
 assert.throws(()=>s.evidence({...a,jobs:[]},r.id),/yetkin/);assert.throws(()=>s.evidence({...a,guild:'888888888888888888'},r.id),/bulunamadi/);
 assert.equal(s.all('SELECT * FROM cash_evidence').length,1);
 }finally{s.close();}
});
test('gorselli embed attachment onizler, TXT sadece dosya olarak sunulur',async()=>{
 const s=new Store(':memory:');try{
 const bot=new ClinicBot({} as Client,s,{token:'unused',app:'777777777777777777',guild:a.guild,owners:[a.id],data:'unused'});
 const png=await sharp({create:{width:50,height:50,channels:3,background:'#123f36'}}).png().toBuffer();
 const r=s.submitCash(a,'expense','Gorselli gider',100,'Dosya kaniti eklendi.','image',await validateEvidence('kanit.png',png));
 assert.match(bot.cashPayload(r).embeds[0]!.toJSON().image!.url,/^attachment:\/\/FIN-\d+-kanit\.png$/);
 const t=s.submitCash(a,'expense','Metinli gider',100,'Dosya kaniti eklendi.','txt',await validateEvidence('kanit.txt',text));
 assert.equal(bot.cashPayload(t).embeds[0]!.toJSON().image,undefined);assert.equal(bot.cashPayload(t).files[0]!.name,'FIN-0002-chatlog.txt');
 }finally{s.close();}
});
test('finans formlarinda tek dosya yukleme var, eski proof metin kutusu yok',()=>{
 for(const key of ['income','expense','refund']) {
  const f=forms[key]!;const json=modal(`form:${key}`,f.title,f.fields).toJSON();
  const raw=JSON.stringify(json);assert.match(raw,/"type":19/);assert.match(raw,/"max_values":1/);assert.ok(!raw.includes('"custom_id":"proof"'));
 }
});
