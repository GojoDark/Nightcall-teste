import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for(const root of ['server','web'])for(const file of await readdir(root,{recursive:true}))if(file.endsWith('.js')){
  const result=spawnSync(process.execPath,['--check',`${root}/${file}`],{stdio:'inherit'});
  if(result.status!==0)throw Error(`Syntax check failed: ${root}/${file}`);
}
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('server','dist/server',{recursive:true});
await cp('web','dist/web',{recursive:true});
console.log('Nightcall build: static/server source packaged in dist/.');
