import {AttachmentBuilder,ChannelType,ChatInputCommandInteraction,Guild,Interaction,MessageFlags,ThreadChannel} from 'discord.js';
import type {ClinicBot} from './bot.js';
import {Actor,UserError,requireJob,snowflake,visible} from './domain.js';
import {PersonnelStore,StaffReport,today} from './personnel-store.js';
import {code,numberCode} from './store.js';
import {buttons,card,modal} from './ui.js';
import {textChannel,overwrites} from './setup.js';
import {deliver,DeliveryUncertain} from './delivery.js';
import {dailyCard,reportCard,reportTitles,reportStates} from './personnel-cards.js';

const fields={
  absence:[{id:'day',label:'Ilk gun: YYYY-AA-GG',max:10},{id:'until',label:'Son gun: YYYY-AA-GG',max:10},{id:'body',label:'Gelememe nedeni ve beklenen donus',long:true,max:1200}],
  handover:[{id:'body',label:'Bekleyen is ve sonraki adim',long:true,max:1200},{id:'reference',label:'Ilgili PK / RD / FIN kodlari',max:100,optional:true}],
  incident:[{id:'subject',label:'Personelin Discord ID si',max:20},{id:'day',label:'Olay tarihi: YYYY-AA-GG',max:10},{id:'body',label:'Gozlenen olay ve somut aciklama',long:true,max:1200},{id:'reference',label:'Ilgili kayit veya mesaj ID si',max:100,optional:true}]
};
export class Personnel {
  readonly data:PersonnelStore;
  constructor(readonly bot:ClinicBot){this.data=new PersonnelStore(bot.store);}
  get s(){return this.bot.store;}
  async member(guild:Guild,user:string) {
    const member=await guild.members.fetch({user,force:true});const a=await this.bot.actor(guild,user);
    const active=!member.user.bot&&a.jobs.length>0&&(a.jobs.includes('manager')||member.roles.cache.has(this.s.resource(guild.id,'role:staff')!));
    return {member,a,active};
  }
  async revoke(guild:Guild,user:string) {
    const id=this.s.resource(guild.id,`workspace:${user}`);if(!id)return;
    let thread;
    try{thread=await guild.channels.fetch(id);}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code===10003)return;throw e;}
    if(thread?.type!==ChannelType.PrivateThread)throw new UserError('Personel kanali eslesmiyor.');
    if(thread.archived)await thread.setArchived(false);
    await thread.members.remove(user);await thread.setLocked(true);await thread.setArchived(true);
    this.s.setResource(guild.id,`workspaceactive:${user}`,'0');
  }
  async ensure(guild:Guild,user:string):Promise<ThreadChannel> {
    const {member,a,active}=await this.member(guild,user);if(!active){await this.revoke(guild,user);throw new UserError('Aktif personel yetkisi gerekli.');}
    const parent=await textChannel(guild,this.s,'people');
    // Parent role gate also removes access when the bot is offline and staff is revoked.
    await parent.permissionOverwrites.set(overwrites(guild,this.s,['staff'],undefined,true));
    const key=`workspace:${user}`,id=this.s.resource(guild.id,key);let thread;
    try{thread=id?await guild.channels.fetch(id):null;}catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code===10003))throw e;thread=null;}
    if(!thread){
      await parent.threads.fetchActive();const found=parent.threads.cache.filter(t=>t.type===ChannelType.PrivateThread&&t.name.endsWith(`-${user}`));
      if(found.size>1)throw new UserError('Personel kanali birden fazla; yonetim kontrol etmeli.');thread=found.first()??null;
      if(!thread){const archived=await parent.threads.fetchArchived({type:'private',limit:100});const matches=archived.threads.filter(t=>t.type===ChannelType.PrivateThread&&t.name.endsWith(`-${user}`));if(matches.size>1)throw new UserError('Arsivde eslesen birden fazla personel kanali var.');thread=matches.first()??null;if(!thread&&archived.hasMore)throw new UserError('Personel arsivi buyuk. /klinik personel-kurtar ile kanal ID sini eslestir.');}
    }
    if(!thread){
      const marker=`workspace-start:${user}`;if(this.s.resource(guild.id,marker))throw new DeliveryUncertain();this.s.setResource(guild.id,marker,String(Date.now()));
      const slug=(this.s.resource(guild.id,`staffname:${user}`)??member.displayName).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,35)||'personel';
      const job=a.jobs.includes('psychologist')?'psikolog':'personel';
      thread=await parent.threads.create({name:`${job}-${slug}-${user}`,type:ChannelType.PrivateThread,invitable:false,autoArchiveDuration:1440,reason:'Patrica kisisel personel dosyasi'});
    }
    if(thread.type!==ChannelType.PrivateThread||thread.parentId!==parent.id)throw new UserError('Personel dosyasi ozel kanal ile eslesmiyor.');
    this.s.tx(()=>{this.s.setResource(guild.id,key,thread.id);this.s.setResource(guild.id,`workspaceactive:${user}`,'1');this.s.run('DELETE FROM resources WHERE guild=? AND key=?',guild.id,`workspace-start:${user}`);});
    if(thread.archived)await thread.setArchived(false);if(thread.locked)await thread.setLocked(false);
    if(thread.invitable)await thread.setInvitable(false);
    await thread.members.add(user);return thread;
  }
  async refresh(guild:Guild,user:string) {
    let state;
    try{state=await this.member(guild,user);}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code===10007){await this.revoke(guild,user);return;}throw e;}
    if(!state.active){await this.revoke(guild,user);return;}
    const thread=await this.bot.exclusive(`workspace:${user}`,()=>this.ensure(guild,user));
    const data=this.data.daily({id:user,guild:guild.id,jobs:state.a.jobs});
    const image=await dailyCard(this.s.resource(guild.id,`staffname:${user}`)??state.member.displayName,state.a.jobs.includes('psychologist')?'Psikolog':state.a.jobs.includes('manager')?'Yonetim':state.a.jobs.includes('finance')?'Finans':'Resepsiyon',data);
    const dailyName='personel-gunluk.png';
    await deliver(this.s,guild.id,`workspacemsg:${user}:${data.day}`,thread,{embeds:[card(`Gunluk dosya | ${data.day}`,`Seans: ${data.visits.length} | Randevu: ${data.appointments} | Aktif dosya: ${data.cases}\nMesai: ${data.minutes} dk | Bekleyen finans: ${data.pending}\n\n${data.lines.slice(-12).join('\n')||'Bugun seans kaydi yok.'}${data.lines.length>12?'\nTum kodlar: Seanslarim butonu.':''}`).setImage(`attachment://${dailyName}`)],files:[new AttachmentBuilder(image,{name:dailyName})],components:buttons(this.s,guild.id,[['hr:today','Bugunu Yenile'],['cases','Dosyalar'],['visits','Seans Kodlari'],['agenda','Randevular'],['hr:absence','Mazeret Bildir'],['hr:handover','Devir Notu'],['hr:mine:0','Personel Kayitlarim']])});
  }
  async publish(guild:Guild,id:number) {
    const system:Actor={id:'system',guild:guild.id,jobs:['manager']};const r=this.data.report(system,id);
    const name=this.s.resource(guild.id,`staffname:${r.subject}`)??(await guild.members.fetch(r.subject).catch(()=>null))?.displayName??r.subject;
    const response=this.s.get<{body:string;at:number}>('SELECT body,at FROM staff_statements WHERE guild=? AND report=?',guild.id,id);
    const image=await reportCard(name,r);const filename=`${code('IK',id)}.png`;
    const description=`Personel: ${visible(name)}\nTarih: ${r.day}${r.until_day!==r.day?' / '+r.until_day:''}\nDurum: ${reportStates[r.state]??r.state}\n\n${visible(r.body)}\n\nIlgili kayit: ${visible(r.reference)}${response?'\n\nPersonelin aciklamasi:\n'+visible(response.body):''}${r.reason?'\n\nYonetim karari:\n'+visible(r.reason):''}\n\nTutanak otomatik ceza veya maas kesintisi olusturmaz.`;
    const payload={embeds:[card(`${code('IK',id)} | ${reportTitles[r.kind]}`,description).setImage(`attachment://${filename}`)],files:[new AttachmentBuilder(image,{name:filename})]};
    const management=await textChannel(guild,this.s,'personnel');await management.permissionOverwrites.set(overwrites(guild,this.s,[]));
    const decisions:[string,string][]=r.state!=='pending'?[]:r.kind==='absence'?[[`hr:review:${id}:accepted`,'Uygun Gor'],[`hr:review:${id}:rejected`,'Uygun Degil']]:[[`hr:review:${id}:${r.kind==='incident'?'closed':'acknowledged'}`,r.kind==='incident'?'Incelemeyi Kapat':'Teslim Alindi']];
    await deliver(this.s,guild.id,`hrmsg:${id}:management`,management,{...payload,components:buttons(this.s,guild.id,decisions)});
    let state;try{state=await this.member(guild,r.subject);}catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code===10007)return;throw e;}
    if(state.active){const thread=await this.bot.exclusive(`workspace:${r.subject}`,()=>this.ensure(guild,r.subject));await deliver(this.s,guild.id,`hrmsg:${id}:subject`,thread,{...payload,components:r.kind==='incident'&&r.state==='pending'&&!response?buttons(this.s,guild.id,[[`hr:statement:${id}`,'Aciklama Ekle']]):[]});}
  }
  opens(i:Interaction) {return i.isButton()&&/^pk:hr:(absence|handover|incident|statement:|review:)/.test(i.customId);}
  async handle(i:Interaction):Promise<boolean> {
    if(!i.isButton()&&!i.isModalSubmit())return false;if(!i.customId.startsWith('pk:hr:'))return false;
    if(!i.guild||i.guild.id!==this.bot.cfg.guild)return true;
    const parts=i.customId.split(':').slice(2),action=parts[0]!;
    const opening=this.opens(i);if(!opening)await i.deferReply({flags:MessageFlags.Ephemeral});
    // Opening a blank form reads no personnel data; every submission checks fresh roles.
    const a=opening?this.bot.cachedActor(i):await this.bot.actor(i.guild,i.user.id);this.data.own(a);
    if(i.isButton()) {
      if(action==='absence'||action==='handover'||action==='incident') {if(action==='incident')requireJob(a,'manager');await i.showModal(modal(`hr:submit:${action}`,reportTitles[action],fields[action]));return true;}
      if(action==='review') {requireJob(a,'manager');const id=Number(parts[1]);if(!Number.isSafeInteger(id)||id<1)throw new UserError('Kayit gecersiz.');await i.showModal(modal(`hr:decision:${id}:${parts[2]}`,'Yonetim Gerekcesi',[{id:'body',label:'Karar ve gerekce',long:true,max:300}]));return true;}
      if(action==='statement'){await i.showModal(modal(`hr:statement:${parts[1]}`,'Tutanak Aciklamasi',[{id:'body',label:'Olayla ilgili kendi aciklaman',long:true,max:1200}]));return true;}
      if(action==='today'){await this.refresh(i.guild,a.id);await i.editReply('Gunluk dosyan guncellendi.');return true;}
      if(action==='mine'||action==='pending'){await this.list(i,a,action==='pending',Number(parts[1]||0));return true;}
      if(action==='areas'){requireJob(a,'manager');const rows=this.s.all<{key:string;value:string}>("SELECT key,value FROM resources WHERE guild=? AND key LIKE ? AND key!='workspace:bucket'",a.guild,'workspace:%');await i.editReply(rows.map(r=>`${r.key.slice(10)}: <#${r.value}>`).join('\n').slice(0,1900)||'Henuz personel alani yok.');return true;}
      throw new UserError('Personel butonu taninmiyor.');
    }
    const body=i.fields.getTextInputValue('body');
    if(action==='submit') {
      const kind=parts[1];if(kind!=='absence'&&kind!=='incident'&&kind!=='handover')throw new UserError('Form gecersiz.');
      const subject=kind==='incident'?snowflake(i.fields.getTextInputValue('subject')):a.id;
      if(kind==='incident'){requireJob(a,'manager');if(!(await this.member(i.guild,subject)).active)throw new UserError('Tutanak icin aktif personel sec.');}
      const day=kind==='handover'?today():i.fields.getTextInputValue('day');
      const r=this.data.submit(a,kind,subject,day,kind==='absence'?i.fields.getTextInputValue('until'):day,body,kind==='absence'?'-':i.fields.getTextInputValue('reference'),i.id);
      await i.editReply(`${code('IK',r.id)} kaydedildi. Yonetim ve personel dosyasina iletiliyor; tekrar kayit acma.`);return true;
    }
    const id=Number(parts[1]);if(!Number.isSafeInteger(id)||id<1)throw new UserError('Kayit gecersiz.');
    if(action==='decision'){this.data.decide(a,id,parts[2]!,body);await i.editReply(`${code('IK',id)} karari kaydedildi.`);return true;}
    if(action==='statement'){this.data.statement(a,id,body,i.id);await i.editReply(`${code('IK',id)} aciklaman kaydedildi.`);return true;}
    throw new UserError('Personel formu taninmiyor.');
  }
  async list(i:{editReply:ChatInputCommandInteraction['editReply']},a:Actor,pending=false,page=0) {
    this.data.own(a);if(pending)requireJob(a,'manager');if(!Number.isSafeInteger(page)||page<0||page>100000)throw new UserError('Sayfa gecersiz.');
    const rows=this.s.all<StaffReport>(`SELECT * FROM staff_reports WHERE guild=? ${pending?"AND state='pending'":'AND subject=?'} ORDER BY id DESC LIMIT 11 OFFSET ?`,...pending?[a.guild,page*10]:[a.guild,a.id,page*10]);
    const nav:[string,string][]=[];const action=pending?'pending':'mine';if(page)nav.push([`hr:${action}:${page-1}`,'Onceki']);if(rows.length>10)nav.push([`hr:${action}:${page+1}`,'Sonraki']);
    await i.editReply({content:`Personel Kayitlari | Sayfa ${page+1}\n${rows.slice(0,10).map(r=>`${code('IK',r.id)} | ${reportTitles[r.kind]} | ${r.day} | ${reportStates[r.state]??r.state}`).join('\n')||'Kayit yok.'}\nDetay: /klinik personel-kaydi kod:IK-0001`,components:buttons(this.s,a.guild,nav)});
  }
  async command(i:ChatInputCommandInteraction,a:Actor) {
    const sub=i.options.getSubcommand();if(!['personelim','personel-kaydi','personel-isleri','personel-kurtar'].includes(sub))return false;
    if(sub==='personel-kurtar') {
      requireJob(a,'manager');const kind=i.options.getString('tur',true),target=i.options.getString('hedef',true),identity=i.options.getString('kimlik'),absent=i.options.getBoolean('yoklugunu-dogruladim');
      if(identity)snowflake(identity);if(!identity&&!absent)throw new UserError('Buldugun kimligi yaz veya gecmisi kontrol edip yoklugu dogrula.');
      if(kind==='workspace') {
        const user=snowflake(target);if(!(await this.member(i.guild!,user)).active)throw new UserError('Aktif personel sec.');
        if(identity){const thread=await i.guild!.channels.fetch(identity);if(thread?.type!==ChannelType.PrivateThread||thread.parentId!==this.s.resource(a.guild,'channel:people')||!thread.name.endsWith(`-${user}`))throw new UserError('Kanal bu personelin ozel alaniyla eslesmiyor.');this.s.setResource(a.guild,`workspace:${user}`,identity);}
        else {const old=this.s.resource(a.guild,`workspace:${user}`);if(old){try{if(await i.guild!.channels.fetch(old))throw new UserError('Kayitli kanal var; kimligiyle eslestir.');}catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code===10003))throw e;}}this.s.run('DELETE FROM resources WHERE guild=? AND key=?',a.guild,`workspace:${user}`);}
        this.s.run('DELETE FROM resources WHERE guild=? AND key=?',a.guild,`workspace-start:${user}`);this.schedule(a.guild,user);this.s.audit(a,'personnel.recover_workspace',user);await i.editReply('Personel alani kurtarma gorevi kaydedildi.');return true;
      }
      let key:string,job:string,jobTarget:string,marker:string,channel;
      if(kind==='daily'){const user=snowflake(target);const thread=this.s.resource(a.guild,`workspace:${user}`);if(!thread)throw new UserError('Once personel kanalini eslestir.');channel=await i.guild!.channels.fetch(thread);key=`workspacemsg:${user}:${today()}`;job='workspace';jobTarget=user;marker=`Gunluk dosya | ${today()}`;}
      else if(kind==='report-manager'||kind==='report-subject'){const r=this.data.report(a,numberCode(target,'IK'));key=`hrmsg:${r.id}:${kind==='report-manager'?'management':'subject'}`;job='report';jobTarget=String(r.id);marker=code('IK',r.id);if(kind==='report-manager')channel=await textChannel(i.guild!,this.s,'personnel');else{const thread=this.s.resource(a.guild,`workspace:${r.subject}`);if(!thread)throw new UserError('Once personel kanalini eslestir.');channel=await i.guild!.channels.fetch(thread);}}
      else throw new UserError('Kaynak turu gecersiz.');
      if(!channel?.isTextBased()||!('messages' in channel))throw new UserError('Mesaj kanali eslesmiyor.');
      if(identity){const message=await channel.messages.fetch(identity);if(message.author.id!==i.guild!.client.user.id||!message.embeds.some(e=>kind==='daily'?e.title===marker:e.title?.startsWith(`${marker} | `)))throw new UserError('Bot mesaji ilgili kayitla eslesmiyor.');this.s.setResource(a.guild,key,identity);}
      else{const old=this.s.resource(a.guild,key);if(old){try{await channel.messages.fetch(old);throw new UserError('Kayitli mesaj var; kimligiyle eslestir.');}catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code===10008))throw e;}}this.s.run('DELETE FROM resources WHERE guild=? AND key=?',a.guild,key);}
      this.s.tx(()=>{this.s.run('DELETE FROM resources WHERE guild=? AND key=?',a.guild,`send:${key}`);this.s.enqueue(a.guild,job,jobTarget);this.s.audit(a,'personnel.recover_message',key);});await i.editReply('Personel bildirimi kurtarma gorevi kaydedildi.');return true;
    }
    if(sub==='personelim'){this.data.own(a);const thread=await this.bot.exclusive(`workspace:${a.id}`,()=>this.ensure(i.guild!,a.id));this.s.enqueue(a.guild,'workspace',a.id);await i.editReply(`Kisisel dosyan: <#${thread.id}>`);return true;}
    if(sub==='personel-isleri'){await this.list(i,a,true,(i.options.getInteger('sayfa')??1)-1);return true;}
    const r=this.data.report(a,numberCode(i.options.getString('kod',true),'IK'));const statement=this.s.get<{body:string}>('SELECT body FROM staff_statements WHERE guild=? AND report=?',a.guild,r.id);
    await i.editReply({embeds:[card(`${code('IK',r.id)} | ${reportTitles[r.kind]}`,`Tarih: ${r.day} / ${r.until_day}\nDurum: ${reportStates[r.state]??r.state}\n\n${visible(r.body)}${statement?'\n\nPersonel aciklamasi:\n'+visible(statement.body):''}${r.reason?'\n\nKarar:\n'+visible(r.reason):''}`)]});return true;
  }
  schedule(guild:string,user:string) {this.s.enqueue(guild,'workspace',user);}
  async bootstrap(guild:Guild) {
    const members=await guild.members.fetch();let n=0;
    for(const member of members.values())if(!member.user.bot&&([...['manager','finance','psychologist','reception'].map(k=>this.s.resource(guild.id,`role:${k}`))].some(id=>id&&member.roles.cache.has(id))||this.bot.cfg.owners.includes(member.id))){this.schedule(guild.id,member.id);n++;}
    return n;
  }
  scheduleDaily(guild:string) {
    const bucket=String(Math.floor(Date.now()/300000));if(this.s.resource(guild,'workspace:bucket')===bucket)return;
    this.s.setResource(guild,'workspace:bucket',bucket);
    for(const row of this.s.all<{key:string}>("SELECT key FROM resources WHERE guild=? AND key LIKE 'workspace:%' AND key!='workspace:bucket'",guild))if(this.s.resource(guild,`workspaceactive:${row.key.slice(10)}`)!=='0')this.schedule(guild,row.key.slice(10));
  }
}
