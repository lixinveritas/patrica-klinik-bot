import { restoreBackup } from './recovery.js';
const [source,target]=process.argv.slice(2);
if(!source||!target)throw new Error('Kullanim: npm run restore -- yedek.sqlite yeni-hedef.sqlite. Var olan hedefe yazilmaz.');
const counts=restoreBackup(source,target);console.log(JSON.stringify({restored:true,counts}));
