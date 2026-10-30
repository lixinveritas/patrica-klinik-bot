import { Client, Events, GatewayIntentBits } from 'discord.js';
import { resolve } from 'node:path';
import { config } from './config.js';
import { Store } from './store.js';
import { setup } from './setup.js';
import { UserError } from './domain.js';
const c=config();const s=new Store(resolve(c.data,'patrica.sqlite'));
const client=new Client({intents:[GatewayIntentBits.Guilds],allowedMentions:{parse:[]}});
const deadline=setTimeout(()=>{console.error('Kurulum baglantisi zaman asimina ugradi.');client.destroy();s.close();process.exit(1);},45_000);
client.once(Events.ClientReady,async ready=>{
  try{
    if(ready.user.id!==c.app)throw new UserError('Uygulama kimligi eslesmiyor.');
    const guild=await ready.guilds.fetch(c.guild);
    await setup(guild,s,{id:c.owners[0]!,guild:guild.id,jobs:['manager']});
    console.log('Patrica kanal, rol, ozel ikon ve panelleri hedef sunucuda kuruldu.');
  }catch(e){console.error(e instanceof UserError?e.message:`Kurulum tamamlanamadi: ${e instanceof Error?e.name:'Error'}`);process.exitCode=1;}
  finally{clearTimeout(deadline);client.destroy();s.close();}
});
client.on(Events.Error,()=>console.error('Discord baglanti hatasi.'));
try{await client.login(c.token);}catch{clearTimeout(deadline);client.destroy();s.close();console.error('Kurulum icin Discord girisi basarisiz.');process.exitCode=1;}
