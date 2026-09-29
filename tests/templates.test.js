import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {renderTemplate,esc} from '../web/js/ui.js';

test('real HTML templates load, render every field and preserve escaping',async()=>{
  const previous=globalThis.document, previousTemplate=globalThis.HTMLTemplateElement;
  const source=await readFile("web/index.html","utf8");
  const templates=[...source.matchAll(/<template\s+id="([^"]+)"\s*>([\s\S]*?)<\/template\s*>/g)];
  class Template { constructor(innerHTML){this.innerHTML=innerHTML;} }
  globalThis.HTMLTemplateElement=Template;
  globalThis.document={getElementById: id => {const match=templates.find(m=>m[1]===id);return match?new Template(match[2]):null;}};
  try{
    let count=0;
    {
      const ids=new Set();
      for(const match of source.matchAll(/<template\s+id="([^"]+)"\s*>([\s\S]*?)<\/template\s*>/g)){
        assert.ok(!ids.has(match[1]),'Duplicate template ID: '+match[1]);ids.add(match[1]);
        const values=Object.fromEntries([...match[2].matchAll(/{{(\w+)}}/g)].map(m=>[m[1],esc('<script>unsafe</script>')]));
        const html=renderTemplate(match[1],values);
        assert.ok(!html.includes('<script>'));assert.ok(!/{{\w+}}/.test(html));count++;
      }
    }
    assert.ok(count>30);assert.throws(()=>renderTemplate('missing.template'),/Template não carregado/);
    assert.throws(()=>renderTemplate('auth.form'),/Campo ausente/);
  }finally{globalThis.document=previous;globalThis.HTMLTemplateElement=previousTemplate;}
});

test('frontend relative imports and local HTML assets resolve after the move',async()=>{
 for(const folder of ['web/js','web/assets'])for(const file of await readdir(folder)){
   if(!file.endsWith('.js'))continue;const full=resolve(folder,file),source=await readFile(full,'utf8');
   for(const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g))assert.ok((await stat(resolve(dirname(full),match[1]))).isFile());
 }
 for(const file of ['web/index.html']){
   const source=await readFile(file,'utf8');for(const match of source.matchAll(/(?:src|href)="((?:\/assets\/|\.\/css\/|\.\/js\/)[^"]+)"/g))assert.ok((await stat(resolve('web',match[1].replace(/^\//,'')))).isFile());
 }
});
