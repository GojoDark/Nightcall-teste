import assert from 'node:assert/strict';
import {startServer,client} from './server-helper.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer();let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  const api=client(server.url);
  await api('/api/auth/register',{username:'layout',displayName:'Layout',email:'layout@example.test',password:'Nightcall123!'});
  for(const viewport of [{width:1440,height:912},{width:390,height:844}]) {
    const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/templates/'))requests.push(r.url());});
    async function check(selector,label){
      await page.locator(selector).waitFor();
      const box=await page.evaluate(selector=>{
        const node=document.querySelector(selector),r=node.getBoundingClientRect();
        const states=[...document.querySelector('#app').children].filter(e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0);
        const form=document.querySelector('#auth-form'),f=form.getBoundingClientRect();
        return {top:r.top,height:r.height,inside:node.parentElement.id==='app',states:states.length,scroll:document.querySelector('#app').scrollHeight,viewport:innerHeight,formVisible:f.top>=0&&f.bottom<=innerHeight};
      },selector);
      assert.ok(Math.abs(box.top)<=1,label+': top='+box.top);
      assert.equal(box.inside,true,label+': correct root');assert.equal(box.states,1,label+': single active viewport');
      assert.ok(box.scroll<=box.viewport+1,label+': no stacked viewport');
      if(selector==='.auth-page')assert.equal(box.formVisible,true,label+': form inside viewport');
      console.log(viewport.width,label,JSON.stringify(box));
    }
    await page.goto(server.url);await check('.auth-page','logged out');
    await page.reload();await check('.auth-page','logged-out refresh');
    await page.locator('[name=login]').fill('layout');await page.locator('[name=password]').fill('Nightcall123!');await page.locator('#auth-form button').click();await page.locator('.home-page').waitFor();await check('.app-shell','login');
    await page.reload();await page.locator('.home-page').waitFor();await check('.app-shell','authenticated refresh');
    if(viewport.width<760)await page.locator('#mobile-menu').click();
    await page.locator('#settings-rail').click();await page.locator('#settings-logout').click();await check('.auth-page','logout');
    await page.reload();await check('.auth-page','refresh after logout');
    assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);await context.close();
  }
  console.log('Auth layout PASS: desktop/mobile, login/logout, both refresh states, y=0, one root, zero template requests.');
} finally {await browser?.close();await server.close();}
