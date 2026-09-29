import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'nightcall-tests-'));
let code=0;
try{for(const args of [['server/smoke.js'],['--test','tests/call-manager.test.js','tests/api.test.js','tests/private-calls.test.js','tests/sync-engine.test.js','tests/sync-data.test.js','tests/templates.test.js']]){
  const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,NIGHTCALL_DB:join(dir,'smoke.sqlite')}});if(r.status!==0){code=r.status||1;break;}
}}finally{rmSync(dir,{recursive:true,force:true});}
process.exitCode=code;
