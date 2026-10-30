import { createHash } from 'node:crypto';
import type { MessageCreateOptions, TextChannel, ThreadChannel } from 'discord.js';
import { Store } from './store.js';

export class DeliveryUncertain extends Error { constructor(){super('Bildirim sonucu belirsiz; yonetim kontrolu gerekli.');this.name='DeliveryUncertain';} }
const active=new WeakMap<Store,Map<string,Promise<unknown>>>();
export async function deliver(s:Store,guild:string,key:string,channel:TextChannel|ThreadChannel,payload:MessageCreateOptions) {
  let jobs=active.get(s);if(!jobs){jobs=new Map();active.set(s,jobs);}
  const lock=`${guild}:${key}`;const prior=jobs.get(lock);
  const task=(prior??Promise.resolve()).catch(()=>{}).then(()=>send(s,guild,key,channel,payload));jobs.set(lock,task);
  try{return await task;}finally{if(jobs.get(lock)===task)jobs.delete(lock);}
}
async function send(s:Store,guild:string,key:string,channel:TextChannel|ThreadChannel,payload:MessageCreateOptions) {
  const saved=s.resource(guild,key);
  if(saved) {
    try {const old=await channel.messages.fetch(saved);await old.edit({content:payload.content,embeds:payload.embeds,files:payload.files,components:payload.components,allowedMentions:{parse:[]},attachments:[]});return old;}
    catch(e){if(!(e&&typeof e==='object'&&'code' in e&&e.code===10008))throw e;}
  }
  const attemptKey=`send:${key}`;const prior=s.resource(guild,attemptKey);
  const started=prior?Number(prior):Date.now();
  // Discord nonce deduplication is short-lived; old uncertain sends require review.
  if(prior&&Date.now()-started>120000)throw new DeliveryUncertain();
  s.setResource(guild,attemptKey,String(started));
  const nonce=createHash('sha256').update(`${guild}:${key}:${started}`).digest('hex').slice(0,24);
  const sent=await channel.send({...payload,nonce,enforceNonce:true,allowedMentions:{parse:[]}});
  s.tx(()=>{s.setResource(guild,key,sent.id);s.run('DELETE FROM resources WHERE guild=? AND key=?',guild,attemptKey);});return sent;
}

export function auditBatches<T>(rows:T[],line:(r:T)=>string,limit=1900):T[][] {
  const batches:T[][]=[];let current:T[]=[];let size=0;
  for(const row of rows){const length=line(row).length+1;if(length>limit)throw new Error('Audit olayi siniri asti.');if(size+length>limit){batches.push(current);current=[];size=0;}current.push(row);size+=length;}
  if(current.length)batches.push(current);return batches;
}
export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const recordHtml=(title:string,body:string)=>`<!doctype html><html lang="tr"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(title)}</title><style>body{max-width:860px;margin:48px auto;padding:24px;font:16px system-ui;background:#f6f7fb;color:#17213b}pre{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}</style><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(body)}</pre></html>`;
