import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, FileUploadBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import {readFileSync} from 'node:fs';
import { Store } from './store.js';

export const color = 0x123f36;
export const card = (title: string, description: string) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setFooter({text:'Patrica Klinik | Personel'});
export function panelVisual(key:string,embed:EmbedBuilder) {const name=`patrica-${key}.png`;return {embeds:[embed.setImage(`attachment://${name}`)],files:[new AttachmentBuilder(readFileSync(new URL(`../../assets/panels/${key}.png`,import.meta.url)),{name})]};}
export function buttons(store: Store,guild: string,items: [string,string,string?][]) {
  const rows: ActionRowBuilder<ButtonBuilder>[]=[];
  for(let i=0;i<items.length;i+=5) {
    const row=new ActionRowBuilder<ButtonBuilder>();
    for(const [id,label,icon] of items.slice(i,i+5)) {
      const b=new ButtonBuilder().setCustomId(`pk:${id}`).setLabel(label).setStyle(ButtonStyle.Secondary);
      const emoji=icon?store.resource(guild,`emoji:${icon}`):undefined;if(emoji)b.setEmoji({id:emoji});
      row.addComponents(b);
    }
    rows.push(row);
  }
  return rows;
}
export interface Field { id:string;label:string;long?:boolean;max?:number;optional?:boolean;placeholder?:string;upload?:boolean; }
export function modal(id:string,title:string,fields:Field[]) {
  const m=new ModalBuilder().setCustomId(`pk:${id}`).setTitle(title);
  for(const f of fields) {
    if(f.upload){
      m.addLabelComponents(new LabelBuilder().setLabel(f.label).setDescription('TXT/LOG veya PNG/JPG/WEBP. En fazla 4 MB; yalniz odeme kaniti.').setFileUploadComponent(new FileUploadBuilder().setCustomId(f.id).setMinValues(1).setMaxValues(1).setRequired(true)));
      continue;
    }
    const input=new TextInputBuilder().setCustomId(f.id).setStyle(f.long?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(!f.optional).setMaxLength(f.max??(f.long?2000:100));
    if(f.placeholder)input.setPlaceholder(f.placeholder);
    if(fields.some(f=>f.upload))m.addLabelComponents(new LabelBuilder().setLabel(f.label).setTextInputComponent(input));
    else m.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input.setLabel(f.label)));
  }
  return m;
}
export function staffPanel(s:Store,g:string) {
  return {...panelVisual('staff',card('Patrica | Calisma Masasi','Personel Dosyam ile kendi gunluk alanina gec. Dosya, randevu ve gorusme kayitlarini buradan yonet.')),components:buttons(s,g,[
    ['personal','Personel Dosyam'],['case','Dosya Ac','folder'],['book','Randevu','calendar'],['visit','Seans Kaydet','notes'],['income','Tahsilat Bildir','receipt'],['shiftin','Mesai Ac','clock'],['shiftout','Mesai Kapat','clock'],['agenda','Randevularim','calendar'],['cases','Dosyalar','folder'],['visits','Seans Kodlari','notes']
  ])};
}
export function financePanel(s:Store,g:string) {
  return {...panelVisual('finance',card('Patrica | Finans','Bekleyen bildirimler kasaya dahil degildir. Onay vermeden once oyun ici para hareketini eslestir.')),components:buttons(s,g,[['summary','Kasa Ozeti','receipt'],['pending','Bekleyen Kayitlar','notes'],['expense','Gider Bildir','receipt'],['refund','Iade Talebi','receipt'],['export','Hesap Dokumu','folder']])};
}
export function applicationPanel(s:Store,g:string) {
  return {...panelVisual('apply',card('Patrica | Personel Basvurusu','Basvuracagin gorevi sec. Formdan sonra sana ozel sinav alani acilir. Her soruyu 60 saniyede cevapla; sure dolan soru yanlis sayilir. Basvurun ve sinav sonucun yonetim tarafindan incelenir.')),components:buttons(s,g,[['apply:psychologist','Psikolog Basvurusu'],['apply:reception','Resepsiyon Basvurusu'],['apply:finance','Finans ve IK Basvurusu'],['applicationstatus','Basvuru Durumum']])};
}
export const forms: Record<string,{title:string;fields:Field[]}>={
  apply:{title:'Personel Basvurusu',fields:[{id:'name',label:'Karakter adi ve soyadi',max:32,placeholder:'Mira Patrica'},{id:'ic',label:'IC: iletisim, egitim ve is gecmisi',long:true,max:600},{id:'ooc',label:'OOC: RP deneyimi ve musaitlik',long:true,max:600},{id:'scenario',label:'Danisan gizliligi nasil korunur?',long:true,max:600}]},
  case:{title:'Danisan Dosyasi',fields:[{id:'name',label:'Karakter adi',max:80},{id:'contact',label:'Oyun ici iletisim',max:80},{id:'owner',label:'Sorumlu psikolog Discord ID',max:20}]},
  book:{title:'Randevu Olustur',fields:[{id:'case',label:'Dosya kodu',placeholder:'PK-0001'},{id:'starts',label:'Istanbul tarihi ve saati',placeholder:'2026-11-02 21:30',max:16},{id:'minutes',label:'Sure: 20 / 30 / 45 / 60 dakika',max:2}]},
  visit:{title:'Gorusme Kaydi',fields:[{id:'case',label:'Dosya kodu',placeholder:'PK-0001'},{id:'service',label:'Hizmet: ilk / takip / cift',max:10},{id:'note',label:'Beyan, gozlem, hedef ve sonraki adim',long:true}]},
  income:{title:'Tahsilat Bildir',fields:[{id:'visit',label:'Seans kodu',placeholder:'SN-0001'},{id:'evidence',label:'Chatlog dosyasi veya ekran goruntusu',upload:true}]},
  expense:{title:'Gider Bildir',fields:[{id:'reference',label:'Gider aciklamasi',max:160},{id:'amount',label:'Oyun parasi: noktasiz tutar',max:8},{id:'evidence',label:'Gider kaniti',upload:true}]},
  refund:{title:'Iade Talebi',fields:[{id:'reference',label:'Asil tahsilat kodu',placeholder:'FIN-0001'},{id:'amount',label:'Iade tutari: noktasiz',max:8},{id:'evidence',label:'Iade gerekcesi ve ilgili belge',upload:true}]}
};
