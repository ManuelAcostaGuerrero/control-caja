import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const envPath=path.join(root,'server','.env');
const clientEnv=path.join(root,'client','.env');
const action=process.argv[2]||'check';
if(action==='configure'){
  if(!fs.existsSync(envPath)) fs.copyFileSync(path.join(root,'server','.env.example'),envPath);
  if(!fs.existsSync(clientEnv)) fs.copyFileSync(path.join(root,'client','.env.example'),clientEnv);
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  console.log('Configuración local preparada.'); process.exit(0);
}
if(!fs.existsSync(envPath)) throw new Error('Falta server/.env. Ejecuta Preparar.bat.');
const env=Object.fromEntries(fs.readFileSync(envPath,'utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]}));
const dbPath=path.resolve(path.dirname(envPath),env.SQLITE_PATH||'../data/control-caja.db');
if(!fs.existsSync(dbPath)){console.log('Base aún no creada.'); process.exit(0)}
const db=new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout=5000');
const integrity=db.prepare('PRAGMA integrity_check').all();
if(!integrity.every(x=>Object.values(x)[0]==='ok')) throw new Error('SQLite no pasó integrity_check.');
if(action==='checkpoint') db.exec('PRAGMA wal_checkpoint(FULL)');
if(action==='backup'){
  const destination=process.argv[3]; if(!destination) throw new Error('Falta carpeta de respaldo.');
  fs.mkdirSync(destination,{recursive:true});
  const target=path.join(destination,'control-caja.db');
  const sqlTarget=target.replaceAll("'","''"); db.exec(`VACUUM INTO '${sqlTarget}'`);
  const copy=new DatabaseSync(target); const check=copy.prepare('PRAGMA integrity_check').all(); copy.close();
  if(!check.every(x=>Object.values(x)[0]==='ok')) throw new Error('El respaldo SQLite no pasó integridad.');
  fs.writeFileSync(path.join(destination,'database-path.txt'),dbPath+'\n');
  console.log(`SQLite respaldada: ${target}`);
}
db.close(); console.log(`SQLite correcta: ${dbPath}`);
