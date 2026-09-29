import assert from 'node:assert/strict';
import {startServer,client} from './server-helper.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer();let browser;
try {
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const noJs=await browser.newContext({javaScriptEnabled:false}); const source=await noJs.newPage(); await source.goto(server.url);
 for(const selector of ['.app-shell','.rail','.context-sidebar','.mobile-topbar','#content','[data-page="home.home-home-page"]','[data-page="friends.friends-friends-page"]','[data-page="messages.chat"]','[data-page="settings.settings-settings-page"]','[data-page="profile.profile-profile-page"]','[data-page="profile.open-user-profile-profile-page"]','#persistent-call','#incoming-call','#space-modal','#notification-panel'])assert.equal(await source.locator(selector).count(),1,selector+' exists without JS');
 await noJs.close();
 const page=await browser.newPage();const errors=[],templateRequests=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('request',r=>{if(r.url().includes('/templates/'))templateRequests.push(r.url());});await page.route('**/templates/**',route=>route.abort());
 const api=client(server.url); await api('/api/auth/register',{username:'structure',displayName:'Structure',email:'structure@example.test',password:'Nightcall123!'});
 await page.goto(server.url);await page.locator('#auth-form').waitFor();
 await page.evaluate(()=>{window.originalShell=document.querySelector('.app-shell');window.originalCall=document.getElementById('persistent-call');});
 for(let run=0;run<2;run++){
  await page.locator('[name=login]').fill('structure');await page.locator('[name=password]').fill('Nightcall123!');await page.locator('#auth-form button').click();await page.locator('.home-page').waitFor({timeout:8000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
  await page.evaluate(()=>{window.originalHome??=document.querySelector('.home-page');});
  await page.locator('[data-sec=friends]').click();await page.locator('#add-form').waitFor();await page.locator('[data-sec=home]').click();await page.locator('.home-page').waitFor({timeout:8000}).catch(async e=>{console.log(await page.locator('body').innerText());throw e;});
  assert.ok(await page.evaluate(()=>originalHome===document.querySelector('.home-page')&&originalShell===document.querySelector('.app-shell')&&originalCall===document.getElementById('persistent-call')));
  await page.locator('#settings-rail').click();await page.locator('#settings-logout').click();await page.locator('#auth-form').waitFor();
 }
 assert.deepEqual(templateRequests,[]);assert.deepEqual(errors,[]);console.log('Static document PASS: structure without JS, no template fetch, preserved node identity, repeated login/logout.');
}finally{await browser?.close();await server.close();}
