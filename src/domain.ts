import { createHash } from 'node:crypto';

export class UserError extends Error {}
export type Job = 'manager' | 'finance' | 'psychologist' | 'reception';
export interface Actor { id: string; guild: string; jobs: Job[]; }
export const PRICES = { ilk: 20_000, takip: 15_000, cift: 25_000 } as const;
export type Service = keyof typeof PRICES;
export function requireJob(a: Actor, ...jobs: Job[]) {
  if (!a.jobs.includes('manager') && !jobs.some(j => a.jobs.includes(j))) throw new UserError('Bu islem icin yetkin yok.');
}
export function text(s: string, min = 1, max = 1000): string {
  const v = s.trim();
  if (v.length < min || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new UserError(`Metin ${min}-${max} karakter olmali.`);
  return v;
}
export function line(s: string,min=1,max=160):string {
  const v=text(s,min,max);if(/[\r\n\u2028\u2029]/.test(v))throw new UserError('Bu alan tek satir olmali.');return v;
}
export function characterName(s:string):string {
  const name=line(s,3,32).replace(/ +/g,' ');
  if(!/^\p{L}+(?:[ '-]\p{L}+){1,3}$/u.test(name))throw new UserError('Karakter adi ve soyadini yaz: Mira Patrica gibi.');
  return name;
}
export function snowflake(v: string): string {
  if (!/^\d{17,20}$/.test(v)) throw new UserError('Gecerli Discord kullanici kimligi yaz.');
  return v;
}
export function money(v: string | number): number {
  if (typeof v === 'string' && !/^[1-9]\d{0,8}$/.test(v)) throw new UserError('Tutari noktasiz tam sayi yaz.');
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 99_999_999) throw new UserError('Tutar 1-99999999 arasinda tam sayi olmali.');
  return n;
}
export function service(v: string): Service {
  if (!Object.hasOwn(PRICES, v)) throw new UserError('Hizmet: ilk, takip veya cift olmali.');
  return v as Service;
}
export function proofHash(v: string) {
  return createHash('sha256').update(text(v, 20, 2000).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()).digest('hex');
}
export function localTime(v: string): number {
  const now = Date.now(), istanbul = new Date(now + 10_800_000);
  const relative = /^(bugun|yarin)\s+(\d{1,2}):(\d{2})$/i.exec(v.trim());
  const short = /^(\d{1,2})[.\/]\s*(\d{1,2})(?:[.\/]\s*(\d{4}))?\s+(\d{1,2}):(\d{2})$/.exec(v.trim());
  let canonical = v.trim();
  if (relative) {
    const day = new Date(Date.UTC(istanbul.getUTCFullYear(),istanbul.getUTCMonth(),istanbul.getUTCDate()+(relative[1]!.toLowerCase()==='yarin'?1:0)));
    canonical = `${day.toISOString().slice(0,10)} ${relative[2]!.padStart(2,'0')}:${relative[3]}`;
  } else if (short) {
    let year = short[3]?Number(short[3]):istanbul.getUTCFullYear();
    const month = Number(short[2]), day = Number(short[1]), hour = Number(short[4]), minute = Number(short[5]);
    if (!short[3] && Date.UTC(year,month-1,day,hour-3,minute)<now) year++;
    canonical = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  }
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(canonical)) throw new UserError('Tarih icin 2.11 21:30 veya yarin 21:30 yaz (Istanbul saati).');
  const n = Date.parse(canonical.replace(' ', 'T') + ':00+03:00');
  if (!Number.isFinite(n) || new Date(n + 10_800_000).toISOString().slice(0,16).replace('T',' ') !== canonical) throw new UserError('Tarih veya saat gecersiz. Ornek: 2.11 21:30');
  return n;
}
export const formatMoney = (n: number) => `${n.toLocaleString('tr-TR')}$`;
export const formatTime = (n: number) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(n);
export function visible(s: string): string { return s.replace(/[@`*_~|<>]/g, ''); }
