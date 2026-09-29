import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncEngine} from '../web/js/synchronization.js';
test('one scheduler skips an in-flight job and removes listeners on stop',async()=>{
  const listeners=new Set();
  globalThis.addEventListener=(name,fn)=>listeners.add(name);
  globalThis.removeEventListener=(name,fn)=>listeners.delete(name);
  globalThis.document={addEventListener:globalThis.addEventListener,removeEventListener:globalThis.removeEventListener};
  let resolve,count=0;const engine=new SyncEngine();
  engine.add('sync',300,()=>{count++;return new Promise(r=>resolve=r);});
  try{
    engine.start();engine.start();await Promise.resolve();assert.equal(count,1);assert.equal(listeners.size,2);
    engine.kick('sync');engine.wake();await Promise.resolve();assert.equal(count,1);
    resolve();await new Promise(r=>setImmediate(r));engine.kick('sync');await Promise.resolve();assert.equal(count,2);
    engine.stop();resolve();await new Promise(r=>setImmediate(r));assert.equal(listeners.size,0);assert.equal(engine.jobs.size,0);
    engine.tick();assert.equal(count,2);
  }finally{engine.stop();delete globalThis.document;delete globalThis.addEventListener;delete globalThis.removeEventListener;}
});
