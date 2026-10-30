import {Store,code} from './store.js';
import {Actor,UserError,line,text,requireJob,snowflake,localTime} from './domain.js';

export type ReportKind='absence'|'incident'|'handover';
export interface StaffReport {id:number;guild:string;subject:string;maker:string;kind:ReportKind;day:string;until_day:string;body:string;reference:string;state:string;reviewer:string|null;reason:string|null;at:number;}
export const today=(now=Date.now())=>new Date(now+3*3600000).toISOString().slice(0,10);
export function dayRange(day:string) {return {start:localTime(`${day} 00:00`),end:localTime(`${day} 00:00`)+86400000};}
export class PersonnelStore {
  constructor(readonly s:Store) {
    s.db.exec(`CREATE TABLE IF NOT EXISTS staff_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,subject TEXT NOT NULL,maker TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('absence','incident','handover')),day TEXT NOT NULL,until_day TEXT NOT NULL,body TEXT NOT NULL,reference TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',reviewer TEXT,reason TEXT,at INTEGER NOT NULL,request TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS staff_statements(report INTEGER PRIMARY KEY REFERENCES staff_reports(id),guild TEXT NOT NULL,author TEXT NOT NULL,body TEXT NOT NULL,at INTEGER NOT NULL,request TEXT NOT NULL UNIQUE);
      CREATE TRIGGER IF NOT EXISTS statement_no_update BEFORE UPDATE ON staff_statements BEGIN SELECT RAISE(ABORT,'append only');END;
      CREATE TRIGGER IF NOT EXISTS statement_no_delete BEFORE DELETE ON staff_statements BEGIN SELECT RAISE(ABORT,'append only');END;`);
    s.db.exec(`CREATE TRIGGER IF NOT EXISTS report_body_immutable BEFORE UPDATE OF guild,subject,maker,kind,day,until_day,body,reference,at,request ON staff_reports BEGIN SELECT RAISE(ABORT,'original report is immutable');END;
      CREATE TRIGGER IF NOT EXISTS report_no_delete BEFORE DELETE ON staff_reports BEGIN SELECT RAISE(ABORT,'append only');END;`);
  }
  own(a:Actor,subject=a.id) {requireJob(a,'psychologist','reception','finance');if(subject!==a.id&&!a.jobs.includes('manager'))throw new UserError('Bu personel dosyasi sana ait degil.');return subject;}
  report(a:Actor,id:number) {const r=this.s.get<StaffReport>('SELECT * FROM staff_reports WHERE guild=? AND id=?',a.guild,id);if(!r)throw new UserError('Personel kaydi bulunamadi.');this.own(a,r.subject);return r;}
  submit(a:Actor,kind:ReportKind,subject:string,day:string,until:string,body:string,reference:string,request:string) {
    this.own(a);snowflake(subject);if(kind==='incident')requireJob(a,'manager');else if(subject!==a.id)throw new UserError('Mazeret ve devir kendi adina girilir.');
    if(!['absence','incident','handover'].includes(kind))throw new UserError('Kayit turu gecersiz.');
    const {start}=dayRange(day),end=dayRange(until).start;
    const now=dayRange(today()).start;if(start<now-30*86400000||start>now+366*86400000||end<start||end-start>30*86400000)throw new UserError('Tarih araligi gecersiz; en fazla 31 gun sec.');
    body=text(body,10,1200);reference=line(reference||'-',1,100);
    return this.s.tx(()=>{
      const old=this.s.get<StaffReport>('SELECT * FROM staff_reports WHERE guild=? AND request=?',a.guild,request);if(old)return this.report(a,old.id);
      if(kind==='absence'&&this.s.get("SELECT id FROM staff_reports WHERE guild=? AND subject=? AND kind='absence' AND state!='rejected' AND day<=? AND until_day>=?",a.guild,subject,until,day))throw new UserError('Bu tarih icin mazeret kaydin var. Eski kaydi kontrol et.');
      const id=Number(this.s.run('INSERT INTO staff_reports(guild,subject,maker,kind,day,until_day,body,reference,at,request) VALUES(?,?,?,?,?,?,?,?,?,?)',a.guild,subject,a.id,kind,day,until,body,reference,Date.now(),request).lastInsertRowid);
      this.s.audit(a,`personnel.${kind}`,String(id));this.s.enqueue(a.guild,'report',String(id));this.s.enqueue(a.guild,'workspace',subject);return this.report(a,id);
    });
  }
  decide(a:Actor,id:number,state:string,reason:string) {
    requireJob(a,'manager');const r=this.report(a,id);if(a.id===r.subject)throw new UserError('Kendi personel kaydini sonuclandiramazsin.');
    const allowed=r.kind==='absence'?['accepted','rejected']:r.kind==='incident'?['closed']:['acknowledged'];if(!allowed.includes(state))throw new UserError('Karar gecersiz.');reason=text(reason,3,300);
    return this.s.tx(()=>{if(r.state===state)return r;if(r.state!=='pending')throw new UserError('Kayit sonuclanmis.');this.s.run('UPDATE staff_reports SET state=?,reviewer=?,reason=? WHERE guild=? AND id=?',state,a.id,reason,a.guild,id);this.s.audit(a,`personnel.${state}`,String(id));this.s.enqueue(a.guild,'report',String(id));this.s.enqueue(a.guild,'workspace',r.subject);return this.report(a,id);});
  }
  statement(a:Actor,id:number,body:string,request:string) {
    const r=this.report(a,id);if(r.kind!=='incident'||a.id!==r.subject||r.state!=='pending')throw new UserError('Bu tutanak icin aciklama veremezsin.');body=text(body,10,1200);
    this.s.tx(()=>{const old=this.s.get<{request:string}>('SELECT request FROM staff_statements WHERE guild=? AND report=?',a.guild,id);if(old?.request===request)return;if(old)throw new UserError('Aciklaman zaten kayitli. Onceki metin degistirilmez.');this.s.run('INSERT INTO staff_statements VALUES(?,?,?,?,?,?)',id,a.guild,a.id,body,Date.now(),request);this.s.audit(a,'personnel.statement',String(id));this.s.enqueue(a.guild,'report',String(id));});
  }
  daily(a:Actor,subject=a.id,day=today()) {
    this.own(a,subject);const {start,end}=dayRange(day);
    const scalar=(sql:string,...args:(string|number)[])=>this.s.get<{n:number}>(sql,...args)!.n;
    const visits=this.s.all<{id:number;case_id:number;service:string;amount:number}>('SELECT id,case_id,service,amount FROM visits WHERE guild=? AND staff=? AND at>=? AND at<? ORDER BY id',a.guild,subject,start,end);
    const cases=scalar("SELECT COUNT(*) n FROM cases WHERE guild=? AND owner=? AND state='active'",a.guild,subject);
    const appointments=scalar("SELECT COUNT(*) n FROM appointments WHERE guild=? AND staff=? AND starts>=? AND starts<? AND state!='cancelled'",a.guild,subject,start,end);
    const shifts=this.s.all<{starts:number;ends:number|null}>('SELECT starts,ends FROM shifts WHERE guild=? AND staff=? AND starts<? AND (ends IS NULL OR ends>?)',a.guild,subject,end,start);
    const minutes=Math.floor(shifts.reduce((n,r)=>n+Math.max(0,Math.min(r.ends??Date.now(),end)-Math.max(r.starts,start)),0)/60000);
    const pending=scalar("SELECT COUNT(*) n FROM cash WHERE guild=? AND maker=? AND state='pending'",a.guild,subject);
    const reports=this.s.all<StaffReport>('SELECT * FROM staff_reports WHERE guild=? AND subject=? ORDER BY id DESC LIMIT 8',a.guild,subject);
    return {day,cases,appointments,minutes,pending,visits,reports,activeShift:!!this.s.get('SELECT id FROM shifts WHERE guild=? AND staff=? AND ends IS NULL',a.guild,subject),lines:visits.map(v=>`${code('SN',v.id)} | ${code('PK',v.case_id)} | ${v.service}`)};
  }
}
