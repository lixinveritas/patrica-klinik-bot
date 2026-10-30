import { DatabaseSync, SQLInputValue, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Actor, PRICES, Service, UserError, line, money, proofHash, requireJob, snowflake, text } from './domain.js';
import type { Evidence } from './evidence.js';
import { diskAvailable, inspectBackup } from './recovery.js';

export interface CaseRow { id: number; guild: string; name: string; contact: string; owner: string; channel: string | null; state: string; }
export interface Visit { id: number; guild: string; case_id: number; staff: string; service: Service; note: string; amount: number; }
export interface Cash { id: number; guild: string; kind: string; amount: number; visit: number | null; original: number | null; reference: string; proof: string; maker: string; state: string; reviewer: string | null; }
export interface Application { id: number; guild: string; user: string; name: string; job: string; body: string; state: string; }
export interface Appointment { id: number; guild: string; case_id: number; staff: string; starts: number; ends: number; state: string; reminded: number; }
export interface DeliveryJob { guild:string;kind:string;target:string;version:number;attempts:number; }
export interface Reconciliation { id:number;observed:number;expected:number;difference:number; }
export const code = (prefix: string, id: number) => `${prefix}-${String(id).padStart(4,'0')}`;
export function numberCode(v: string, prefix: string): number {
  if (!new RegExp(`^${prefix}-[0-9]{1,9}$`, 'i').test(v.trim())) throw new UserError(`${prefix}-0001 gibi bir kod yaz.`);
  const n = Number(v.trim().split('-')[1]);
  if (!Number.isSafeInteger(n) || n < 1) throw new UserError('Kod gecersiz.');
  return n;
}

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS resources(guild TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(guild,key));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
      CREATE TABLE IF NOT EXISTS cases(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,name TEXT NOT NULL,patient_key TEXT NOT NULL,contact TEXT NOT NULL,owner TEXT NOT NULL,channel TEXT,state TEXT NOT NULL DEFAULT 'active',request TEXT NOT NULL UNIQUE,UNIQUE(guild,patient_key));
      CREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,case_id INTEGER NOT NULL REFERENCES cases(id),staff TEXT NOT NULL,service TEXT NOT NULL,note TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),request TEXT NOT NULL UNIQUE,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS applications(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,user TEXT NOT NULL,name TEXT NOT NULL,job TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',reviewer TEXT,reason TEXT,request TEXT NOT NULL UNIQUE,at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_application ON applications(guild,user) WHERE state IN ('pending','interview');
      CREATE TABLE IF NOT EXISTS cash(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('income','expense','refund')),amount INTEGER NOT NULL CHECK(amount>0),visit INTEGER REFERENCES visits(id),original INTEGER REFERENCES cash(id),reference TEXT NOT NULL,proof TEXT NOT NULL,proof_hash TEXT NOT NULL,maker TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','rejected')),reviewer TEXT,reason TEXT,request TEXT NOT NULL UNIQUE,at INTEGER NOT NULL,UNIQUE(guild,proof_hash));
      CREATE UNIQUE INDEX IF NOT EXISTS one_visit_payment ON cash(guild,visit) WHERE state!='rejected' AND kind='income';
      CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,cash_id INTEGER NOT NULL UNIQUE REFERENCES cash(id),signed_amount INTEGER NOT NULL,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS cash_evidence(cash_id INTEGER PRIMARY KEY REFERENCES cash(id),guild TEXT NOT NULL,hash TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,UNIQUE(guild,hash));
      CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'append only'); END;
      CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'append only'); END;
      CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,case_id INTEGER NOT NULL REFERENCES cases(id),staff TEXT NOT NULL,starts INTEGER NOT NULL,ends INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'scheduled',reminded INTEGER NOT NULL DEFAULT 0,request TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,staff TEXT NOT NULL,starts INTEGER NOT NULL,ends INTEGER);
      CREATE UNIQUE INDEX IF NOT EXISTS one_shift ON shifts(guild,staff) WHERE ends IS NULL;
      CREATE TABLE IF NOT EXISTS outbox(guild TEXT NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,error TEXT,PRIMARY KEY(guild,kind,target));
      CREATE TABLE IF NOT EXISTS tariffs(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,service TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reconciliations(id INTEGER PRIMARY KEY,guild TEXT NOT NULL,actor TEXT NOT NULL,observed INTEGER NOT NULL,expected INTEGER NOT NULL,difference INTEGER NOT NULL,note TEXT NOT NULL,request TEXT NOT NULL UNIQUE,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS custody(cash_id INTEGER PRIMARY KEY REFERENCES cash(id),guild TEXT NOT NULL,receiver TEXT NOT NULL,at INTEGER NOT NULL);
    `);
  }
  get<T>(sql: string, ...args: (string | number | null)[]): T | undefined { return this.db.prepare(sql).get(...args) as T | undefined; }
  all<T>(sql: string, ...args: (string | number | null)[]): T[] { return this.db.prepare(sql).all(...args) as T[]; }
  run(sql: string, ...args: SQLInputValue[]) { return this.db.prepare(sql).run(...args); }
  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  resource(guild: string, key: string): string | undefined { return this.get<{value:string}>('SELECT value FROM resources WHERE guild=? AND key=?', guild,key)?.value; }
  setResource(guild: string, key: string, value: string) { this.run('INSERT INTO resources VALUES(?,?,?) ON CONFLICT(guild,key) DO UPDATE SET value=excluded.value',guild,key,value); }
  audit(a: Actor, action: string, target: string) {
    this.run('INSERT INTO audit(guild,actor,action,target,at) VALUES(?,?,?,?,?)', a.guild,a.id,action,target,Date.now());
    const kind=action.split('.')[0]!;
    if(['case','visit','application','cash','appointment','shift'].includes(kind))this.enqueue(a.guild,kind,target);
    if(kind==='case')this.enqueue(a.guild,'index','all');
  }
  enqueue(guild:string,kind:string,target:string) {
    this.run(`INSERT INTO outbox(guild,kind,target) VALUES(?,?,?) ON CONFLICT(guild,kind,target) DO UPDATE SET version=version+1,state=CASE WHEN state='running' THEN state ELSE 'pending' END,attempts=0,due=0,error=NULL`,guild,kind,target);
  }
  claim(guild:string,now=Date.now()) {
    return this.tx(()=>{
      const job=this.get<DeliveryJob>(`SELECT * FROM outbox WHERE guild=? AND ((state='pending' AND due<=?) OR (state='running' AND due<?)) ORDER BY due,kind,target LIMIT 1`,guild,now,now);
      if(job)this.run("UPDATE outbox SET state='running',due=? WHERE guild=? AND kind=? AND target=?",now+300000,guild,job.kind,job.target);
      return job;
    });
  }
  finish(job:DeliveryJob,error?:unknown) {
    const code=error&&typeof error==='object'&&'code' in error?String(error.code):error instanceof Error?error.name:'Unknown';
    const attempts=job.attempts+1;
    const blocked=error&&(attempts>=5||['50013','50001','10003','DeliveryUncertain'].includes(code));
    this.run(`UPDATE outbox SET state=CASE WHEN version!=? THEN 'pending' ELSE ? END,attempts=?,due=?,error=? WHERE guild=? AND kind=? AND target=?`,job.version,error?(blocked?'blocked':'pending'):'done',error?attempts:0,error?Date.now()+Math.min(3600000,30000*2**attempts):0,error?code:null,job.guild,job.kind,job.target);
  }
  price(guild:string,kind:Service) {return this.get<{amount:number}>('SELECT amount FROM tariffs WHERE guild=? AND service=? ORDER BY id DESC LIMIT 1',guild,kind)?.amount??PRICES[kind];}
  tariff(a:Actor,kind:Service,amount:number) {
    requireJob(a,'manager');if(!Object.hasOwn(PRICES,kind))throw new UserError('Hizmet gecersiz.');money(amount);
    this.tx(()=>{this.run('INSERT INTO tariffs(guild,service,amount,at) VALUES(?,?,?,?)',a.guild,kind,amount,Date.now());this.audit(a,'tariff.change',`${kind}:${amount}`);});
  }
  reconcile(a:Actor,observed:number,note:string,request:string) {
    requireJob(a,'finance');if(!Number.isSafeInteger(observed)||observed<0||observed>99999999)throw new UserError('Bakiye gecersiz.');note=text(note,3,300);
    return this.tx(()=>{
      const prior=this.get<Reconciliation>('SELECT * FROM reconciliations WHERE guild=? AND request=?',a.guild,request);if(prior)return prior;
      const expected=this.summary(a).balance;
      const id=Number(this.run('INSERT INTO reconciliations(guild,actor,observed,expected,difference,note,request,at) VALUES(?,?,?,?,?,?,?,?)',a.guild,a.id,observed,expected,observed-expected,note,request,Date.now()).lastInsertRowid);
      this.audit(a,'reconciliation.add',String(id));return this.get<Reconciliation>('SELECT * FROM reconciliations WHERE id=? AND guild=?',id,a.guild)!;
    });
  }
  receive(a:Actor,id:number) {
    requireJob(a,'finance');return this.tx(()=>{const r=this.cash(a.guild,id);
      if(r.kind!=='income'||r.state!=='approved')throw new UserError('Yalniz onayli tahsilatin kasa teslimi kaydedilir.');
      if(r.maker===a.id)throw new UserError('Kendi tahsilatinin teslimini onaylayamazsin.');
      if(this.get('SELECT cash_id FROM custody WHERE guild=? AND cash_id=?',a.guild,id))return;
      this.run('INSERT INTO custody VALUES(?,?,?,?)',id,a.guild,a.id,Date.now());this.audit(a,'cash.received',String(id));
    });
  }
  findCases(a:Actor,query='',page=0) {
    requireJob(a,'psychologist','reception');if(!Number.isInteger(page)||page<0||page>100000)throw new UserError('Sayfa gecersiz.');
    query=text(query||' ',0,80).trim().toLocaleLowerCase('tr-TR');
    const own=!a.jobs.some(j=>j==='manager'||j==='reception');
    return this.all<CaseRow>(`SELECT id,guild,name,owner,state,channel FROM cases WHERE guild=? ${own?'AND owner=?':''} AND (instr(patient_key,?)>0 OR CAST(id AS TEXT)=?) ORDER BY id DESC LIMIT 11 OFFSET ?`,...own?[a.guild,a.id,query,query.replace(/^pk-0*/,' ' ).trim(),page*10]:[a.guild,query,query.replace(/^pk-0*/,' ').trim(),page*10]);
  }
  transfer(a:Actor,id:number,owner:string,cancel=false) {
    requireJob(a,'manager');snowflake(owner);const c=this.case(a,id);
    return this.tx(()=>{
      const future=this.all<Appointment>("SELECT * FROM appointments WHERE guild=? AND case_id=? AND state='scheduled' AND ends>?",a.guild,id,Date.now());
      if(!cancel)for(const r of future)if(this.get("SELECT id FROM appointments WHERE guild=? AND staff=? AND case_id!=? AND state='scheduled' AND starts<? AND ends>?",a.guild,owner,id,r.ends,r.starts))throw new UserError('Yeni sorumlunun takvimi cakisiyor. Iptal secenegiyle devret veya takvimi duzelt.');
      // Keep a revocation task even if Discord is unavailable during transfer.
      this.setResource(a.guild,`revoke:${id}:${c.owner}`,c.owner);
      this.run('UPDATE cases SET owner=? WHERE guild=? AND id=?',owner,a.guild,id);
      for(const r of future){this.run('UPDATE appointments SET staff=?,state=? WHERE guild=? AND id=?',owner,cancel?'cancelled':'scheduled',a.guild,r.id);this.audit(a,'appointment.transfer',String(r.id));}
      this.audit(a,'case.transfer',String(id));return this.case(a,id);
    });
  }
  case(a: Actor, id: number, access = true): CaseRow {
    const row = this.get<CaseRow>('SELECT * FROM cases WHERE guild=? AND id=?',a.guild,id);
    if (!row) throw new UserError('Dosya bulunamadi.');
    if (access) {
      requireJob(a,'psychologist');
      if (!a.jobs.includes('manager') && row.owner !== a.id) throw new UserError('Bu dosya sana atanmamis.');
    }
    return row;
  }
  openCase(a: Actor, name: string, contact: string, owner: string, request: string): CaseRow {
    requireJob(a,'reception','psychologist');
    name=line(name,3,80); contact=line(contact,2,80); snowflake(owner);
    if (a.jobs.includes('psychologist') && !a.jobs.includes('manager') && !a.jobs.includes('reception') && owner !== a.id) throw new UserError('Kendi adina dosya acabilirsin.');
    return this.tx(() => {
      const prior=this.get<CaseRow>('SELECT * FROM cases WHERE guild=? AND request=?',a.guild,request); if(prior)return prior;
      if(this.get('SELECT id FROM cases WHERE guild=? AND patient_key=?',a.guild,name.toLocaleLowerCase('tr-TR'))) throw new UserError('Bu karakterin zaten dosyasi var.');
      const r=this.run('INSERT INTO cases(guild,name,patient_key,contact,owner,request) VALUES(?,?,?,?,?,?)',a.guild,name,name.toLocaleLowerCase('tr-TR'),contact,owner,request);
      const id=Number(r.lastInsertRowid); this.audit(a,'case.open',String(id)); return this.case(a,id,false);
    });
  }
  visit(a: Actor, id: number): Visit {
    const v=this.get<Visit>('SELECT * FROM visits WHERE guild=? AND id=?',a.guild,id); if(!v)throw new UserError('Seans bulunamadi.'); return v;
  }
  addVisit(a: Actor, caseId: number, kind: Service, note: string, request: string): Visit {
    const c=this.case(a,caseId); if(c.state!=='active')throw new UserError('Dosya kapali.');
    if(!Object.hasOwn(PRICES,kind))throw new UserError('Hizmet gecersiz.');
    note=text(note,10,2000);
    return this.tx(()=>{
      const prior=this.get<Visit>('SELECT * FROM visits WHERE guild=? AND request=?',a.guild,request); if(prior)return prior;
      if(kind==='ilk' && this.get('SELECT id FROM visits WHERE guild=? AND case_id=? AND service=?',a.guild,caseId,'ilk'))throw new UserError('Dosyanin ilk gorusmesi zaten kayitli.');
      if(kind==='takip' && !this.get('SELECT id FROM visits WHERE guild=? AND case_id=? AND service=?',a.guild,caseId,'ilk'))throw new UserError('Once ilk gorusmeyi kaydet.');
      const id=Number(this.run('INSERT INTO visits(guild,case_id,staff,service,note,amount,request,at) VALUES(?,?,?,?,?,?,?,?)',a.guild,caseId,a.id,kind,note,this.price(a.guild,kind),request,Date.now()).lastInsertRowid);
      this.audit(a,'visit.add',String(id)); return this.visit(a,id);
    });
  }
  apply(a: Actor, name: string, job: string, body: string, request: string): Application {
    if(a.jobs.length)throw new UserError('Zaten personelsin.');
    name=line(name,3,80);body=text(body,30,2000);
    if(!['psychologist','reception'].includes(job))throw new UserError('Gorev: psikolog veya resepsiyon.');
    return this.tx(()=>{
      const prior=this.get<Application>('SELECT * FROM applications WHERE guild=? AND request=?',a.guild,request);if(prior)return prior;
      if(this.get('SELECT id FROM applications WHERE guild=? AND user=? AND state IN (?,?)',a.guild,a.id,'pending','interview'))throw new UserError('Bekleyen bir basvurun var.');
      const id=Number(this.run('INSERT INTO applications(guild,user,name,job,body,request,at) VALUES(?,?,?,?,?,?,?)',a.guild,a.id,name,job,body,request,Date.now()).lastInsertRowid);
      this.audit(a,'application.add',String(id));return this.application(a.guild,id);
    });
  }
  application(guild: string,id: number): Application { const r=this.get<Application>('SELECT * FROM applications WHERE guild=? AND id=?',guild,id);if(!r)throw new UserError('Basvuru bulunamadi.');return r; }
  decideApplication(a: Actor,id: number,state: string,reason: string) {
    requireJob(a,'manager');reason=text(reason,3,300);
    if(!['interview','approved','rejected'].includes(state))throw new UserError('Karar gecersiz.');
    return this.tx(()=>{
      const row=this.application(a.guild,id);
      if(row.user===a.id)throw new UserError('Kendi basvurunu degerlendiremezsin.');
      if(row.state===state)return row;
      if(!['pending','interview'].includes(row.state))throw new UserError('Basvuru sonuclanmis.');
      this.run('UPDATE applications SET state=?,reviewer=?,reason=? WHERE guild=? AND id=?',state,a.id,reason,a.guild,id);
      if(state==='approved'){this.setResource(a.guild,`staffdesired:${row.user}`,row.job);this.enqueue(a.guild,'staff',row.user);}
      this.audit(a,`application.${state}`,String(id));return this.application(a.guild,id);
    });
  }
  cash(guild: string,id: number): Cash { const r=this.get<Cash>('SELECT * FROM cash WHERE guild=? AND id=?',guild,id);if(!r)throw new UserError('Finans kaydi bulunamadi.');return r; }
  evidence(a:Actor,id:number):Evidence|undefined {
    requireJob(a,'finance');this.cash(a.guild,id);
    return this.get<Evidence>('SELECT hash,name,mime,data FROM cash_evidence WHERE guild=? AND cash_id=?',a.guild,id);
  }
  submitCash(a: Actor, kind: 'income'|'expense'|'refund', reference: string, amount: number, proof: string, request: string, evidence?:Evidence): Cash {
    requireJob(a,'finance','psychologist','reception');
    if(evidence) {
      if(!/^[a-f0-9]{64}$/.test(evidence.hash)||!['text/plain','image/png'].includes(evidence.mime)||evidence.data.byteLength<1||evidence.data.byteLength>4*1024*1024)throw new UserError('Dosya kaniti gecersiz.');
      proof=`Dosya kaniti SHA256: ${evidence.hash}`;
    }
    proof=text(proof,20,2000);const hash=proofHash(proof);reference=line(reference,2,160);money(amount);
    return this.tx(()=>{
      const prior=this.get<Cash>('SELECT * FROM cash WHERE guild=? AND request=?',a.guild,request);if(prior)return prior;
      let visit: number|null=null;let original: number|null=null;
      if(kind==='income') {
        const v=this.visit(a,numberCode(reference,'SN'));this.case(a,v.case_id,false);
        if(!a.jobs.includes('manager') && !a.jobs.includes('finance') && v.staff!==a.id)throw new UserError('Bu seans sana ait degil.');
        visit=v.id;amount=v.amount;
        if(this.get('SELECT id FROM cash WHERE guild=? AND visit=? AND state!=?',a.guild,visit,'rejected'))throw new UserError('Bu seans icin tahsilat zaten var.');
      } else if(kind==='refund') {
        requireJob(a,'finance');original=numberCode(reference,'FIN');const src=this.cash(a.guild,original);
        if(src.kind!=='income'||src.state!=='approved')throw new UserError('Yalniz onayli gelire iade acilabilir.');
        this.checkRefund(a.guild,original,amount);
      } else if(kind!=='expense')throw new UserError('Finans islem turu gecersiz.');
      if(this.get('SELECT id FROM cash WHERE guild=? AND proof_hash=?',a.guild,hash))throw new UserError('Bu chatlog kaniti daha once kullanilmis.');
      const id=Number(this.run('INSERT INTO cash(guild,kind,amount,visit,original,reference,proof,proof_hash,maker,request,at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',a.guild,kind,amount,visit,original,reference,proof,hash,a.id,request,Date.now()).lastInsertRowid);
      if(evidence)this.run('INSERT INTO cash_evidence(cash_id,guild,hash,name,mime,data) VALUES(?,?,?,?,?,?)',id,a.guild,evidence.hash,evidence.name,evidence.mime,evidence.data);
      this.audit(a,'cash.submit',String(id));return this.cash(a.guild,id);
    });
  }
  checkRefund(guild: string,original: number,amount: number,exclude=0) {
    const src=this.cash(guild,original);
    const used=this.get<{n:number}>('SELECT COALESCE(SUM(amount),0) n FROM cash WHERE guild=? AND original=? AND state!=? AND id!=?',guild,original,'rejected',exclude)!.n;
    if(used+amount>src.amount)throw new UserError('Iade toplami asil tahsilati asamaz.');
  }
  decideCash(a: Actor,id: number,approve: boolean,reason: string): Cash {
    requireJob(a,'finance');reason=text(reason,3,300);
    return this.tx(()=>{
      const row=this.cash(a.guild,id);
      if(row.maker===a.id)throw new UserError('Kendi finans kaydini onaylayamaz veya reddedemezsin.');
      const next=approve?'approved':'rejected';
      if(row.state===next)return row;
      if(row.state!=='pending')throw new UserError('Kayit daha once sonuclanmis.');
      if(approve) {
        if(row.kind==='refund')this.checkRefund(a.guild,row.original!,row.amount,row.id);
        const signed=row.kind==='income'?row.amount:-row.amount;
        const total=this.summary(a).balance+signed;
        if(!Number.isSafeInteger(total))throw new UserError('Kasa sayisal siniri asti.');
        if(total<0)throw new UserError('Onayli kasa bu cikisi karsilamiyor.');
        this.run('INSERT INTO ledger(guild,cash_id,signed_amount,at) VALUES(?,?,?,?)',a.guild,id,signed,Date.now());
      }
      this.run('UPDATE cash SET state=?,reviewer=?,reason=? WHERE guild=? AND id=?',next,a.id,reason,a.guild,id);
      this.audit(a,`cash.${next}`,String(id));return this.cash(a.guild,id);
    });
  }
  summary(a: Actor) {
    requireJob(a,'finance');
    const r=this.get<{income:number;outgoing:number;balance:number}>('SELECT COALESCE(SUM(CASE WHEN signed_amount>0 THEN signed_amount ELSE 0 END),0) income,COALESCE(SUM(CASE WHEN signed_amount<0 THEN -signed_amount ELSE 0 END),0) outgoing,COALESCE(SUM(signed_amount),0) balance FROM ledger WHERE guild=?',a.guild)!;
    const p=this.get<{pending:number;count:number}>('SELECT COALESCE(SUM(amount),0) pending,COUNT(*) count FROM cash WHERE guild=? AND state=?',a.guild,'pending')!;
    const unbilled=this.get<{n:number}>('SELECT COALESCE(SUM(v.amount),0) n FROM visits v WHERE v.guild=? AND NOT EXISTS(SELECT 1 FROM cash c WHERE c.guild=v.guild AND c.visit=v.id AND c.state!=?)',a.guild,'rejected')!.n;
    const undelivered=this.get<{n:number}>("SELECT COALESCE(SUM(amount),0) n FROM cash c WHERE guild=? AND kind='income' AND state='approved' AND NOT EXISTS(SELECT 1 FROM custody k WHERE k.guild=c.guild AND k.cash_id=c.id)",a.guild)!.n;
    return {...r,...p,unbilled,undelivered};
  }
  book(a: Actor,caseId: number,starts: number,minutes: number,request: string): Appointment {
    requireJob(a,'reception','psychologist');const c=this.case(a,caseId,false);
    if(a.jobs.includes('psychologist')&&!a.jobs.includes('manager')&&!a.jobs.includes('reception'))this.case(a,caseId);
    if(c.state!=='active')throw new UserError('Dosya kapali.');
    if(![20,30,45,60].includes(minutes)||!Number.isSafeInteger(starts)||starts<Date.now()||starts>Date.now()+366*86400000)throw new UserError('Gelecek bir tarih ve 20/30/45/60 dakika sec.');
    return this.tx(()=>{
      const old=this.get<Appointment>('SELECT * FROM appointments WHERE guild=? AND request=?',a.guild,request);if(old)return old;
      const ends=starts+minutes*60000;
      if(this.get('SELECT id FROM appointments WHERE guild=? AND state=? AND (staff=? OR case_id=?) AND starts<? AND ends>?',a.guild,'scheduled',c.owner,c.id,ends,starts))throw new UserError('Psikologun veya danisanin bu saatte randevusu var.');
      const id=Number(this.run('INSERT INTO appointments(guild,case_id,staff,starts,ends,request) VALUES(?,?,?,?,?,?)',a.guild,caseId,c.owner,starts,ends,request).lastInsertRowid);
      this.audit(a,'appointment.add',String(id));return this.get<Appointment>('SELECT * FROM appointments WHERE guild=? AND id=?',a.guild,id)!;
    });
  }
  appointmentState(a: Actor,id: number,state: string) {
    requireJob(a,'psychologist','reception');if(!['completed','cancelled','missed'].includes(state))throw new UserError('Durum gecersiz.');
    const row=this.get<Appointment>('SELECT * FROM appointments WHERE guild=? AND id=?',a.guild,id);if(!row)throw new UserError('Randevu bulunamadi.');
    if(!a.jobs.includes('manager')&&!a.jobs.includes('reception')&&row.staff!==a.id)throw new UserError('Randevu sana ait degil.');
    if(row.state===state)return;if(!['scheduled','needs_review'].includes(row.state))throw new UserError('Randevu zaten kapatilmis.');
    this.tx(()=>{this.run('UPDATE appointments SET state=? WHERE guild=? AND id=?',state,a.guild,id);this.audit(a,`appointment.${state}`,String(id));});
  }
  shift(a: Actor,start: boolean) {
    requireJob(a,'psychologist','reception','finance');
    return this.tx(()=>{
      const row=this.get<{id:number;starts:number}>('SELECT * FROM shifts WHERE guild=? AND staff=? AND ends IS NULL',a.guild,a.id);
      if(start){if(row)throw new UserError('Mesain zaten acik.');this.run('INSERT INTO shifts(guild,staff,starts) VALUES(?,?,?)',a.guild,a.id,Date.now());}
      else {if(!row)throw new UserError('Acik mesain yok.');this.run('UPDATE shifts SET ends=? WHERE id=?',Date.now(),row.id);}
      this.audit(a,start?'shift.start':'shift.end',a.id);
    });
  }
  async backup(path: string) { mkdirSync(dirname(path),{recursive:true});if(diskAvailable(dirname(path))<200*1024*1024)throw new Error('Yedek icin disk alani yetersiz.');await backup(this.db,path);inspectBackup(path); }
  close() { this.db.close(); }
}
