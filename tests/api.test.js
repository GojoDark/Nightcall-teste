import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,client} from './server-helper.js';
test('HTTP regression: auth, friends, profiles, DM, communities, presence and signaling',async()=>{
  const server=await startServer();try{
    const a=client(server.url),b=client(server.url),c=client(server.url);
    const register=(call,name)=>call('/api/auth/register',{username:name,displayName:name,email:name+'@example.test',password:'Nightcall123!'});
    const aa=await register(a,'alice'),bb=await register(b,'bob');await register(c,'outsider');assert.equal(aa.status,201);assert.equal((await a('/api/auth/me')).user.accountId,aa.user.accountId);
    assert.equal((await a('/api/friends/request',{username:'bob'})).status,201);const f=await b('/api/friends');await b(`/api/friends/${f.friends[0].friendshipId}/accept`,{});
    const dm=await a('/api/dms',{accountId:bb.user.accountId});await a(`/api/dms/${dm.conversationId}/messages`,{body:'hello'});assert.equal((await b(`/api/dms/${dm.conversationId}/messages`)).messages[0].body,'hello');
    const image='data:image/png;base64,iVBORw0KGgo=';await a('/api/profile/me',{displayName:'Alice Updated',bio:'bio',status:'online',avatarUrl:image,bannerUrl:image,links:[{label:'Site',url:'https://example.test'}]},'PATCH');assert.equal((await b('/api/profile/'+aa.user.accountId)).user.avatarUrl,image);
    const sp=(await a('/api/spaces',{name:'Comunidade com um nome comprido'})).space;const inv=await a(`/api/spaces/${sp.spaceId}/invite`,{});await b('/api/spaces/join',{token:inv.token});await a(`/api/spaces/${sp.spaceId}/settings`,{name:'Updated',iconUrl:image},'PATCH');await a(`/api/spaces/${sp.spaceId}/channels`,{name:'novo',type:'text'});
    const space=await b('/api/spaces/'+sp.spaceId);assert.equal(space.space.iconUrl,image);assert.ok(space.channels.some(x=>x.name==='novo'));const text=space.channels.find(x=>x.type==='text'),voice=space.channels.find(x=>x.type==='voice').channelId;
    await a(`/api/channels/${text.channelId}/messages`,{body:'community'});assert.equal((await b(`/api/channels/${text.channelId}/messages`)).messages[0].body,'community');
    const state=()=>b(`/api/voice/${voice}/state`);assert.deepEqual((await state()).participants,[]);assert.equal((await c(`/api/voice/${voice}/state`)).status,404);
    assert.equal((await a(`/api/voice/${voice}/heartbeat`,{sessionId:'a'})).joined,false);
    await a(`/api/voice/${voice}/join`,{sessionId:'a'});await a(`/api/voice/${voice}/join`,{sessionId:'a'});assert.equal((await state()).participants.length,1);assert.equal((await a(`/api/voice/${voice}/join`,{sessionId:'other'})).status,409);
    await b(`/api/voice/${voice}/join`,{sessionId:'b'});
    const signal={targetId:bb.user.accountId,type:'rtc',payload:{kind:'voice',context:voice,fromSession:'a',toSession:'b',candidate:{candidate:'test'}}};assert.equal((await a('/api/signals',signal)).status,201);
    const events=(await b('/api/signals?after=0')).events;assert.equal(events.length,1);assert.equal((await b('/api/signals?after=0')).events.length,1);assert.equal((await b('/api/signals?after='+events[0].seq)).events.length,0);
    await a(`/api/voice/${voice}/leave`,{sessionId:'old'});assert.equal((await state()).participants.length,2);await a(`/api/voice/${voice}/leave`,{sessionId:'a'});assert.deepEqual((await state()).participants,[bb.user.accountId]);assert.equal((await a('/api/signals',signal)).status,409);
    await b('/api/auth/logout',{});assert.equal((await a(`/api/voice/${voice}/state`)).participants.length,0);assert.equal((await b('/api/auth/me')).status,401);assert.equal((await b('/api/auth/login',{login:'bob',password:'Nightcall123!'})).status,200);
  }finally{await server.close();}
});
