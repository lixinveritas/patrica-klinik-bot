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
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v)) throw new UserError('Tarih: 2026-11-02 21:30 seklinde olmali (Istanbul).');
  const n = Date.parse(v.replace(' ', 'T') + ':00+03:00');
  if (!Number.isFinite(n) || new Date(n + 10_800_000).toISOString().slice(0,16).replace('T',' ') !== v) throw new UserError('Tarih veya saat gecersiz.');
  return n;
}
export const formatMoney = (n: number) => `${n.toLocaleString('tr-TR')}$`;
export const formatTime = (n: number) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(n);
export function visible(s: string): string { return s.replace(/[@`*_~|<>]/g, ''); }
