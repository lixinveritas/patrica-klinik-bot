import sharp, {OverlayOptions} from 'sharp';
import {fileURLToPath} from 'node:url';
import {escapeHtml} from './delivery.js';
import {StaffReport} from './personnel-store.js';
import {code} from './store.js';

const fonts=new URL('../../assets/fonts/',import.meta.url);
const ink='#183c35',muted='#4f625c',paper='#f4f1e9';
const clean=(s:string,max=100)=>s.replace(/[\p{Extended_Pictographic}\u200d\ufe0f\x00-\x1f]/gu,' ').replace(/\s+/g,' ').trim().slice(0,max);
let textQueue:Promise<unknown>=Promise.resolve();
function label(value:string,x:number,y:number,size=28,color=ink,width=1080,serif=false,maxHeight=80):Promise<OverlayOptions> {
  // fontfile updates process-wide Fontconfig state; serialize native text rendering.
  const task=textQueue.catch(()=>{}).then(()=>renderLabel(value,x,y,size,color,width,serif,maxHeight));textQueue=task;return task;
}
async function renderLabel(value:string,x:number,y:number,size:number,color:string,width:number,serif:boolean,maxHeight:number):Promise<OverlayOptions> {
  const family=serif?'Newsreader':'Manrope';
  const input=await sharp({text:{text:`<span foreground="${color}">${escapeHtml(clean(value,220))}</span>`,font:`${family} ${size}`,fontfile:fileURLToPath(new URL(`${family}.ttf`,fonts)),rgba:true,width,wrap:'word-char'}}).png().toBuffer();
  return {input:await sharp(input).resize({width,height:maxHeight,fit:'inside',withoutEnlargement:true}).png().toBuffer(),left:x,top:y};
}
const background=(height:number,lines:number[])=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}"><rect width="1200" height="${height}" fill="${paper}"/><rect width="1200" height="166" fill="${ink}"/>${lines.map(y=>`<path d="M60 ${y}H1140" stroke="#c8cec5"/>`).join('')}</svg>`);
export async function dailyCard(name:string,job:string,data:{day:string;cases:number;appointments:number;minutes:number;pending:number;visits:unknown[];activeShift:boolean},demo=false) {
  const overlays=await Promise.all([
    label('Patrica Klinik',58,34,61,paper,700,true,80),label(`${data.day} / ${demo?'ORNEK TASARIM':'PERSONEL DOSYASI'}`,62,120,20,'#d5e2d8',1050,false,32),
    label(name,60,205,43,ink,1060,false,64),label(`${job} / ${data.activeShift?'Mesaide':'Mesai kapali'}`,62,269,24,muted),
    label('Bugunku seans',62,354,27),label(String(data.visits.length),1040,341,49,ink,100,false,70),
    label('Bugunku randevu',62,432,27),label(String(data.appointments),1040,419,49,ink,100,false,70),
    label('Aktif dosya',62,510,27),label(String(data.cases),1040,497,49,ink,100,false,70),
    label(`Kayitli mesai: ${data.minutes} dk`,62,603,25,muted,530),label(`Bekleyen finans: ${data.pending}`,650,603,25,muted,490),
    label(demo?'Sentetik onizleme. Gercek personel veya kasa kaydi degildir.':'Kisisel calisma alani. Danisan notlari bu ozette gosterilmez.',62,685,21,muted,1080,false,45)
  ]);
  return sharp(background(760,[324,406,484,562,660])).composite(overlays).png().toBuffer();
}
export const reportTitles={absence:'Mazeret kaydi',incident:'Personel tutanagi',handover:'Devir notu'};
export const reportStates:Record<string,string>={pending:'Degerlendirme bekliyor',accepted:'Uygun goruldu',rejected:'Uygun gorulmedi',closed:'Inceleme kapatildi',acknowledged:'Teslim alindi'};
export async function reportCard(name:string,row:StaffReport,demo=false) {
  const overlays=await Promise.all([
    label('Patrica Klinik',58,34,61,paper,700,true),label(`${code('IK',row.id)} / ${demo?'ORNEK TASARIM':'PERSONEL KAYDI'}`,62,120,20,'#d5e2d8'),
    label(reportTitles[row.kind],60,208,47,ink,1080,true),label(name,62,283,31,ink),
    label(`${row.day}${row.until_day!==row.day?' / '+row.until_day:''}`,62,353,25,muted),label(reportStates[row.state]??row.state,62,411,28,ink),
    label(clean(row.body,190),62,490,29,ink,1060,false,126),
    label(demo?'Sentetik ornek. Gercek tutanak degildir.':'Tam metin, aciklama ve karar kaydin altinda. Otomatik yaptirim uygulanmaz.',62,668,21,muted,1080,false,60)
  ]);
  return sharp(background(760,[331,466,641])).composite(overlays).png().toBuffer();
}
export async function panelCard(title:string,description:string) {
  return sharp(background(380,[338])).composite(await Promise.all([label('Patrica Klinik',58,34,61,paper,900,true),label('Personel / Klinik / Finans',62,120,22,'#d5e2d8'),label(title,60,201,42,ink,1080,true),label(description,62,272,25,muted,1060,false,55)])).png().toBuffer();
}
