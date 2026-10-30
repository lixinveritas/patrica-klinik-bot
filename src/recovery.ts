import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, constants, statfsSync } from 'node:fs';
import { resolve } from 'node:path';

export function diskAvailable(path:string) {const fs=statfsSync(path);return fs.bavail*fs.bsize;}
export function inspectBackup(path:string) {
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Yedek butunlugu gecersiz.');
    const mismatch=db.prepare(`SELECT COUNT(*) n FROM cash c LEFT JOIN ledger l ON l.cash_id=c.id WHERE (c.state='approved' AND (l.id IS NULL OR l.guild!=c.guild OR l.signed_amount!=CASE WHEN c.kind='income' THEN c.amount ELSE -c.amount END)) OR (c.state!='approved' AND l.id IS NOT NULL)`).get();
    if(Number(mismatch?.n))throw new Error('Yedek kasa defteri uyusmuyor.');
    const existing=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));
    if(existing.has('cash_evidence')&&Number(db.prepare('SELECT COUNT(*) n FROM cash_evidence WHERE length(data)=0 OR length(data)>4194304').get()?.n))throw new Error('Yedek kanit verisi gecersiz.');
    const tables=['cases','visits','cash','ledger','resources','appointments','applications','shifts','audit'];
    const optional=['cash_evidence','outbox','tariffs','reconciliations','custody'];
    return Object.fromEntries([...tables,...optional].map(table=>[table,optional.includes(table)&&!existing.has(table)?0:Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n)]));
  } finally {db.close();}
}
export function restoreBackup(source:string,target:string) {
  if(resolve(source)===resolve(target))throw new Error('Kaynak ve hedef ayni olamaz.');
  const counts=inspectBackup(source);copyFileSync(source,target,constants.COPYFILE_EXCL);
  inspectBackup(target);return counts;
}
