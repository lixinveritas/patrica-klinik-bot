import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { command, invitePermissions } from './commands.js';
const c=config();const rest=new REST({version:'10'}).setToken(c.token);
const app=await rest.get(Routes.oauth2CurrentApplication()) as {id:string};
if(app.id!==c.app)throw new Error('Token ve APPLICATION_ID eslesmiyor.');
await rest.put(Routes.applicationGuildCommands(c.app,c.guild),{body:[command.toJSON()]});
console.log('Yalniz hedef sunucuda /klinik kaydedildi.');
console.log(`Davet: https://discord.com/oauth2/authorize?client_id=${c.app}&scope=bot%20applications.commands&permissions=${invitePermissions}`);
