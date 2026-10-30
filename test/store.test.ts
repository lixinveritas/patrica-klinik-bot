import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Actor, characterName, localTime, money, service } from '../src/domain.js';
import { Store } from '../src/store.js';

const psy:Actor={id:'111111111111111111',guild:'999999999999999999',jobs:['psychologist']};
const boss:Actor={id:'222222222222222222',guild:psy.guild,jobs:['manager']};
const finance:Actor={id:'333333333333333333',guild:psy.guild,jobs:['finance']};
const reception:Actor={id:'444444444444444444',guild:psy.guild,jobs:['reception']};
const outsider:Actor={id:'555555555555555555',guild:psy.guild,jobs:[]};
const proof=(n:number)=>`[21:05:${String(n).padStart(2,'0')}] ODEME: Klinik hesabina 20000 dolar aktarildi. Islem ${n}`;
function fixture(){const s=new Store(':memory:');const c=s.openCase(psy,'Kurgu Danisan','5550000',psy.id,'case1');const v=s.addVisit(psy,c.id,'ilk','Danisanin beyan ve gorusme hedefi kaydedildi.','visit1');return {s,c,v};}
test('bekleyen tahsilat kasa degistirmez, tarife sunucu tarafinda belirlenir',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(psy,'income',`SN-${v.id}`,1,proof(1),'cash1');assert.equal(r.amount,20000);assert.equal(s.summary(boss).balance,0);assert.equal(s.summary(boss).pending,20000);assert.equal(s.summary(boss).unbilled,0);}finally{s.close();}
});
test('kendi tahsilatini yonetici bile onaylayamaz',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(boss,'income',`SN-${v.id}`,20000,proof(1),'cash1');assert.throws(()=>s.decideCash(boss,r.id,true,'Kontrol edildi'),/Kendi/);assert.equal(s.summary(boss).balance,0);}finally{s.close();}
});
test('onay tekrari bir kez yazar, ters karar reddedilir',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'cash1');s.decideCash(finance,r.id,true,'Klinik hesabinda goruldu');s.decideCash(finance,r.id,true,'Tekrar');assert.equal(s.summary(boss).balance,20000);assert.equal(s.all('SELECT * FROM ledger').length,1);assert.throws(()=>s.decideCash(finance,r.id,false,'Degistir'),/sonuclanmis/);}finally{s.close();}
});
test('ayni seans ikinci kez tahsil edilmez; reddedilince yeni kanitla duzeltilebilir',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'cash1');assert.throws(()=>s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(2),'cash2'),/zaten/);s.decideCash(finance,r.id,false,'Odeme bulunamadi');assert.equal(s.summary(boss).unbilled,20000);s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(2),'cash2');}finally{s.close();}
});
test('istek tekrarinda ayni kayit doner, ayni kanit baska islemde kullanilmaz',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'cash1');assert.equal(s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'cash1').id,r.id);assert.throws(()=>s.submitCash(boss,'expense','Gider',100,proof(1),'e1'),/kaniti/);}finally{s.close();}
});
test('iade siniri bekleyen ve onayli iadeleri birlikte sayar',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'cash1');s.decideCash(finance,r.id,true,'Gelen para kontrol edildi');const refund=s.submitCash(boss,'refund',`FIN-${r.id}`,15000,proof(2),'refund');assert.throws(()=>s.submitCash(finance,'refund',`FIN-${r.id}`,6000,proof(3),'refund2'),/asamaz/);s.decideCash(finance,refund.id,true,'Iade transferi eslesti');assert.equal(s.summary(boss).balance,5000);}finally{s.close();}
});
test('gider kasayi eksiye indiremez, basarisiz onay atomik',()=>{
 const {s}=fixture();try{const r=s.submitCash(boss,'expense','Kira',10000,proof(2),'e1');assert.throws(()=>s.decideCash(finance,r.id,true,'Kira onayi'),/karsilamiyor/);assert.equal(s.cash(psy.guild,r.id).state,'pending');assert.equal(s.all('SELECT * FROM ledger').length,0);}finally{s.close();}
});
test('resepsiyon ve baska psikolog seans notuna erisemez',()=>{
 const {s,c}=fixture();try{assert.throws(()=>s.case(reception,c.id),/yetkin/);assert.throws(()=>s.case({...psy,id:'666666666666666666'},c.id),/atanmamis/);assert.throws(()=>s.addVisit(reception,c.id,'takip','Not aciklamasi','bad'),/yetkin/);assert.throws(()=>s.summary(psy),/yetkin/);}finally{s.close();}
});
test('sunucular arasi kimliklerle dosya, para ve basvuruya erisilemez',()=>{
 const {s,c,v}=fixture();try{const wrong={...boss,guild:'888888888888888888'};assert.throws(()=>s.case(wrong,c.id),/bulunamadi/);assert.throws(()=>s.visit(wrong,v.id),/bulunamadi/);const r=s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'cash1');assert.throws(()=>s.decideCash(wrong,r.id,true,'Kontrol edildi'),/bulunamadi/);assert.equal(s.summary(wrong).balance,0);}finally{s.close();}
});
test('para parseri ondalik, negatif, us, ayirici ve NaN reddeder',()=>{
 for(const v of ['-1','1.5','20.000','1e5','0','NaN',Infinity,1.5,100000000])assert.throws(()=>money(v));assert.equal(money('20000'),20000);assert.throws(()=>service('toString'));
});
test('gider aciklamasi finans kartina sahte satir ekleyemez',()=>{
 const {s}=fixture();try{assert.throws(()=>s.submitCash(boss,'expense','Kira\nTutar: 1$',10000,proof(3),'spoof'),/tek satir/);}finally{s.close();}
});
test('ilk gorusme bir defa, takip oncesinde ilk kaydi gerekir',()=>{
 const {s,c}=fixture();try{assert.throws(()=>s.addVisit(psy,c.id,'ilk','Yeterli uzunlukta not','v2'),/zaten/);assert.equal(s.addVisit(psy,c.id,'takip','Takip gorusmesinin kisa notu','v2').amount,15000);const other=s.openCase(psy,'Diger Kisi','5550001',psy.id,'c2');assert.throws(()=>s.addVisit(psy,other.id,'takip','Yeterli uzunlukta not','v3'),/Once/);}finally{s.close();}
});
test('dosya ve seans isteklerinin yeniden teslimi kopya uretmez',()=>{
 const {s,c,v}=fixture();try{assert.equal(s.openCase(psy,'Kurgu Danisan','5550000',psy.id,'case1').id,c.id);assert.equal(s.addVisit(psy,c.id,'ilk','Danisanin beyan ve gorusme hedefi kaydedildi.','visit1').id,v.id);}finally{s.close();}
});
test('randevu cakismasi, sinir saat ve iptal',()=>{
 const {s,c}=fixture();try{const starts=Date.now()+86400000;const r=s.book(reception,c.id,starts,30,'a1');assert.equal(s.book(reception,c.id,starts,30,'a1').id,r.id);assert.throws(()=>s.book(reception,c.id,starts+10*60000,30,'a2'),/randevusu/);s.book(reception,c.id,starts+30*60000,30,'a3');s.appointmentState(reception,r.id,'cancelled');s.book(reception,c.id,starts,30,'a4');assert.throws(()=>s.book(reception,c.id,starts,0,'a5'));}finally{s.close();}
});
test('Istanbul saati ve takvim dogrulamasi',()=>{
 assert.equal(new Date(localTime('2026-11-02 21:30')).toISOString(),'2026-11-02T18:30:00.000Z');assert.throws(()=>localTime('2026-02-30 21:30'));assert.throws(()=>localTime('yarin aksam'));
});
test('tek acik basvuru ve yetkili karar',()=>{
 const s=new Store(':memory:');try{const r=s.apply(outsider,'Kurgu Personel','psychologist','IC egitim gecmisi, OOC deneyim ve senaryo cevabi.','b1');assert.throws(()=>s.apply(outsider,'Kurgu Personel','psychologist','Yeni basvuru icin yeterli aciklama.','b2'),/Bekleyen/);assert.throws(()=>s.decideApplication(reception,r.id,'approved','Uygun goruldu'),/yetkin/);s.decideApplication(boss,r.id,'interview','Gorusmeye uygun');s.decideApplication(boss,r.id,'approved','Gorusme tamamlandi');assert.equal(s.resource(outsider.guild,`staffname:${outsider.id}`),'Kurgu Personel');assert.equal(s.resource(outsider.guild,`nameapplied:${outsider.id}`),'pending');assert.throws(()=>s.decideApplication(boss,r.id,'rejected','Sonradan degistir'),/sonuclanmis/);}finally{s.close();}
});
test('karakter adi ad soyad ister ve Discord takma adi sinirina uyar',()=>{
 assert.equal(characterName('  Mira   Patrica  '),'Mira Patrica');
 for(const name of ['Mira','Mira123 Patrica','@everyone Patrica','Mira\nPatrica','A'.repeat(33)+' B'])assert.throws(()=>characterName(name));
});
test('audit ve defter satirlari uygulama SQLinden silinemez',()=>{
 const {s,v}=fixture();try{const r=s.submitCash(psy,'income',`SN-${v.id}`,20000,proof(1),'c1');s.decideCash(finance,r.id,true,'Kontrol edildi');assert.throws(()=>s.db.exec('DELETE FROM ledger'),/append only/);assert.throws(()=>s.db.exec('UPDATE audit SET actor=\'other\''),/append only/);}finally{s.close();}
});
test('kalici SQLite dosyasi ve tutarli yedek yeniden okunur',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'patrica-test-'));const s=new Store(join(dir,'test.sqlite'));try{const c=s.openCase(psy,'Kalici Kisi','555',psy.id,'persist');await s.backup(join(dir,'backup.sqlite'));const recovered=new Store(join(dir,'backup.sqlite'));try{assert.equal(recovered.case(psy,c.id).name,'Kalici Kisi');assert.equal(recovered.get<{integrity_check:string}>('PRAGMA integrity_check')!.integrity_check,'ok');}finally{recovered.close();}}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
