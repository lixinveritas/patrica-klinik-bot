import { existsSync } from 'node:fs';
import { Store } from './store.js';
const db=new Store(':memory:');const ok=db.get<{integrity_check:string}>('PRAGMA integrity_check')?.integrity_check==='ok';db.close();
console.log(`Node: ${process.versions.node}`);
console.log(`SQLite: ${ok?'hazir':'hata'}`);
console.log(`Ayar dosyasi: ${existsSync('.env')?'var; degerler yazdirilmadi':'yok; .env.example kopyalanmali'}`);
console.log(`Ikonlar: ${existsSync('assets/receipt.png')?'yerelde hazir':'npm run assets gerekli'}`);
console.log('Bu kontrol Discord baglantisi veya FiveM odemesi dogrulamasi yapmaz.');
if(!ok)process.exitCode=1;
