import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const pidPath=new URL('../data/runtime.pid',import.meta.url);
const supervisorPath=new URL('../data/supervisor.pid',import.meta.url);
if(existsSync(supervisorPath)) {
 const supervisor=Number(readFileSync(supervisorPath,'utf8'));
 if(!Number.isSafeInteger(supervisor)||supervisor<1)throw new Error('Gozetim PID gecersiz.');
 let alive=true;try{process.kill(supervisor,0);}catch{alive=false;}
 if(alive){
  const shell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const info=JSON.parse(execFileSync(shell,['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId = ${supervisor}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));
  if(info.ExecutablePath?.toLowerCase()!==process.execPath.toLowerCase()||!info.CommandLine?.includes('scripts/supervise.mjs'))throw new Error('Gozetim sureci eslesmiyor.');
  process.kill(supervisor,'SIGTERM');
  for(let n=0;n<25;n++){try{process.kill(supervisor,0);await new Promise(r=>setTimeout(r,200));}catch{alive=false;break;}}
  if(alive)throw new Error('Gozetim kapanmadi.');
 }
 const lock=new URL('../data/supervisor.lock',import.meta.url);if(existsSync(lock)){if(readFileSync(lock,'utf8')!==String(supervisor))throw new Error('Gozetim kilit sahibi eslesmiyor.');unlinkSync(lock);}
}
if(existsSync(pidPath)) {
 const pid=Number(readFileSync(pidPath,'utf8'));if(!Number.isSafeInteger(pid)||pid<1)throw new Error('PID kaydi gecersiz.');
 let alive=true;try{process.kill(pid,0);}catch{alive=false;}
 if(alive) {
  if(process.platform!=='win32')throw new Error('Bu yeniden baslatma kontrolu Windows icindir.');
  const shell=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  const raw=execFileSync(shell,['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ExecutablePath,CommandLine | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true});
  const info=JSON.parse(raw);
  if(info.ExecutablePath?.toLowerCase()!==process.execPath.toLowerCase()||!info.CommandLine?.includes('dist/src/main.js')||!info.CommandLine?.includes('--env-file=.env'))throw new Error('Kayitli surec Patrica botuyla eslesmiyor.');
  process.kill(pid,'SIGTERM');
  for(let count=0;count<25;count++) {try{process.kill(pid,0);await new Promise(r=>setTimeout(r,200));}catch{alive=false;break;}}
  if(alive)throw new Error('Eski surec kapanmadi; yeni bot baslatilmadi.');
 }
 const lock=new URL('../data/bot.lock',import.meta.url);if(existsSync(lock)){const owner=readFileSync(lock,'utf8').trim();if(owner&&owner!==String(pid))throw new Error('Bot kilit sahibi eslesmiyor.');unlinkSync(lock);}
}
await import('./launch.mjs');
