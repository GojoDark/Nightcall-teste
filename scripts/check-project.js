import {readdir,readFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
// Verificação básica antes de compartilhar. Não substitui uma auditoria de segurança.
const ignored=new Set(['.git','node_modules','dist','data','test-results','test-evidence','tools']);
const checks=[
  ['GitHub token',/gh[pousr]_[A-Za-z0-9]{30,}/],
  ['GitHub fine-grained token',/github_pat_[A-Za-z0-9_]{40,}/],
  ['AWS access key',/AKIA[0-9A-Z]{16}/],
  ['Private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['URL with credentials',/https?:\/\/[^\s/:]+:[^\s/@]+@/],
];
let scanned=0;const findings=[];
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){
 if(ignored.has(item.name)||item.name==='.env'||item.name.startsWith('.env.')&&item.name!=='.env.example')continue;
 const file=join(dir,item.name);if(item.isDirectory()){await walk(file);continue;}
 if(!['.js','.mjs','.json','.md','.html','.css','.yml','.yaml','.ps1','.bat','.example'].includes(extname(file)))continue;
 const text=await readFile(file,'utf8');scanned++;for(const [kind,pattern]of checks)if(pattern.test(text))findings.push({file,kind});
}}
await walk('.');
if(findings.length){for(const item of findings)console.error(item.file+': '+item.kind);process.exitCode=1;}
else console.log(`Project scan PASS: ${scanned} text files; no recognized credential patterns. Local data and .env are excluded by design.`);
