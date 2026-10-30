import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import sharp from 'sharp';
import { UserError } from './domain.js';

export const MAX_EVIDENCE=4*1024*1024;
export interface Upload { name:string;url:string;size:number; }
export interface Evidence { hash:string;name:string;mime:string;data:Uint8Array; }
export function discordFileUrl(raw:string):URL {
  const u=new URL(raw);
  if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||u.port||u.username||u.password||!/^\/attachments\/\d+\/\d+\/[^/]+$/.test(u.pathname))throw new UserError('Dosya baglantisi Discord eki olmali.');
  return u;
}
export async function validateEvidence(name:string,bytes:Uint8Array):Promise<Evidence> {
  if(bytes.byteLength===0||bytes.byteLength>MAX_EVIDENCE)throw new UserError('Kanit en fazla 4 MB olabilir.');
  const hash=createHash('sha256').update(bytes).digest('hex');const ext=extname(name).toLowerCase();
  if(['.txt','.log'].includes(ext)) {
    if(bytes.byteLength>256*1024)throw new UserError('Chatlog dosyasi en fazla 256 KB olabilir. Yalniz ilgili odeme satirlarini ekle.');
    let content:string;
    try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new UserError('Chatlog UTF-8 kodlamali metin dosyasi olmali.');}
    if(content.trim().length<20||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content))throw new UserError('Chatlog dosyasi gecerli duz metin icermeli.');
    return {hash,name:'chatlog.txt',mime:'text/plain',data:Buffer.from(content)};
  }
  if(!['.png','.jpg','.jpeg','.webp'].includes(ext))throw new UserError('TXT, LOG, PNG, JPG veya WEBP yukle.');
  try{
    const image=sharp(bytes,{limitInputPixels:24_000_000,failOn:'warning'});const metadata=await image.metadata();
    const expected=ext==='.png'?'png':ext==='.webp'?'webp':'jpeg';
    if(metadata.format!==expected||(metadata.pages??1)>1)throw new Error('Invalid image format');
    const data=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer();
    if(data.byteLength>MAX_EVIDENCE)throw new UserError('Gorsel cok buyuk; odeme satirlarini kirpip yeniden yukle.');
    return {hash,name:'kanit.png',mime:'image/png',data};
  }catch(e){if(e instanceof UserError)throw e;throw new UserError('Gorsel okunamadi veya dosya turu uyusmuyor.');}
}
export async function downloadEvidence(upload:Upload,fetcher:typeof fetch=fetch):Promise<Evidence> {
  if(!Number.isSafeInteger(upload.size)||upload.size<1||upload.size>MAX_EVIDENCE)throw new UserError('Kanit en fazla 4 MB olabilir.');
  const url=discordFileUrl(upload.url);
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok||!response.body)throw new UserError('Dosya indirilemedi. Formu yeniden acip dosyayi tekrar sec.');
  const length=Number(response.headers.get('content-length')||0);
  if(length>MAX_EVIDENCE){await response.body.cancel();throw new UserError('Dosya boyutu siniri asiyor.');}
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try{
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_EVIDENCE){await reader.cancel();throw new UserError('Dosya boyutu siniri asiyor.');}chunks.push(part.value);}
  }finally{reader.releaseLock();}
  if(size!==upload.size)throw new UserError('Dosya boyutu eslesmedi; tekrar yukle.');
  return validateEvidence(upload.name,Buffer.concat(chunks));
}
