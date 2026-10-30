import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { Store } from './store.js';
const data=resolve(process.env.DATA_DIR||'./data');const path=resolve(data,'patrica.sqlite');
if(!existsSync(path))throw new Error('Veritabani yok. Bos kasa yedegi olusturulmadi.');
const s=new Store(path);
try {const dest=resolve(data,'backups',`${new Date().toISOString().replaceAll(':','-')}.sqlite`);await s.backup(dest);console.log('Tutarlı SQLite yedegi olusturuldu.');}finally{s.close();}
