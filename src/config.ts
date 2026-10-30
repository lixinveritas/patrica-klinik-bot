import { resolve } from 'node:path';
import { snowflake, UserError } from './domain.js';

export function config(env:NodeJS.ProcessEnv=process.env) {
  const token=env.DISCORD_TOKEN?.trim();if(!token)throw new UserError('DISCORD_TOKEN ayarlanmamis. .env.example dosyasini kullan.');
  const app=snowflake(env.APPLICATION_ID??'');const guild=snowflake(env.GUILD_ID??'');
  const owners=(env.OWNER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean).map(snowflake);
  if(!owners.length)throw new UserError('En az bir OWNER_IDS gerekli.');
  return {token,app,guild,owners,data:resolve(env.DATA_DIR||'./data')};
}
export type Config=ReturnType<typeof config>;
