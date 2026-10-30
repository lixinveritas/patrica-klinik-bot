import {spawn} from 'node:child_process';
import {openSync,closeSync,readFileSync,writeFileSync,existsSync,unlinkSync,statSync,renameSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=new URL('../data/',import.meta.url),lock=new URL('supervisor.lock',data);
mkdirSync(data,{recursive:true});
try{const fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);}catch{throw new Error('Surec gozetimi zaten acik veya kilit kontrol edilmeli.');}
writeFileSync(new URL('supervisor.pid',data),String(process.pid));
let stopping=false,child,failures=0;
const release=()=>{if(existsSync(lock)&&readFileSync(lock,'utf8')===String(process.pid))unlinkSync(lock);};
const stop=()=>{stopping=true;if(child)child.kill();release();};
process.on('exit',release);
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});
while(!stopping){
 if(existsSync(new URL('bot.lock',data)))throw new Error('Bot kilidi var. Calisan kopya kontrol edilmeden baslatilmaz.');
 const log=new URL('runtime.log',data);if(existsSync(log)&&statSync(log).size>10*1024*1024)renameSync(log,new URL(`runtime-${Date.now()}.log`,data));
 const fd=openSync(log,'a');const started=Date.now();
 child=spawn(process.execPath,['--env-file=.env','dist/src/main.js'],{cwd:root,windowsHide:true,stdio:['ignore',fd,fd]});closeSync(fd);
 writeFileSync(new URL('runtime.pid',data),String(child.pid));
 const watch=setInterval(()=>{try{const h=JSON.parse(readFileSync(new URL('health.json',data),'utf8'));if(h.pid===child.pid&&Date.now()-h.at>180000)child.kill();}catch{if(Date.now()-started>180000)child.kill();}},30000);
 await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});clearInterval(watch);
 if(existsSync(new URL('bot.lock',data))){if(readFileSync(new URL('bot.lock',data),'utf8')!==String(child.pid))throw new Error('Bot kilidi baska surece ait; gozetim durduruldu.');unlinkSync(new URL('bot.lock',data));}
 if(Date.now()-started>300000)failures=0;
 if(!stopping)await new Promise(r=>setTimeout(r,Math.min(60000,2000*2**Math.min(++failures,5))));
}
