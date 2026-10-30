import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const path=join(tmpdir(),`patrica-quiz-test-${process.pid}.json`);
const make=(levels:('Kolay'|'Orta'|'Zor')[])=>levels.map((level,index)=>({level,prompt:`Test senaryosu ${index+1} icin uygun davranis nedir?`,options:['Dogru test davranisi','Yanlis test davranisi','Eksik test davranisi','Gecersiz test davranisi'] as [string,string,string,string],correct:0}));
writeFileSync(path,JSON.stringify({reception:make(['Kolay','Kolay','Orta','Orta','Zor']),psychologist:make(['Kolay','Kolay','Kolay','Kolay','Kolay','Orta','Orta','Orta','Zor','Zor']),finance:make(['Kolay','Kolay','Kolay','Kolay','Kolay','Orta','Orta','Orta','Zor','Zor'])}));
process.env.APPLICATION_QUESTIONS_PATH=path;
process.on('exit',()=>unlinkSync(path));
