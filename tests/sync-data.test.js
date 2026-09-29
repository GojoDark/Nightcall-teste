import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,client} from './server-helper.js';
test('DM order, invitation delivery, private signaling authorization and recent channel messages',async()=>{
 const server=await startServer();try{
  const a=client(server.url),b=client(server.url),c=client(server.url);
  const register=(api,name)=>api('/api/auth/register',{username:name,displayName:name,email:name+'@example.test',password:'Nightcall123!'});
  const aa=await register(a,'alice'),bb=await register(b,'bobby'),cc=await register(c,'charlie');
  for(const [api,name]of [[b,'bobby'],[c,'charlie']]){await a('/api/friends/request',{username:name});const f=await api('/api/friends');await api(`/api/friends/${f.friends[0].friendshipId}/accept`,{});}
  const dm1=(await a('/api/dms',{accountId:bb.user.accountId})).conversationId;
  const dm2=(await a('/api/dms',{accountId:cc.user.accountId})).conversationId;
  assert.ok(dm1&&dm2);
  await a(`/api/dms/${dm1}/messages`,{body:'first',clientId:'1'});await a(`/api/dms/${dm2}/messages`,{body:'second',clientId:'2'});
  assert.equal((await a('/api/dms')).conversations[0].conversationId,dm2);
  await b(`/api/dms/${dm1}/messages`,{body:'newest',clientId:'3'});assert.equal((await a('/api/dms')).conversations[0].conversationId,dm1);
  const sp=(await a('/api/spaces',{name:'Community'})).space;
  const inv=await a(`/api/spaces/${sp.spaceId}/invite`,{inviteeId:bb.user.accountId});
  assert.ok((await b('/api/sync?clientId=b')).events.some(e=>e.kind==='invite'&&e.payload.token===inv.token));
  await b('/api/spaces/join',{token:inv.token});const detail=await a('/api/spaces/'+sp.spaceId),channel=detail.channels.find(x=>x.type==='text');
  for(let i=0;i<305;i++)await a(`/api/channels/${channel.channelId}/messages`,{body:'message '+i,clientId:'channel-'+i});
  await a(`/api/channels/${channel.channelId}/messages`,{body:'message 304',clientId:'channel-304'});
  const messages=(await b(`/api/channels/${channel.channelId}/messages`)).messages;assert.equal(messages.length,300);assert.equal(messages.at(-1).body,'message 304');assert.equal(messages[0].body,'message 5');
  let call=(await a('/api/calls',{targetId:bb.user.accountId,clientId:'a',requestId:'call'})).call;call=(await b(`/api/calls/${call.call_id}/accept`,{clientId:'b'})).call;
  const payload={kind:'private',context:call.call_id,fromSession:call.callee_session,toSession:call.caller_session,candidate:{candidate:'forged'}};
  assert.equal((await c('/api/signals',{targetId:aa.user.accountId,type:'rtc',payload})).status,409);
 }finally{await server.close();}
});
