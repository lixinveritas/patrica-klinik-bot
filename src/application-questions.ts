import { readFileSync } from 'node:fs';

export type ApplicationJob='reception'|'psychologist'|'finance';
export interface Question {level:'Kolay'|'Orta'|'Zor';prompt:string;options:[string,string,string,string];correct:number;}
export const jobName:Record<ApplicationJob,string>={psychologist:'Psikolog',reception:'Resepsiyon',finance:'Finans ve Insan Kaynaklari'};

const path=process.env.APPLICATION_QUESTIONS_PATH??new URL('../../data/application-questions.json',import.meta.url);
export const questions=JSON.parse(readFileSync(path,'utf8')) as Record<ApplicationJob,Question[]>;
for(const [job,expected] of [['reception',5],['psychologist',10],['finance',10]] as const){
  const set=questions[job];
  if(!Array.isArray(set)||set.length!==expected||set.some(q=>!['Kolay','Orta','Zor'].includes(q.level)||typeof q.prompt!=='string'||q.prompt.length<10||!Array.isArray(q.options)||q.options.length!==4||q.options.some(x=>typeof x!=='string'||x.length<2)||!Number.isInteger(q.correct)||q.correct<0||q.correct>3))throw new Error(`Sinav soru bankasi gecersiz: ${job}`);
  const levels=set.reduce((counts,q)=>(counts[q.level]++,counts),{Kolay:0,Orta:0,Zor:0});
  if(levels.Kolay!==(job==='reception'?2:5)||levels.Orta!==(job==='reception'?2:3)||levels.Zor!==(job==='reception'?1:2))throw new Error(`Sinav zorlugu gecersiz: ${job}`);
}
