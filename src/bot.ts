import { AttachmentBuilder, ChannelType, ChatInputCommandInteraction, Client, Guild, GuildMember, Interaction, RepliableInteraction, MessageFlags, ThreadChannel } from 'discord.js';
import { resolve } from 'node:path';
import { Config } from './config.js';
import { Actor, Job, UserError, characterName, formatMoney, formatTime, localTime, money, requireJob, service, snowflake, text, visible } from './domain.js';
import { Application, CaseRow, Cash, Appointment, Store, code, numberCode } from './store.js';
import { RoleKey, overwrites, roles, setup, textChannel } from './setup.js';
import { buttons, card, forms, modal } from './ui.js';
import { deliver, auditBatches, recordHtml, DeliveryUncertain } from './delivery.js';
import { downloadEvidence } from './evidence.js';
import {Personnel} from './personnel.js';
import { jobName, questions, type ApplicationJob } from './application-questions.js';

type Supported=ChatInputCommandInteraction;
export class ClinicBot {
  private busy=new Set<string>();
  readonly personnel:Personnel;
  constructor(readonly client:Client,readonly store:Store,readonly cfg:Config) {this.personnel=new Personnel(this);}
  cachedActor(i:RepliableInteraction):Actor {
    const member=i.member;const ids=member?(Array.isArray(member.roles)?member.roles:[...member.roles.cache.keys()]):[];
    const jobs:Job[]=this.cfg.owners.includes(i.user.id)?['manager']:[];
    for(const key of ['manager','finance','psychologist','reception'] as Job[])if(ids.includes(this.store.resource(this.cfg.guild,`role:${key}`)!))jobs.push(key);
    return {id:i.user.id,guild:this.cfg.guild,jobs};
  }
  async list(i:RepliableInteraction,a:Actor,kind:string,page=0,query='') {
    if(!Number.isSafeInteger(page)||page<0||page>100000)throw new UserError('Sayfa gecersiz.');
    let lines:string[]=[];let more=false;
    if(kind==='cases') {
      const rows=this.store.findCases(a,query,page);more=rows.length>10;
      lines=rows.slice(0,10).map(r=>`${code('PK',r.id)} | ${visible(r.name)} | ${r.state} | ${r.owner}`);
    } else if(kind==='visits') {
      requireJob(a,'psychologist');const all=a.jobs.includes('manager');
      const rows=this.store.all<{id:number;case_id:number;service:string;amount:number}>(`SELECT v.id,v.case_id,v.service,v.amount FROM visits v JOIN cases c ON c.id=v.case_id AND c.guild=v.guild WHERE v.guild=? ${all?'':'AND c.owner=?'} ORDER BY v.id DESC LIMIT 11 OFFSET ?`,...all?[a.guild,page*10]:[a.guild,a.id,page*10]);
      more=rows.length>10;lines=rows.slice(0,10).map(r=>`${code('SN',r.id)} | ${code('PK',r.case_id)} | ${r.service} | ${formatMoney(r.amount)}`);
    } else if(kind==='agenda') {
      requireJob(a,'psychologist','reception');const all=a.jobs.includes('manager')||a.jobs.includes('reception');
      const rows=this.store.all<Appointment>(`SELECT * FROM appointments WHERE guild=? AND state IN ('scheduled','needs_review') ${all?'':'AND staff=?'} ORDER BY starts LIMIT 11 OFFSET ?`,...all?[a.guild,page*10]:[a.guild,a.id,page*10]);
      more=rows.length>10;lines=rows.slice(0,10).map(r=>`${code('RD',r.id)} | ${code('PK',r.case_id)} | ${formatTime(r.starts)} | ${r.state}`);
    } else if(kind==='applications') {
      requireJob(a,'manager','finance');const rows=this.store.all<Application>("SELECT * FROM applications WHERE guild=? ORDER BY id DESC LIMIT 11 OFFSET ?",a.guild,page*10);
      more=rows.length>10;lines=rows.slice(0,10).map(r=>`${code('BAS',r.id)} | ${visible(r.name)} | ${r.state} | Yetki: ${this.store.resource(a.guild,`appapplied:${r.id}`)??'Atanmadi'}`);
    } else {
      requireJob(a,'finance');const rows=this.store.all<Cash>("SELECT * FROM cash WHERE guild=? AND state='pending' ORDER BY id LIMIT 11 OFFSET ?",a.guild,page*10);
      more=rows.length>10;lines=rows.slice(0,10).map(r=>`${code('FIN',r.id)} | ${r.kind} | ${formatMoney(r.amount)}`);
    }
    // Search is a slash-command result; paging buttons use unfiltered lists explicitly.
    const nav:[string,string][]=[];
    if(!query){if(page)nav.push([`${kind}:${page-1}`,'Onceki']);if(more)nav.push([`${kind}:${page+1}`,'Sonraki']);}
    await i.editReply({content:`Sayfa ${page+1}${query?' | Arama: '+visible(query):''}\n${lines.join('\n')||'Kayit bulunamadi.'}${query&&more?'\nDevami icin /klinik ara sayfa secenegini kullan.':''}`,components:buttons(this.store,a.guild,nav)});
  }
  async publishVisit(guild:Guild,id:number) {
    const row=this.store.visit({id:'system',guild:guild.id,jobs:['manager']},id);
    const c=this.store.case({id:'system',guild:guild.id,jobs:['manager']},row.case_id);
    const channel=await this.exclusive(`case:${c.id}`,()=>this.ensureCaseChannel(guild,c));
    await deliver(this.store,guild.id,`visitmsg:${id}`,channel,{content:`${code('SN',id)} | ${row.service} | ${formatMoney(row.amount)}\nNot dosyada kayitli. /klinik dosya ile goruntule.`});
  }
  async publishAppointment(guild:Guild,row:Appointment) {
    await deliver(this.store,guild.id,`appointmentmsg:${row.id}`,await textChannel(guild,this.store,'appointments'),{embeds:[card(`${code('RD',row.id)} | ${row.state}`,`${code('PK',row.case_id)} | ${formatTime(row.starts)}\nSorumlu: ${row.staff}\nSure: ${(row.ends-row.starts)/60000} dakika`)],components:['scheduled','needs_review'].includes(row.state)?buttons(this.store,guild.id,[
      [`appointment:${row.id}:completed`,'Tamamlandi'],[`appointment:${row.id}:cancelled`,'Iptal'],[`appointment:${row.id}:missed`,'Gelmedi']
    ]):[]});
  }
  async processQueue(guild:Guild) {
    for(let n=0;n<30;n++) {
      const job=this.store.claim(guild.id);if(!job)break;
      try {
        const system:Actor={id:'system',guild:guild.id,jobs:['manager']};const id=Number(job.target);
        if(job.kind==='workspace')await this.personnel.refresh(guild,job.target);
        else if(job.kind==='report')await this.personnel.publish(guild,id);
        else if(job.kind==='staff')await this.exclusive(`member:${job.target}`,async()=>{
          const desired=this.store.resource(guild.id,`staffdesired:${job.target}`);
          if(desired&&[...Object.keys(roles),'offboard'].includes(desired))await this.syncMember(guild,job.target,desired as RoleKey|'offboard');
        });
        else if(job.kind==='cash')await this.publishCash(guild,this.store.cash(guild.id,id));
        else if(job.kind==='application') {
          const row=this.store.application(guild.id,id);
          if(row.state==='approved'&&!this.store.resource(guild.id,`appapplied:${id}`))await this.exclusive(`member:${row.user}`,async()=>{
            if(!this.store.resource(guild.id,`appapplied:${id}`)){await this.syncMember(guild,row.user,row.job as RoleKey);this.store.setResource(guild.id,`appapplied:${id}`,'done');}
          });
          await this.publishApplication(guild,row);
          if(['pending','interview'].includes(row.state))await this.publishApplicationQuestion(guild,row);
        } else if(job.kind==='case')await this.exclusive(`case:${id}`,()=>this.ensureCaseChannel(guild,this.store.case(system,id)));
        else if(job.kind==='visit')await this.publishVisit(guild,id);
        else if(job.kind==='appointment') {
          const row=this.store.get<Appointment>('SELECT * FROM appointments WHERE guild=? AND id=?',guild.id,id);if(row)await this.publishAppointment(guild,row);
        } else if(job.kind==='index') {
          const rows=this.store.all<CaseRow>('SELECT id,name,owner,state FROM cases WHERE guild=? ORDER BY id',guild.id);
          const lines=rows.map(r=>`${code('PK',r.id)} | ${visible(r.name)} | ${r.owner} | ${r.state}`);
          const batches=auditBatches(lines,x=>x,1700);if(!batches.length)batches.push(['Henuz dosya yok.']);
          const ch=await textChannel(guild,this.store,'index');await ch.permissionOverwrites.set(overwrites(guild,this.store,[]));
          for(const [page,batch] of batches.entries())await deliver(this.store,guild.id,`indexmsg:${page}`,ch,{content:`Dosya Indeksi | ${page+1}\n${batch.join('\n')}`});
        } else if(job.kind==='shift') {
          const rows=this.store.all<{id:number;starts:number;ends:number|null}>('SELECT * FROM shifts WHERE guild=? AND staff=? ORDER BY id DESC LIMIT 1',guild.id,job.target);
          const row=rows[0];if(row){const pending=this.store.get<{n:number}>("SELECT COUNT(*) n FROM cash WHERE guild=? AND maker=? AND state='pending'",guild.id,job.target)!.n;
            await deliver(this.store,guild.id,`shiftmsg:${row.id}`,await textChannel(guild,this.store,'shifts'),{content:`Mesai | ${job.target}\nGiris: ${formatTime(row.starts)}\nCikis: ${row.ends?formatTime(row.ends):'Acik'}\nKendi bekleyen finans bildirimi: ${pending}`});}
        }
        this.store.finish(job);
      } catch(e){this.store.finish(job,e);}
    }
  }
  async actor(guild:Guild,id:string):Promise<Actor> {
    if(guild.id!==this.cfg.guild)throw new UserError('Bu sunucu yapilandirilmamis.');
    const member=await guild.members.fetch({user:id,force:true});
    const jobs:Job[]=this.cfg.owners.includes(id)?['manager']:[];
    for(const key of ['manager','finance','psychologist','reception'] as Job[]) {
      const role=this.store.resource(guild.id,`role:${key}`);if(role&&member.roles.cache.has(role))jobs.push(key);
    }
    return {id,guild:guild.id,jobs};
  }
  async exclusive<T>(key:string,fn:()=>Promise<T>):Promise<T> {
    if(this.busy.has(key))throw new UserError('Bu islem suruyor. Biraz bekle.');
    this.busy.add(key);try{return await fn();}finally{this.busy.delete(key);}
  }
  async onJoin(member:GuildMember) {
    if(member.guild.id!==this.cfg.guild||member.user.bot)return;
    await this.revokeCaseAccess(member.guild,member.id);
    await this.personnel.revoke(member.guild,member.id);
    const role=this.store.resource(member.guild.id,'role:candidate');if(role)await member.roles.add(role,'Patrica baslangic');
  }
  async syncMember(guild:Guild,user:string,job:RoleKey|'offboard') {
    const member=await guild.members.fetch({user,force:true});
    if(member.user.bot)throw new UserError('Bot hesaplari personel yapilamaz.');
    if(this.cfg.owners.includes(user))throw new UserError('Bot sahibi bu panelden degistirilemez.');
    const all=Object.keys(roles).map(k=>this.store.resource(guild.id,`role:${k}`)).filter((x):x is string=>!!x);
    if(job!=='psychologist'&&job!=='manager')await this.revokeCaseAccess(guild,user);
    if(job==='offboard')await this.personnel.revoke(guild,user);
    await member.roles.remove(all,'Patrica gorev guncelleme');
    if(job!=='offboard') {
      const selected=this.store.resource(guild.id,`role:${job}`);const staff=this.store.resource(guild.id,'role:staff');
      if(!selected||!staff)throw new UserError('Kurulum eksik.');
      await member.roles.add([selected,staff],'Patrica gorev atamasi');
      await this.syncCharacterName(guild,user);
    } else {
      const candidate=this.store.resource(guild.id,'role:candidate');if(candidate)await member.roles.add(candidate);
      this.store.run('UPDATE shifts SET ends=? WHERE guild=? AND staff=? AND ends IS NULL',Date.now(),guild.id,user);
    }
    this.personnel.schedule(guild.id,user);
  }
  async syncCharacterName(guild:Guild,user:string):Promise<boolean> {
    const name=this.store.resource(guild.id,`staffname:${user}`);if(!name)return true;
    const member=await guild.members.fetch({user,force:true});
    if(member.displayName===name){this.store.setResource(guild.id,`nameapplied:${user}`,'done');return true;}
    if(!member.manageable){this.store.setResource(guild.id,`nameapplied:${user}`,'manual');return false;}
    try{await member.setNickname(name,'Patrica onayli karakter adi');}
    catch(e){if(e&&typeof e==='object'&&'code' in e&&e.code===50013){this.store.setResource(guild.id,`nameapplied:${user}`,'manual');return false;}throw e;}
    this.store.setResource(guild.id,`nameapplied:${user}`,'done');return true;
  }
  async revokeCaseAccess(guild:Guild,user:string) {
    const rows=this.store.all<CaseRow>('SELECT * FROM cases WHERE guild=? AND owner=?',guild.id,user);
    for(const row of rows) {
      if(row.channel){const c=await guild.channels.fetch(row.channel);if(c?.type===ChannelType.PrivateThread)await c.members.remove(user);}
    }
  }
  async ensureCaseChannel(guild:Guild,c:CaseRow):Promise<ThreadChannel> {
    const parent=await textChannel(guild,this.store,'records');const name=code('pk',c.id).toLowerCase();
    let channel=c.channel?await guild.channels.fetch(c.channel):null;
    if(!channel){await parent.threads.fetchActive();const found=parent.threads.cache.filter(x=>x.type===ChannelType.PrivateThread&&x.name===name);if(found.size>1)throw new UserError('Dosya kanali birden fazla; yonetim kontrol etmeli.');channel=found.first()??null;}
    const owner=await this.actor(guild,c.owner);
    if(!owner.jobs.some(j=>j==='psychologist'||j==='manager'))throw new UserError('Dosya sorumlusu aktif psikolog degil. Yonetim dosyayi devretmeli.');
    if(channel) {
      if(channel.type!==ChannelType.PrivateThread||channel.parentId!==parent.id||channel.name!==name)throw new UserError('Dosya kanali eslesmiyor.');
      if(channel.archived)await channel.setArchived(false);
    } else {
      const marker=`thread-start:${c.id}`;
      if(this.store.resource(guild.id,marker))throw new DeliveryUncertain();
      this.store.setResource(guild.id,marker,String(Date.now()));
      channel=await parent.threads.create({name,type:ChannelType.PrivateThread,invitable:false,autoArchiveDuration:1440,reason:'Patrica ozel danisan dosyasi'});
    }
    this.store.run('UPDATE cases SET channel=? WHERE guild=? AND id=?',channel.id,guild.id,c.id);
    for(const old of this.store.all<{key:string;value:string}>('SELECT key,value FROM resources WHERE guild=? AND key LIKE ?',guild.id,`revoke:${c.id}:%`)) {
      if(old.value!==c.owner)await channel.members.remove(old.value);
      this.store.run('DELETE FROM resources WHERE guild=? AND key=?',guild.id,old.key);
    }
    await channel.members.add(c.owner);
    return channel;
  }
  async publishCash(guild:Guild,row:Cash) {
    const channel=await textChannel(guild,this.store,'cash');
    // Evidence must never be published after the finance channel becomes public.
    await channel.permissionOverwrites.set(overwrites(guild,this.store,['finance']));
    const payload={...this.cashPayload(row),components:buttons(this.store,guild.id,[
      [`cashview:${row.id}`,'Kaniti Gor','notes'],[`cashapprove:${row.id}`,'Onayla'],[`cashreject:${row.id}`,'Reddet']
    ]),allowedMentions:{parse:[] as []}};
    await deliver(this.store,guild.id,`cashmsg:${row.id}`,channel,payload);
  }
  cashPayload(row:Cash) {
    const evidence=this.store.evidence({id:'system',guild:row.guild,jobs:['manager']},row.id);
    const type={income:'Tahsilat',expense:'Gider',refund:'Iade'}[row.kind]??row.kind;
    const state={pending:'Onay Bekliyor',approved:'Onaylandi',rejected:'Reddedildi'}[row.state]??row.state;
    const embed=card(`${code('FIN',row.id)} | ${state}`,'Odeme kanitini oyun ici para hareketiyle eslestir. Dosya yuklenmesi odeme onayi sayilmaz.')
      .addFields({name:'Islem',value:type,inline:true},{name:'Tutar',value:formatMoney(row.amount),inline:true},{name:'Ilgili Kayit',value:visible(row.reference)}, {name:'Bildiren',value:row.maker,inline:true});
    const filename=evidence?.mime==='image/png'?`${code('FIN',row.id)}-kanit.png`:`${code('FIN',row.id)}-chatlog.txt`;
    if(evidence?.mime==='image/png')embed.setImage(`attachment://${filename}`);
    embed.addFields({name:'Kanit',value:evidence?.mime==='image/png'?'Ekran goruntusu asagida.':'Chatlog dosyasi ekte.'});
    return {embeds:[embed],files:[new AttachmentBuilder(Buffer.from(evidence?.data??row.proof),{name:filename})]};
  }
  async publishApplication(guild:Guild,row:Application) {
    const channel=await textChannel(guild,this.store,'applications');
    const nameState=this.store.resource(guild.id,`nameapplied:${row.user}`);
    const set=questions[row.job as ApplicationJob],answers=this.store.applicationAnswers(guild.id,row.id);
    const score=set?Math.round(100*answers.filter(a=>set[a.question]?.correct===a.choice).length/set.length):0;
    const wrong=set?answers.filter(a=>set[a.question]?.correct!==a.choice).map(a=>`S${a.question+1}: ${a.choice<0?'Sure doldu':visible(set[a.question]!.options[a.choice]!)} | Dogru: ${visible(set[a.question]!.options[set[a.question]!.correct]!)}`).join('\n'):'';
    const remaining=set?set.length-answers.length:0,closed=!['pending','interview'].includes(row.state);
    const exam=set?`\nSinav: ${answers.length}/${set.length} | ${remaining&&!closed?'Gecici not':'Not'}: ${score}/100${remaining?` | ${remaining} bos soru`:''}\nYanlislar: ${wrong||'Yok'}${closed&&remaining?`\nCevaplanmayan: ${Array.from({length:remaining},(_,n)=>`S${answers.length+n+1}`).join(', ')}`:''}`:'';
    const thread=this.store.resource(guild.id,`appthread:${row.id}`);
    const payload={embeds:[card(`${code('BAS',row.id)} | ${row.state}`,`Karakter: ${visible(row.name)}\nDiscord ID: ${row.user}\nGorev: ${jobName[row.job as ApplicationJob]??row.job}${exam}${thread?`\nSinav alani: <#${thread}>`:''}\nYetki: ${row.state==='approved'?(this.store.resource(guild.id,`appapplied:${row.id}`)?'Uygulandi':'Atama bekliyor'):'Karar bekliyor'}${row.state==='approved'?`\nDiscord adi: ${nameState==='done'?'Guncellendi':nameState==='manual'?'Elle duzenlenmeli':'Bekliyor'}`:''}\n\n${visible(row.body)}`.slice(0,4000))],components:buttons(this.store,guild.id,[
      [`appinterview:${row.id}`,'Gorusmeye Cagir'],[`appapprove:${row.id}`,'Onayla'],[`appreject:${row.id}`,'Reddet']
    ]),allowedMentions:{parse:[] as []}};
    await deliver(this.store,guild.id,`appmsg:${row.id}`,channel,payload);
  }
  async ensureApplicationThread(guild:Guild,row:Application):Promise<ThreadChannel> {
    const parent=await textChannel(guild,this.store,'apply'),key=`appthread:${row.id}`;
    const saved=this.store.resource(guild.id,key);let thread=saved?await guild.channels.fetch(saved).catch(()=>null):null;
    if(!thread){
      await parent.threads.fetchActive();const active=parent.threads.cache.filter(t=>t.type===ChannelType.PrivateThread&&t.name===`basvuru-${row.id}-${row.user}`);
      const archived=await parent.threads.fetchArchived({type:'private',limit:100});const matches=[...active.values(),...archived.threads.values()].filter(t=>t.type===ChannelType.PrivateThread&&t.name===`basvuru-${row.id}-${row.user}`);
      if(matches.length>1||(!matches.length&&archived.hasMore))throw new DeliveryUncertain();
      thread=matches[0]??null;
    }
    if(!thread){
      const marker=`appthread-start:${row.id}`;if(this.store.resource(guild.id,marker))throw new DeliveryUncertain();
      this.store.setResource(guild.id,marker,String(Date.now()));
      thread=await parent.threads.create({name:`basvuru-${row.id}-${row.user}`,type:ChannelType.PrivateThread,invitable:false,autoArchiveDuration:1440,reason:'Patrica aday sinavi'});
    }
    if(thread.type!==ChannelType.PrivateThread||thread.parentId!==parent.id)throw new UserError('Basvuru thread eslesmiyor.');
    this.store.tx(()=>{this.store.setResource(guild.id,key,thread.id);this.store.run('DELETE FROM resources WHERE guild=? AND key=?',guild.id,`appthread-start:${row.id}`);});
    if(thread.archived)await thread.setArchived(false);if(thread.locked)await thread.setLocked(false);if(thread.invitable)await thread.setInvitable(false);
    await thread.members.add(row.user);
    for(const owner of this.cfg.owners)await thread.members.add(owner);
    return thread;
  }
  async syncApplicationOwners(guild:Guild) {
    for(const row of this.store.all<{key:string;value:string}>("SELECT key,value FROM resources WHERE guild=? AND key LIKE 'appthread:%'",guild.id)) {
      const thread=await guild.channels.fetch(row.value).catch(()=>null);
      if(!thread||thread.type!==ChannelType.PrivateThread)continue;
      for(const owner of this.cfg.owners)await thread.members.add(owner);
    }
  }
  async publishApplicationQuestion(guild:Guild,row:Application) {
    const set=questions[row.job as ApplicationJob];if(!set)return;
    const answers=this.store.applicationAnswers(guild.id,row.id),thread=await this.exclusive(`appthread:${row.id}`,()=>this.ensureApplicationThread(guild,row));
    if(answers.length===set.length){await deliver(this.store,guild.id,`quizdone:${row.id}`,thread,{content:`${code('BAS',row.id)} | Sinav tamamlandi. Yonetim basvurunu inceleyecek.`});return;}
    const index=answers.length,q=set[index]!;
    const deadline=this.store.quizDeadline(guild.id,row.id);
    if(deadline?.question===index&&deadline.deadline<=Date.now())return;
    const message=await deliver(this.store,guild.id,`quizmsg:${row.id}:${index}`,thread,{embeds:[card(`${code('BAS',row.id)} | Soru ${index+1}/${set.length}`,`${q.prompt}\n\n${q.options.map((option,n)=>`${'ABCD'[n]}. ${option}`).join('\n')}\n\nSeviye: ${q.level} | Sure: 60 saniye`)],components:buttons(this.store,guild.id,q.options.map((_option,n)=>[`quiz:${row.id}:${index}:${n}`,`${'ABCD'[n]}`]))});
    if(message)this.store.startQuestion(guild.id,row.id,index,message.createdTimestamp+60_000);
  }
  async quizTick() {const guild=this.client.guilds.cache.get(this.cfg.guild);if(!guild)return;const count=this.store.expireQuestions(guild.id);if(count)await this.processQueue(guild);}
  async handle(i:Interaction) {
    if(!i.isChatInputCommand()&&!i.isButton()&&!i.isModalSubmit())return;
    if(!i.guild||i.guildId!==this.cfg.guild)return;
    if(i.isChatInputCommand()&&i.commandName!=='klinik')return;
    if(!i.isChatInputCommand()&&!i.customId.startsWith('pk:'))return;
    try {
      if(await this.personnel.handle(i))return;
      const opensModal=i.isButton()&&(!!forms[i.customId.slice(3).split(':')[0]!]||/^pk:(cashapprove|cashreject|appapprove|appreject|appinterview):/.test(i.customId));
      if(!opensModal)await i.deferReply({flags:MessageFlags.Ephemeral});
      const a=opensModal?this.cachedActor(i):await this.actor(i.guild,i.user.id);
      if(i.isChatInputCommand()) {
        await this.command(i,a);return;
      }
      const [action,arg,choice]=i.customId.slice(3).split(':');if(!action)throw new UserError('Islem gecersiz.');
      if(i.isButton()) {
        if(action==='quiz') {
          const id=Number(arg),index=Number(choice),selected=Number(i.customId.split(':')[4]);
          if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(index)||!Number.isSafeInteger(selected))throw new UserError('Soru gecersiz.');
          if(this.store.resource(a.guild,`appthread:${id}`)!==i.channelId)throw new UserError('Cevap yalniz kendi basvuru alaninda verilir.');
          const result=this.store.answerApplication(a,id,index,selected,i.id);
          if(!result.already){await this.publishApplicationQuestion(i.guild!,this.store.application(a.guild,id));await this.publishApplication(i.guild!,this.store.application(a.guild,id));}
          await i.editReply(result.already?'Bu soru zaten yanitlandi.':result.timedOut?'60 saniye doldu; bu soru yanlis sayildi.':'Cevabin kaydedildi.');return;
        }
        if(action==='setup') {
          if(!this.cfg.owners.includes(a.id))throw new UserError('Kurulum yalniz bot sahibine acik.');
            await this.exclusive('setup',()=>setup(i.guild!,this.store,a));
          await i.editReply('Kanallar, roller ve paneller hazir. Var olan diger sunucu kanallari degistirilmedi.');return;
        }
        if(action==='personal') {const thread=await this.exclusive(`workspace:${a.id}`,()=>this.personnel.ensure(i.guild!,a.id));this.personnel.schedule(a.guild,a.id);await i.editReply(`Kisisel dosyan: <#${thread.id}>`);return;}
        if(forms[action]) {
          if(action==='apply'){
            if(a.jobs.length)throw new UserError('Zaten personelsin.');
            if(!arg){await i.reply({content:'Basvuracagin gorevi sec.',components:buttons(this.store,a.guild,[['apply:psychologist','Psikolog'],['apply:reception','Resepsiyon'],['apply:finance','Finans ve IK']]),flags:MessageFlags.Ephemeral});return;}
            if(!Object.hasOwn(questions,arg))throw new UserError('Gorev secimi gecersiz.');
          }
          else if(action==='case'||action==='book')requireJob(a,'reception','psychologist','finance');
          else if(action==='visit')requireJob(a,'psychologist');
          else if(action==='refund')requireJob(a,'finance');
          else requireJob(a,'finance','psychologist','reception');
          const form=forms[action]!;await i.showModal(modal(action==='apply'?'form:apply:'+arg:'form:'+action,action==='apply'?`${jobName[arg as ApplicationJob]} Basvurusu`:form.title,form.fields));return;
        }
        if(action.startsWith('cashapprove')||action.startsWith('cashreject')||action.startsWith('appapprove')||action.startsWith('appreject')||action.startsWith('appinterview')) {
          if(action.startsWith('cash'))requireJob(a,'finance');else requireJob(a,'manager');
          if(!arg||!/^\d+$/.test(arg))throw new UserError('Kayit gecersiz.');
          await i.showModal(modal(`decision:${action}:${arg}`,'Karar Gerekcesi',[{id:'reason',label:action==='cashapprove'?'Para hareketini nasil eslestirdin?':'Karar ve kisa gerekce',long:true,max:300}]));return;
        }
        if(['cases','visits','pendingpage','applications','agenda'].includes(action)) {await this.list(i,a,action,Number(arg||0));return;}
        if(action==='appointment') {const [id,state]=i.customId.slice(3).split(':').slice(1);this.store.appointmentState(a,Number(id),state!);await i.editReply('Randevu guncellendi; kart yenileniyor.');return;}
        if(action==='shiftin'||action==='shiftout') {
          this.store.shift(a,action==='shiftin');await i.editReply(action==='shiftin'?'Mesain acildi.':'Mesain kapatildi.');return;
        }
        if(action==='applicationstatus') {
          const row=this.store.get<Application>('SELECT * FROM applications WHERE guild=? AND user=? ORDER BY id DESC LIMIT 1',a.guild,a.id);
          if(row&&['pending','interview'].includes(row.state))await this.publishApplicationQuestion(i.guild!,row).catch(()=>{});
          const thread=row?this.store.resource(a.guild,`appthread:${row.id}`):undefined;
          await i.editReply(row?`${code('BAS',row.id)}: ${row.state}${thread?` | Sinav alani: <#${thread}>`:' | Sinav alani acilamadi; BAS kodunu yonetime bildir.'}`:'Henuz kaydedilmis basvurun yok. Gorev butonlarindan birini kullan.');return;
        }
        if(action==='agenda') {
          requireJob(a,'psychologist','reception','finance');
          const all=a.jobs.includes('manager')||a.jobs.includes('reception')||a.jobs.includes('finance');
          const rows=this.store.all<Appointment>(`SELECT * FROM appointments WHERE guild=? AND state='scheduled' ${all?'':'AND staff=?'} ORDER BY starts LIMIT 20`,...all?[a.guild]:[a.guild,a.id]);
          await i.editReply(rows.map(r=>`${code('RD',r.id)} | ${code('PK',r.case_id)} | ${formatTime(r.starts)}`).join('\n')||'Bekleyen randevu yok.');return;
        }
        if(action==='summary') {
          const r=this.store.summary(a);await i.editReply({embeds:[card('Kasa Ozeti',`Onayli gelir: ${formatMoney(r.income)}\nOnayli cikis: ${formatMoney(r.outgoing)}\n**Kayitli bakiye: ${formatMoney(r.balance)}**\n\nBekleyen bildirim: ${r.count} adet / ${formatMoney(r.pending)}\nBildirilmemis seans: ${formatMoney(r.unbilled)}\nKasa teslimi bekleyen onayli gelir: ${formatMoney(r.undelivered)}\n\nBu bakiye bot kayitlaridir; oyun hesabini okumaz.`)]});return;
        }
        if(action==='pending') {
          await this.list(i,a,'pendingpage');return;
        }
        if(action==='cashview') {
          requireJob(a,'finance');const r=this.store.cash(a.guild,Number(arg));
          await i.editReply(this.cashPayload(r));return;
        }
        if(action==='export') {
          requireJob(a,'finance');const rows=this.store.all<{id:number;cash_id:number;signed_amount:number;at:number}>('SELECT * FROM ledger WHERE guild=? ORDER BY id',a.guild);
          const csv='islem,kayit,tutar,zaman\n'+rows.map(r=>`${r.id},${code('FIN',r.cash_id)},${r.signed_amount},${new Date(r.at).toISOString()}`).join('\n');
          await i.editReply({files:[new AttachmentBuilder(Buffer.from(csv),{name:'patrica-kasa.csv'})]});return;
        }
        throw new UserError('Buton taninmiyor.');
      }
      const get=(key:string)=>i.fields.getTextInputValue(key);
      if(action==='decision') {
        const bits=i.customId.split(':');const act=bits[2];const id=Number(bits[3]);const reason=get('reason');
        if(!Number.isSafeInteger(id)||id<1)throw new UserError('Kayit gecersiz.');
        if(act==='cashapprove'||act==='cashreject') {
          const row=this.store.decideCash(a,id,act==='cashapprove',reason);
          await this.publishCash(i.guild,row);await i.editReply(`${code('FIN',id)}: ${row.state}.`);return;
        }
        const state=act==='appapprove'?'approved':act==='appreject'?'rejected':act==='appinterview'?'interview':null;
        if(!state)throw new UserError('Karar gecersiz.');
        const row=this.store.application(a.guild,id),changed=row.state!==state;
        await this.exclusive(`member:${row.user}`,async()=>{
          const decided=this.store.decideApplication(a,id,state,reason);
          if(state==='approved'&&!this.store.resource(a.guild,`appapplied:${id}`)) {
            await this.syncMember(i.guild!,decided.user,decided.job as RoleKey);
            this.store.setResource(a.guild,`appapplied:${id}`,'done');
          }
          await this.publishApplication(i.guild!,decided);
        });
        let notified=true;
        if(changed)try{
          const user=await this.client.users.fetch(row.user);
          const title=state==='approved'?'Basvurun kabul edildi':state==='interview'?'Gorusmeye davetlisin':'Basvurun bu kez kabul edilmedi';
          const detail=state==='approved'?'Ekibe hos geldin. Sonraki adimlari yonetim seninle paylasacak.':state==='interview'?'Yonetim seninle gorusmek istiyor. Gorusme zamani icin haber bekle.':'Basvurunu inceledik. Baska bir donem yeniden basvurabilirsin.';
          const set=questions[row.job as ApplicationJob],answers=this.store.applicationAnswers(a.guild,id);
          const score=set?Math.round(100*answers.filter(x=>set[x.question]?.correct===x.choice).length/set.length):0;
          await user.send({embeds:[card(title,`${detail}\n\n${code('BAS',id)} | ${jobName[row.job as ApplicationJob]??row.job}${set?`\nSinav: ${score}/100 (${answers.length}/${set.length} soru cevaplandi)`:''}`).addFields({name:'Yonetim notu',value:visible(text(reason,3,300))})],allowedMentions:{parse:[]}});
        }catch{notified=false;}
        await i.editReply(`Basvuru ${state}.${state==='approved'&&this.store.resource(a.guild,`nameapplied:${row.user}`)==='manual'?' Discord adini elle karakter adina cevir.':''}${notified?'':' Ozel mesaj kapali; adaya ulasilamadi.'}`);return;
      }
      if(action!=='form'||!arg)throw new UserError('Form taninmiyor.');
      if(arg==='apply') {
        const job=choice??get('job').trim().toLowerCase();const mapped=job==='psikolog'?'psychologist':job==='resepsiyon'?'reception':job;
        if(!Object.hasOwn(questions,mapped))throw new UserError('Gorev secimi gecersiz. Basvuru kanalindaki gorev butonunu kullan.');
        const row=this.store.apply(a,get('name'),mapped,`IC: ${get('ic')}\nOOC: ${get('ooc')}\nSenaryo: ${get('scenario')}`,i.id);
        const sent=await this.publishApplication(i.guild,row).then(()=>true,()=>false);
        const thread=await this.publishApplicationQuestion(i.guild,row).then(()=>this.store.resource(a.guild,`appthread:${row.id}`),()=>undefined);
        if(thread)await this.publishApplication(i.guild,row).catch(()=>{});
        await i.editReply(`${code('BAS',row.id)} basvurun kaydedildi.${thread?` Sinav alani: <#${thread}>`:' Sinav alani acilamadi; tekrar basvurma, yonetime BAS kodunu bildir.'}${sent?'':' Yonetim karti gecikti; tekrar basvurma.'}`);return;
      }
      if(arg==='case') {
        const owner=snowflake(get('owner'));const target=await this.actor(i.guild,owner);requireJob(target,'psychologist');
        const row=this.store.openCase(a,get('name'),get('contact'),owner,i.id);
        const channel=await this.exclusive(`case:${row.id}`,()=>this.ensureCaseChannel(i.guild!,row)).catch(()=>null);
        await i.editReply(`${code('PK',row.id)} kaydedildi.${channel?` Ozel dosya: <#${channel.id}>`:' Kanal acilamadi; yeni dosya acma. /klinik dosya ile bu kodu kullan.'}`);return;
      }
      if(arg==='visit') {
        const caseId=numberCode(get('case'),'PK');
        this.store.case(a,caseId);
        const row=this.store.addVisit(a,caseId,service(get('service').trim().toLowerCase()),get('note'),i.id);
        const sent=await this.publishVisit(i.guild,row.id).then(()=>true,()=>false);
        await i.editReply(`${code('SN',row.id)} kaydedildi. Tarife ${formatMoney(row.amount)}; kasa henuz degismedi.${sent?'':' Kanal bildirimi gidemedi; yeniden seans acma.'}`);return;
      }
      if(arg==='book') {
        const row=this.store.book(a,numberCode(get('case'),'PK'),localTime(get('starts')),Number(get('minutes')),i.id);
        const sent=await this.publishAppointment(i.guild,row).then(()=>true,()=>false);
        await i.editReply(`${code('RD',row.id)} randevusu kaydedildi.${sent?'':' Takvim kanalina bildirim gidemedi; yeni randevu acma.'}`);return;
      }
      if(arg==='income'||arg==='expense'||arg==='refund') {
        if(arg==='refund')requireJob(a,'finance');else requireJob(a,'finance','psychologist','reception');
        const reference=arg==='income'?get('visit'):get('reference');
        const amount=arg==='income'?this.store.visit(a,numberCode(reference,'SN')).amount:money(get('amount'));
        let uploads;
        try{uploads=i.fields.getUploadedFiles('evidence',true);}catch{throw new UserError('Formu kapatip yeniden ac; kanit dosyasini sec.');}
        if(!uploads||uploads.size!==1)throw new UserError('Tek bir chatlog dosyasi veya ekran goruntusu sec.');
        const evidence=await downloadEvidence(uploads.first()!);
        const row=this.store.submitCash(a,arg,reference,amount,'Dosya kaniti yuklendi.',i.id,evidence);
        const sent=await this.publishCash(i.guild,row).then(()=>true,()=>false);
        await i.editReply(`${code('FIN',row.id)} kaydedildi, onay bekliyor. Kasaya islenmedi.${sent?'':' Finans paneline bildirim gidemedi; yeni kayit acma.'}`);return;
      }
      throw new UserError('Form taninmiyor.');
    } catch(e) {
      const content=e instanceof UserError?e.message:'Islem tamamlanamadi. Bazi adimlar kaydedilmis olabilir; yeniden kayit acmadan mevcut dosyayi veya bekleyen kayitlari kontrol et.';
      if(!(e instanceof UserError))console.error(`Islem hatasi | ${i.id} | ${e instanceof Error?e.name:'Unknown'}`);
      if(i.deferred||i.replied)await i.editReply({content}).catch(()=>{});else await i.reply({content,flags:MessageFlags.Ephemeral}).catch(()=>{});
    }
  }
  private async command(i:Supported,a:Actor) {
    if(!i.guild)throw new UserError('Sunucu gerekli.');
    const sub=i.options.getSubcommand();
    if(await this.personnel.command(i,a))return;
    if(sub==='ara'||sub==='seanslar'||sub==='bekleyenler') {await this.list(i,a,sub==='ara'?'cases':sub==='seanslar'?'visits':'pendingpage',(i.options.getInteger('sayfa')??1)-1,i.options.getString('isim')??'');return;}
    if(sub==='tarifeler') {requireJob(a,'psychologist','reception','finance');await i.editReply(`Patrica Klinik | Guncel seans ucretleri\n\nIlk gorusme: ${formatMoney(this.store.price(a.guild,'ilk'))} | Danisanin bu dosyadaki ilk bireysel gorusmesi.\nTakip gorusmesi: ${formatMoney(this.store.price(a.guild,'takip'))} | Ilk gorusmeden sonraki bireysel gorusmeler.\nCift gorusmesi: ${formatMoney(this.store.price(a.guild,'cift'))} | Iki kisinin birlikte katildigi tek gorusmenin toplam ucreti; kisi basi degil.\n\nRandevu olusturmak ucret yazmaz. Ucret seans kaydedilince kesinlesir; kasa ancak tahsilat kaniti dogrulanip onaylaninca degisir.`);return;}
    if(sub==='tarife') {this.store.tariff(a,service(i.options.getString('hizmet',true)),i.options.getInteger('tutar',true));await i.editReply('Yeni tarife kaydedildi. Eski seans tutarlari korundu.');return;}
    if(sub==='uzlastir') {const r=this.store.reconcile(a,i.options.getInteger('bakiye',true),i.options.getString('not',true),i.id);await i.editReply(`UZ-${r.id} | Defter: ${formatMoney(r.expected)} | Gozlenen: ${formatMoney(r.observed)} | Fark: ${formatMoney(r.difference)}. Defter degistirilmedi.`);return;}
    if(sub==='teslim') {this.store.receive(a,numberCode(i.options.getString('kod',true),'FIN'));await i.editReply('Kasa teslimi kaydedildi. Defter bakiyesi degismedi.');return;}
    if(sub==='saglik') {
      requireJob(a,'manager');const rows=this.store.all<{kind:string;target:string;state:string;attempts:number;error:string}>("SELECT kind,target,state,attempts,error FROM outbox WHERE guild=? AND state!='done' ORDER BY state,kind LIMIT 30",a.guild);
      await i.editReply(`Bildirim ve erisim kuyrugu\n${rows.map(r=>`${r.kind}:${r.target} | ${r.state} | ${r.attempts} | ${r.error??'-'}`).join('\n')||'Bekleyen is yok.'}\nBelirsiz gonderimlerde kanal gecmisini kontrol et. /klinik bildirim ile bulunan mesajin ID sini eslestir.`);return;
    }
    if(sub==='bildirim') {
      requireJob(a,'manager');const kind=i.options.getString('tur',true),target=i.options.getString('hedef',true),message=snowflake(i.options.getString('mesaj',true));
      const map:Record<string,string>={cash:'cashmsg',application:'appmsg',appointment:'appointmentmsg',visit:'visitmsg'};
      const channels:Record<string,string>={cash:'cash',application:'applications',appointment:'appointments'};
      if(!map[kind]||!/^\d+$/.test(target))throw new UserError('Bildirim hedefi gecersiz.');
      let channel;
      if(kind==='visit'){const row=this.store.visit(a,Number(target));const c=this.store.case(a,row.case_id);channel=await this.ensureCaseChannel(i.guild,c);}
      else channel=await textChannel(i.guild,this.store,channels[kind]!);
      const found=await channel.messages.fetch(message);if(found.author.id!==i.guild.client.user.id)throw new UserError('Bu botun mesaji degil.');
      const marker=code(({cash:'FIN',application:'BAS',appointment:'RD',visit:'SN'} as Record<string,string>)[kind]!,Number(target));
      if(![found.content,...found.embeds.map(e=>e.title??'')].some(v=>v===marker||v.startsWith(`${marker} | `)))throw new UserError('Mesaj kayit koduyla eslesmiyor.');
      this.store.tx(()=>{this.store.setResource(a.guild,`${map[kind]}:${target}`,message);this.store.enqueue(a.guild,kind,target);this.store.audit(a,'delivery.link',`${kind}:${target}`);});
      await i.editReply('Mevcut mesaj eslestirildi; ayni kart yenilenecek.');return;
    }
    if(sub==='tekrar') {
      requireJob(a,'manager');if(!i.options.getBoolean('yoklugunu-dogruladim',true))throw new UserError('Once kanal gecmisini kontrol et. Varsa /klinik bildirim ile eslestir.');
      const kind=i.options.getString('tur',true),id=i.options.getInteger('hedef',true);
      const map:Record<string,string>={cash:'cashmsg',application:'appmsg',appointment:'appointmentmsg',visit:'visitmsg',case:'thread-start'};
      if(!map[kind])throw new UserError('Tur gecersiz.');
      const table=({cash:'cash',application:'applications',appointment:'appointments',visit:'visits',case:'cases'} as Record<string,string>)[kind]!;
      if(!this.store.get(`SELECT id FROM ${table} WHERE guild=? AND id=?`,a.guild,id))throw new UserError('Kayit bulunamadi.');
      if(kind==='case'&&this.store.case(a,id).channel)throw new UserError('Dosyanin kayitli kanali var; kimligini yonetim kontrol etmeli.');
      this.store.tx(()=>{this.store.run('DELETE FROM resources WHERE guild=? AND key=?',a.guild,kind==='case'?`thread-start:${id}`:`send:${map[kind]}:${id}`);this.store.enqueue(a.guild,kind,String(id));this.store.audit(a,'delivery.manual_retry',`${kind}:${id}`);});
      await i.editReply('Yokluk dogrulaman kaydedildi; bildirim yeniden kuyruga alindi.');return;
    }
    if(sub==='basvurular') {
      requireJob(a,'manager','finance');
      const page=(i.options.getInteger('sayfa')??1)-1;
      const rows=this.store.all<Application>('SELECT * FROM applications WHERE guild=? ORDER BY id DESC LIMIT 10 OFFSET ?',a.guild,page*10);
      for(const row of rows)if(row.state!=='approved'||!this.store.resource(a.guild,`appapplied:${row.id}`))await this.publishApplication(i.guild,row);
      await this.list(i,a,'applications',page);return;
    }
    if(sub==='kur') {
      if(!this.cfg.owners.includes(a.id))throw new UserError('Kurulum yalniz bot sahibine acik.');
      await i.editReply({embeds:[card('Kurulum','Patrica rollerini, basvuru alanini, personel ve ozel arsiv kanallarini kurar. Mevcut Patrica panellerini yeniler. Sunucudaki diger kanallari kilitlemez veya silmez.\n\nBot rolunu Patrica rollerinin ustunde tut. Gizlilik icin aday hesapla kanallari kontrol et.')],components:buttons(this.store,a.guild,[['setup','Kurulumu Uygula']])});return;
    }
    if(sub==='personel') {
      if(!this.cfg.owners.includes(a.id))throw new UserError('Gorev atamasini bot sahibi yapabilir.');
      const target=i.options.getUser('kisi',true);const job=i.options.getString('gorev',true) as RoleKey|'offboard';
      const character=i.options.getString('karakter-adi');if(job==='offboard'&&character)throw new UserError('Personelden cikarmada karakter adi verilmez.');
      if(this.cfg.owners.includes(target.id)||target.bot)throw new UserError('Bu hesap panelden degistirilemez.');
      if(job!=='offboard'&&!character&&!this.store.resource(a.guild,`staffname:${target.id}`))throw new UserError('Ilk gorev atamasinda karakter adi ve soyadini yaz.');
      await this.exclusive(`member:${target.id}`,async()=>{
        this.store.tx(()=>{
          if(character){this.store.setResource(a.guild,`staffname:${target.id}`,characterName(character));this.store.setResource(a.guild,`nameapplied:${target.id}`,'pending');}
          for(const row of this.store.all<Application>("SELECT id FROM applications WHERE guild=? AND user=? AND state='approved'",a.guild,target.id))this.store.setResource(a.guild,`appapplied:${row.id}`,'superseded');
          this.store.setResource(a.guild,`staffdesired:${target.id}`,job);this.store.enqueue(a.guild,'staff',target.id);this.store.audit(a,`staff.${job}`,target.id);
        });
        await this.syncMember(i.guild!,target.id,job);
      });
      await i.editReply(`Gorev kaydedildi ve personel yetkileri guncellendi.${this.store.resource(a.guild,`nameapplied:${target.id}`)==='manual'?' Discord adini elle karakter adina cevir.':''}`);return;
    }
    if(sub==='isim') {
      if(!this.cfg.owners.includes(a.id))throw new UserError('Karakter adini bot sahibi duzenleyebilir.');
      const target=i.options.getUser('kisi',true),name=characterName(i.options.getString('karakter-adi',true));
      if(target.bot)throw new UserError('Bot hesabina karakter adi verilmez.');
      const member=await i.guild.members.fetch({user:target.id,force:true});
      if(!this.cfg.owners.includes(target.id)&&![...Object.keys(roles)].some(k=>k!=='candidate'&&k!=='staff'&&member.roles.cache.has(this.store.resource(a.guild,`role:${k}`)!)))throw new UserError('Kisi aktif personel degil.');
      this.store.tx(()=>{this.store.setResource(a.guild,`staffname:${target.id}`,name);this.store.setResource(a.guild,`nameapplied:${target.id}`,'pending');this.store.audit(a,'character.set',target.id);});
      const applied=await this.syncCharacterName(i.guild,target.id);this.personnel.schedule(a.guild,target.id);
      await i.editReply(applied?`${name} kaydedildi ve Discord adi guncellendi.`:`${name} kaydedildi. Discord adi bot tarafindan degistirilemiyor; sunucuda elle duzenle.`);return;
    }
    if(sub==='randevu') {
      this.store.appointmentState(a,numberCode(i.options.getString('kod',true),'RD'),i.options.getString('durum',true));await i.editReply('Randevu durumu guncellendi.');return;
    }
    const id=numberCode(i.options.getString('kod',true),'PK');
    if(sub==='devret') {
      requireJob(a,'manager');const target=i.options.getUser('psikolog',true);requireJob(await this.actor(i.guild,target.id),'psychologist');
      await this.exclusive(`case:${id}`,async()=>{
        const row=this.store.case(a,id);
        // A transfer must not report success while the former owner still has access.
        this.store.enqueue(a.guild,'case',String(id));
        if(row.channel&&row.owner!==target.id){const thread=await i.guild!.channels.fetch(row.channel);if(thread?.type===ChannelType.PrivateThread){if(thread.archived)await thread.setArchived(false);await thread.members.remove(row.owner);}}
        this.store.transfer(a,id,target.id,i.options.getBoolean('iptal')??false);
      });
      await i.editReply('Dosya ve gelecekteki randevular kaydedildi. Erisimler ve kartlar kuyrukta yenileniyor.');return;
    }
    const row=this.store.case(a,id);
    if(sub==='dosya-durumu') {
      const state=i.options.getBoolean('acik',true)?'active':'closed';this.store.tx(()=>{
        this.store.run('UPDATE cases SET state=? WHERE guild=? AND id=?',state,a.guild,id);
        if(state==='closed')for(const ap of this.store.all<Appointment>("SELECT * FROM appointments WHERE guild=? AND case_id=? AND state IN ('scheduled','needs_review')",a.guild,id)){this.store.run("UPDATE appointments SET state='cancelled' WHERE guild=? AND id=?",a.guild,ap.id);this.store.audit(a,'appointment.cancelled',String(ap.id));}
        this.store.audit(a,`case.${state}`,String(id));
      });await i.editReply(`Dosya ${state}.`);return;
    }
    const channel=await this.exclusive(`case:${id}`,()=>this.ensureCaseChannel(i.guild!,row));
    const visits=this.store.all<{id:number;service:string;note:string;at:number}>('SELECT * FROM visits WHERE guild=? AND case_id=? ORDER BY id',a.guild,id);
    const body=visits.map(v=>`${code('SN',v.id)} | ${v.service} | ${formatTime(v.at)}\n${v.note}`).join('\n\n');
    await i.editReply({content:`${code('PK',id)} | ${visible(row.name)} | ${row.state}\nSorumlu: ${row.owner}\nDosya kanali: <#${channel.id}>`,files:[new AttachmentBuilder(Buffer.from(i.options.getBoolean('html')?recordHtml(code('PK',id),body):body||'Henuz gorusme kaydi yok.'),{name:`${code('PK',id)}-notlar.${i.options.getBoolean('html')?'html':'txt'}`})]});
  }
  async tick() {
    const guild=await this.client.guilds.fetch(this.cfg.guild);
    if(!this.store.resource(guild.id,'channel:appointments'))return;
    if(this.store.resource(guild.id,'channel:people'))this.personnel.scheduleDaily(guild.id);
    await this.processQueue(guild);
    const cursor=Number(this.store.resource(guild.id,'audit:cursor')||0);
    const events=this.store.all<{id:number;actor:string;action:string;target:string;at:number}>('SELECT * FROM audit WHERE guild=? AND id>? ORDER BY id LIMIT 100',guild.id,cursor);
    const line=(e:typeof events[number])=>`${e.id} | ${formatTime(e.at)} | ${e.actor} | ${e.action} | ${e.target}`;
    for(const batch of auditBatches(events,line)) {
      await deliver(this.store,guild.id,`auditmsg:${batch[0]!.id}-${batch.at(-1)!.id}`,await textChannel(guild,this.store,'audit'),{content:batch.map(line).join('\n')});
      this.store.setResource(guild.id,'audit:cursor',String(batch.at(-1)!.id));
    }
    for(const row of this.store.all<Appointment>("SELECT * FROM appointments WHERE guild=? AND state='scheduled' AND ends<?",guild.id,Date.now())) {
      this.store.tx(()=>{this.store.run("UPDATE appointments SET state='needs_review' WHERE guild=? AND id=?",guild.id,row.id);this.store.audit({id:'system',guild:guild.id,jobs:['manager']},'appointment.needs_review',String(row.id));});
    }
    const rows=this.store.all<Appointment>('SELECT * FROM appointments WHERE guild=? AND state=? AND reminded=0 AND starts>? AND starts<=?',guild.id,'scheduled',Date.now(),Date.now()+15*60000);
    for(const row of rows) {
      const owner=await this.actor(guild,row.staff).catch(()=>null);
      if(!owner?.jobs.some(j=>j==='manager'||j==='psychologist'))continue;
      const message=await deliver(this.store,guild.id,`reminder:${row.id}`,await textChannel(guild,this.store,'appointments'),{content:`Randevu yaklasiyor: ${code('RD',row.id)} | ${code('PK',row.case_id)} | ${formatTime(row.starts)} | Sorumlu: ${row.staff}`});
      if(message)this.store.run('UPDATE appointments SET reminded=1 WHERE guild=? AND id=?',guild.id,row.id);
    }
    const key='backup:last';const last=Number(this.store.resource(guild.id,key)||0);
    if(Date.now()-last>86400000) {
      await this.store.backup(resolve(this.cfg.data,'backups',`${new Date().toISOString().replaceAll(':','-')}.sqlite`));this.store.setResource(guild.id,key,String(Date.now()));
    }
  }
}
