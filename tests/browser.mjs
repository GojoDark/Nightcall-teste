// Optional real Chromium regression. npm install --no-save playwright, or set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {startServer,client} from './server-helper.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await startServer();let browser;
const errors=[],pages=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--disable-gpu','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  const a=client(server.url),b=client(server.url);
  const aa=await a('/api/auth/register',{username:'alice',displayName:'Alice',email:'alice@example.test',password:'Nightcall123!'});
  const bb=await b('/api/auth/register',{username:'bob',displayName:'Bob',email:'bob@example.test',password:'Nightcall123!'});
  await a('/api/friends/request',{username:'bob'});const f=await b('/api/friends');await b(`/api/friends/${f.friends[0].friendshipId}/accept`,{});
  const sp=(await a('/api/spaces',{name:'Comunidade de teste com nome longo'})).space,invite=await a(`/api/spaces/${sp.spaceId}/invite`,{});await b('/api/spaces/join',{token:invite.token});
  const detail=await a('/api/spaces/'+sp.spaceId),voice=detail.channels.find(c=>c.type==='voice'),text=detail.channels.find(c=>c.type==='text');
  for(const name of ['alice','bob']){
    const context=await browser.newContext({permissions:['microphone','camera'],viewport:{width:1440,height:1000}});const page=await context.newPage();pages.push(page);
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto(server.url);
    await page.evaluate(async name=>{await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:name,password:'Nightcall123!'})});},name);
    await page.reload();await page.locator('#home-btn').waitFor();
    await page.evaluate(async()=>{
      const {CallManager}=await import('/js/call-manager.js');const enter=CallManager.prototype.enter;
      CallManager.prototype.enter=function(...args){window.testManager=this;return enter.apply(this,args);};
      window.mediaLog=[];const toggle=CallManager.prototype.toggleMedia,set=CallManager.prototype.setMedia;
      CallManager.prototype.toggleMedia=function(kind){mediaLog.push(['toggle',kind,!!this.streams[kind]]);return toggle.call(this,kind);};
      CallManager.prototype.setMedia=function(kind,stream){mediaLog.push(['set',kind,!!stream]);return set.call(this,kind,stream);};
      // Synthetic screen only: no claim about the browser's real capture picker.
      navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let n=0;const timer=setInterval(()=>{ctx.fillStyle=n++%2?'#dd3366':'#4466cc';ctx.fillRect(0,0,640,360);ctx.fillStyle='white';ctx.fillText('Screen '+n,30,30);},100);const stream=canvas.captureStream(10);const audioContext=new AudioContext(),osc=audioContext.createOscillator(),destination=audioContext.createMediaStreamDestination();osc.connect(destination);osc.start();stream.addTrack(destination.stream.getAudioTracks()[0]);stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;};
    });
  }
  const [pa,pb]=pages;
  const waitConnected=page=>page.waitForFunction(()=>window.testManager?.peers.size>0&&[...window.testManager.peers.values()].every(p=>p.pc.connectionState==='connected'),{},{timeout:20000});
  const stats=page=>page.evaluate(async()=>{const out=[];for(const p of window.testManager.peers.values())for(const r of (await p.pc.getStats()).values())if(r.type==='inbound-rtp')out.push({kind:r.kind,packets:r.packetsReceived,frames:r.framesDecoded,codec:r.codecId});return out;});
  async function exercise(kind){
    await Promise.all(pages.map(waitConnected));
    await pa.waitForFunction(()=>document.querySelector('audio')?.srcObject?.getAudioTracks().length>0);
    for(const page of pages)await page.evaluate(()=>{window.savedSession=window.testManager.session;window.savedMic=window.testManager.streams.audio;window.savedPeer=[...window.testManager.peers.values()][0].pc;});
    await pa.locator('#persistent-call [data-action="mute"]').click();assert.equal(await pa.evaluate(()=>testManager.streams.audio.getAudioTracks()[0].enabled),false);
    await pa.locator('#persistent-call [data-action="deafen"]').click();assert.equal(await pa.evaluate(()=>[...testManager.peers.values()][0].audio.muted),true);
    await pa.locator('#persistent-call [data-action="deafen"]').click();await pa.locator('#persistent-call [data-action="mute"]').click();
    await pa.locator('#persistent-call [data-action="hide"]').click();
    if(kind==='voice'){await pa.locator(`[data-channel="${text.channelId}"]`).click();await pa.locator(`[data-channel="${voice.channelId}"]`).click();await pa.locator('#persistent-call [data-action="hide"]').click();}
    await pa.locator('#home-btn').click();await pa.locator('#profile-dock').click();
    await pa.locator('#edit-own-profile').click();await pa.locator('#profile-form [name="bio"]').fill('Perfil preservado durante a chamada');
    if(kind==='private')for(const field of ['#avatar-file','#banner-file'])await pa.locator(field).setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:await readFile('web/assets/images/nightcall-mark.png')});
    await pa.locator('#profile-form button.primary').click();
    await pa.waitForFunction(()=>document.querySelector('.toast')?.textContent==='Perfil salvo.');
    assert.equal(await pa.evaluate(()=>testManager.session===savedSession&&testManager.streams.audio===savedMic),true);
    await pa.locator('#settings-dock').click();await pa.locator('#test-mic').click();
    await pa.locator('#audio-settings button').click(); // default-device replacement is explicit
    assert.equal(await pa.evaluate(()=>testManager.session===savedSession&&[...testManager.peers.values()][0].pc===savedPeer),true);
    await pa.locator('#home-btn').click();await pa.locator(`[data-profile="${bb.user.accountId}"]`).first().click();await pa.locator('#profile-message').click();
    await pa.locator('#message-input').fill('Mensagem durante '+kind);await pa.locator('#composer button').click();
    await pa.locator('.message p').filter({hasText:'Mensagem durante '+kind}).waitFor();
    const dms=await b('/api/dms');assert.ok((await b(`/api/dms/${dms.conversations[0].conversationId}/messages`)).messages.some(x=>x.body==='Mensagem durante '+kind));
    await pa.locator('#session-return').click();
    await Promise.all(pages.map(page=>page.locator('#persistent-call [data-action="camera"]').click()));
    for(const page of pages)await page.waitForFunction(()=>document.querySelectorAll('#persistent-call video').length===2&&[...document.querySelectorAll('#persistent-call video')].every(v=>v.videoWidth>0&&v.readyState>=2),{},{timeout:10000});
    await Promise.all(pages.map(page=>page.locator('#persistent-call [data-action="screen"]').click()));
    for(const page of pages)await page.waitForFunction(()=>document.querySelectorAll('#persistent-call video').length===4&&[...document.querySelectorAll('#persistent-call video')].every(v=>v.videoWidth>0&&v.readyState>=2),{},{timeout:15000});
    const before=await stats(pa);await pa.waitForFunction(async()=>{for(const p of testManager.peers.values())for(const r of(await p.pc.getStats()).values())if(r.type==='inbound-rtp'&&r.kind==='audio'&&r.packetsReceived>20)return true;return false;});
    await pa.waitForFunction(async()=>{const reports=await [...testManager.peers.values()][0].pc.getStats();return [...reports.values()].filter(r=>r.type==='inbound-rtp'&&r.kind==='audio'&&r.packetsReceived>0).length===2;});assert.ok((await stats(pa)).some(r=>r.kind==='audio'&&r.packets>0));assert.equal((await stats(pa)).filter(r=>r.kind==='video'&&r.frames>0).length,2);
    assert.equal(await pa.evaluate(async()=>{const reports=await [...testManager.peers.values()][0].pc.getStats();return [...reports.values()].some(r=>r.type==='codec'&&r.mimeType==='audio/opus');}),true);
    for(const page of pages)await page.evaluate(()=>{const pc=[...testManager.peers.values()][0].pc;window.previousSdp=pc.localDescription.sdp;pc.restartIce();});
    for(const page of pages)await page.waitForFunction(()=>{const pc=[...testManager.peers.values()][0].pc;return pc.localDescription.sdp!==previousSdp&&pc.signalingState==='stable'&&pc.connectionState==='connected';});
    if(kind==='voice'){
      await pb.locator('[data-action="leave"]').click();await pa.waitForFunction(()=>testManager.peers.size===0);
      await pb.locator(`[data-channel="${voice.channelId}"]`).click();await Promise.all(pages.map(waitConnected));
      await pb.waitForFunction(()=>[...testManager.peers.values()].every(p=>p.remote.camera&&p.remote.screen)&&[...document.querySelectorAll('#persistent-call video')].filter(v=>v.videoWidth>0).length===2);
      assert.equal((await a(`/api/voice/${voice.channelId}/state`)).participants.length,2);
      await pb.locator('[data-action="camera"]').click();await pb.locator('[data-action="screen"]').click();
      for(const page of pages)await page.waitForFunction(()=>[...document.querySelectorAll('#persistent-call video')].filter(v=>v.videoWidth>0).length===4);
    }
    await pa.locator('[data-action=maximize]').click();assert.equal(await pa.locator('#persistent-call').evaluate(e=>e.classList.contains('session-maximized')),true);await pa.locator('[data-action=maximize]').click();await pa.locator('[data-action=fullscreen]').click();await pa.waitForFunction(()=>!!document.fullscreenElement);await pa.locator('[data-action=fullscreen]').click();await pa.waitForFunction(()=>!document.fullscreenElement);await pa.locator('.session-tile-actions button').first().click();await pa.locator('[data-action="grid"]').click();
    await mkdir('test-results',{recursive:true});await pa.screenshot({path:`test-results/${kind}.png`,fullPage:true});
    // Browser native API smoke: headless cannot demonstrate a visible desktop PiP window.
    const pipButton=pa.locator('.session-tile-actions button[title="Picture-in-Picture nativo"]').first();
    await pipButton.click();const pip=await pa.evaluate(()=>!!document.pictureInPictureElement);
    if(pip){await pa.locator('[data-action="hide"]').click();assert.equal(await pa.evaluate(()=>!!document.pictureInPictureElement),true);await pa.locator('#session-return').click();await pipButton.click();await pa.waitForFunction(()=>!document.pictureInPictureElement);}
    await pa.locator('[data-action="screen"]').click();await pb.waitForFunction(()=>document.querySelectorAll('#persistent-call video').length===3);assert.equal(await pa.evaluate(()=>testManager.streams.camera.getTracks()[0].readyState),'live');
    console.log(kind,JSON.stringify({stats:await stats(pa),nativePiPApi:pip}));
    await pa.locator('[data-action="leave"]').click();
    if(kind==='private')await pb.waitForFunction(()=>!testManager.session);
    else {await pb.waitForFunction(()=>testManager.peers.size===0);await pb.locator('[data-action="leave"]').click();assert.equal((await a(`/api/voice/${voice.channelId}/state`)).participants.length,0);}
  }
  for(const page of pages)await page.locator(`[data-space="${sp.spaceId}"]`).click();
  await pa.locator('#community-settings').click();
  await pa.locator('#space-icon-file').setInputFiles({name:'icon.png',mimeType:'image/png',buffer:await readFile('web/assets/images/nightcall-mark.png')});
  await pa.locator('#space-settings-form button').click();await pa.locator('.modal-backdrop:visible').waitFor({state:'hidden'});
  assert.ok((await a('/api/spaces/'+sp.spaceId)).space.iconUrl.startsWith('data:image/webp'));
  await pa.locator('#community-settings').click();await pa.locator('#space-settings-form [name="iconUrl"]').fill(server.url+'/nightcall-logo.png');await pa.locator('#space-settings-form button').click();await pa.locator('.modal-backdrop:visible').waitFor({state:'hidden'});
  await pa.locator('#community-settings').click();await pa.locator('#new-channel-form [name="name"]').fill('novo-canal');await pa.locator('#new-channel-form button').click();await pb.locator('.community-channel').filter({hasText:'novo-canal'}).waitFor();
  await pa.locator('#community-members-toggle').click();assert.equal(await pa.locator('#member-panel').isVisible(),true);await pa.locator('#close-members').click();
  await pa.screenshot({path:'test-results/community-settings.png',fullPage:true});
  for(const page of pages)await page.locator('#home-btn').click();
  await pa.locator('.call-btn').first().click();await pb.locator('[data-call-action=accept]').click();await exercise('private');
  for(const page of pages){await page.locator(`[data-space="${sp.spaceId}"]`).click();await page.locator(`[data-channel="${voice.channelId}"]`).waitFor();}
  await pa.locator(`[data-channel="${voice.channelId}"]`).click();await pb.locator(`#voice-users-${voice.channelId} .voice-side-user`).waitFor();assert.equal(await pb.evaluate(()=>testManager.session),null);
  await pb.locator(`[data-channel="${voice.channelId}"]`).click();await exercise('voice');
  await pa.locator(`[data-space="${sp.spaceId}"]`).click();await pa.locator(`[data-channel="${voice.channelId}"]`).click();
  await pa.locator('#persistent-call').waitFor({state:'visible'});
  await pa.evaluate(()=>window.logoutMic=testManager.streams.audio);
  await pa.locator('[data-action="hide"]').click();await pa.locator('#settings-dock').click();await pa.locator('#settings-logout').click();await pa.locator('#auth-form').waitFor();
  assert.equal(await pa.evaluate(()=>testManager.session===null&&logoutMic.getTracks().every(t=>t.readyState==='ended')),true);
  assert.equal((await b(`/api/voice/${voice.channelId}/state`)).participants.length,0);
  await pa.locator('#auth-form [name="login"]').fill('alice');await pa.locator('#auth-form [name="password"]').fill('Nightcall123!');await pa.locator('#auth-form button').click();await pa.locator('#home-btn').waitFor();assert.equal(await pa.locator('#persistent-call').count(),1);
  assert.deepEqual(errors,[]);console.log('Browser regression: PASS (two isolated accounts, real Chromium WebRTC, synthetic media).');
}catch(error){
  for(const page of pages)console.log('MEDIA',await page.evaluate(()=>window.mediaLog));
  for(const page of pages)console.log('DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({toasts:[...document.querySelectorAll('.toast')].map(x=>x.textContent),videos:[...document.querySelectorAll('#persistent-call video')].map(v=>({width:v.videoWidth,ready:v.readyState,tracks:v.srcObject?.getTracks().map(t=>({kind:t.kind,muted:t.muted,state:t.readyState}))})),peers:[...(window.testManager?.peers.values()||[])].map(p=>({remote:p.remote,tracks:Object.keys(p.tracks),state:p.pc.connectionState,transceivers:p.pc.getTransceivers().map(t=>({mid:t.mid,direction:t.currentDirection,sender:t.sender.track?.kind,receiver:t.receiver.track.kind}))}))}))));
  throw error;
}finally{await browser?.close();await server.close();}


