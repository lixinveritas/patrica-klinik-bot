import {spawnSync} from 'node:child_process';
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Git kontrolu basarisiz.');return r.stdout;};
const files=git(['ls-files','-z']).split('\0').filter(Boolean);
for(const local of ['AGENTS.md','README.md','SECURITY.md'])if(files.includes(local))throw new Error(`Yalniz yerelde tutulmali: ${local}`);
const token=process.env.DISCORD_TOKEN;
for(const path of files){
 if(/(^|\/)(data|backups|node_modules|dist)(\/|$)|(^|\/)\.env(\.|$)(?!example$)|\.(sqlite(?:-wal|-shm)?|db|log|pid|lock)$/i.test(path)&&path!=='package-lock.json')throw new Error(`Yayina uygun olmayan dosya: ${path}`);
 const blob=spawnSync('git',['show',`:${path}`],{windowsHide:true});if(blob.status!==0)throw new Error(`Git icerigi okunamadi: ${path}`);
 const bytes=blob.stdout;const text=bytes.toString('utf8');
 if(token&&bytes.includes(Buffer.from(token)))throw new Error(`Gizli deger bulundu: ${path}`);
 if(/(?:mfa\.[\w-]{40,}|[\w-]{23,28}\.[\w-]{6}\.[\w-]{27,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/.test(text))throw new Error(`Olası kimlik bilgisi: ${path}`);
}
for(const path of ['.env','data/patrica.sqlite']){const r=spawnSync('git',['check-ignore','-q',path],{windowsHide:true});if(r.status!==0)throw new Error(`Ignore kurali eksik: ${path}`);}
console.log(`${files.length} takip edilen dosya kontrol edildi; kimlik bilgisi veya canli veri bulunmadi.`);
