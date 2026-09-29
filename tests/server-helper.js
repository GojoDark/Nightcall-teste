import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
export async function startServer(env={}){
  const dir=await mkdtemp(join(tmpdir(),'nightcall-api-'));
  const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:'0',NIGHTCALL_DB:join(dir,'test.sqlite'),...env},stdio:['ignore','pipe','pipe']});
  let output='';child.stderr.on('data',b=>output+=b);
  const url=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error(output||'Server timeout')),10000);child.stdout.on('data',b=>{const match=String(b).match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timeout);resolve(match[0]);}});child.on('exit',()=>{clearTimeout(timeout);reject(Error(output));});});
  return {url,async close(){const closed=new Promise(r=>child.once('exit',r));child.kill();await closed;await rm(dir,{recursive:true,force:true});}};
}
export function client(url){let cookie='';return async(path,body,method)=>{const r=await fetch(url+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,...await r.json()};};}
