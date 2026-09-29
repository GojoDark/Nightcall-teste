import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {startServer,client} from './server-helper.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer();let browser,page;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--disable-gpu']});
 page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url);await page.locator('#switch').click();
 for(const [name,value]of Object.entries({displayName:'Victor Teste',username:'victortest',email:'victor@example.test',password:'Nightcall123!'}))await page.locator(`[name=${name}]`).fill(value);
 await page.locator('#auth-form button').click();await page.locator('.home-page').waitFor();
 assert.equal(await page.locator('.brand-logo').first().evaluate(img=>img.complete&&img.naturalWidth>0),true);
 await page.reload();await page.locator('.home-page').waitFor();
 const b=client(server.url);const bob=await b('/api/auth/register',{displayName:'Gabrielly Teste',username:'gabriellytest',email:'gabrielly@example.test',password:'Nightcall123!'});
 await b('/api/friends/request',{username:'victortest'});
 await page.waitForFunction(()=>document.querySelector('#pending-badge')?.textContent==='1');
 await page.locator('.desktop-notifications').click();await page.locator('#notification-panel').waitFor();await page.locator('#notification-panel header button').click();
 await page.locator('[data-sec=friends]').click();await page.locator('[data-tab=pending]').click();await page.locator('[data-accept]').click();
 await page.locator('[data-tab=all]').click();await page.locator('[data-message]').click();await page.locator('#message-input').fill('Mensagem pela interface');await page.locator('#composer button').click();await page.locator('.message p').filter({hasText:'Mensagem pela interface'}).waitFor();
 // A referência ao perfil deve continuar válida após inicializar os módulos.
 await page.locator('.message .avatar-profile').first().click();await page.locator('#edit-own-profile').click();await page.locator('[name=bio]').fill('Editado após separar os módulos');await page.locator('#profile-form button.primary').click();await page.locator('.toast').filter({hasText:'Perfil salvo.'}).waitFor();
 await page.locator('#settings-dock').click();await page.locator('#settings-logout').click();await page.locator('#auth-form').waitFor();
 await page.locator('[name=login]').fill('victortest');await page.locator('[name=password]').fill('wrong-password');await page.locator('#auth-form button').click();await page.locator('#form-error:not([hidden])').waitFor();
 await page.locator('[name=password]').fill('Nightcall123!');await page.locator('#auth-form button').click();await page.locator('.home-page').waitFor();
 await page.locator('[data-sec=messages]').click();await page.locator('.message-directory-row').first().click();await page.locator('.message p').filter({hasText:'Mensagem pela interface'}).waitFor();
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/refactor-chat.png'});
 const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(img=>!img.complete||!img.naturalWidth).map(img=>img.src));assert.deepEqual(broken,[]);assert.deepEqual(errors,[]);
 console.log('Auth/UI regression PASS: real registration/login/session/logout, invalid password, friendship acceptance, message, profile avatar callback, notification panel and images.');
}catch(error){console.log('UI errors',errors);console.log(await page?.locator('body').innerText());throw error;}finally{await browser?.close();await server.close();}
