import test from 'node:test';
import assert from 'node:assert/strict';
import {startServer,client} from './server-helper.js';
test('private call lifecycle, all clients, persistent events and unread DMs',async()=>{
 const server=await startServer({NIGHTCALL_RING_TIMEOUT_MS:'1000'});try{
  const a=client(server.url),b=client(server.url),other=client(server.url);
  const register=(c,name)=>c('/api/auth/register',{username:name,displayName:name,email:name+'@example.test',password:'Nightcall123!'});
  const aa=await register(a,'alice'),bb=await register(b,'bobby');await register(other,'outsider');
  await a('/api/friends/request',{username:'bobby'});const f=await b('/api/friends');await b(`/api/friends/${f.friends[0].friendshipId}/accept`,{});
  const create=requestId=>a('/api/calls',{targetId:bb.user.accountId,clientId:'a-device',requestId});
  let result=await create('first');assert.equal(result.status,201);let c=result.call;
  assert.equal(c.state,'calling');assert.equal((await create('first')).call.call_id,c.call_id);
  assert.equal((await create('duplicate')).status,409);
  for(const clientId of ['b-phone','b-pc'])assert.equal((await b('/api/sync?clientId='+clientId)).calls[0].call_id,c.call_id);
  assert.equal((await other('/api/calls/'+c.call_id)).status,404);
  assert.equal((await a('/api/signals',{targetId:bb.user.accountId,type:'rtc',payload:{kind:'private',context:c.call_id,fromSession:c.caller_session,toSession:'unaccepted',candidate:{}}})).status,409);
  c=(await b(`/api/calls/${c.call_id}/ringing`,{clientId:'b-phone'})).call;assert.equal(c.state,'ringing');
  c=(await b(`/api/calls/${c.call_id}/accept`,{clientId:'b-phone'})).call;assert.equal(c.state,'connecting');
  assert.equal((await b(`/api/calls/${c.call_id}/accept`,{clientId:'b-pc'})).status,409);
  assert.equal((await b(`/api/calls/${c.call_id}/end`,{clientId:'b-pc'})).status,409);
  assert.equal((await a(`/api/calls/${c.call_id}/connected`,{clientId:'a-device'})).call.connected_ms,null);
  c=(await b(`/api/calls/${c.call_id}/connected`,{clientId:'b-phone'})).call;assert.equal(c.state,'connected');assert.ok(c.connected_ms);
  c=(await a(`/api/calls/${c.call_id}/end`,{clientId:'a-device'})).call;assert.equal(c.state,'ended');
  const history=await b(`/api/dms/${c.conversation_id}/messages`);assert.equal(history.messages.length,2);assert.equal(history.messages[1].kind,'call');assert.match(history.messages[1].body,/Chamada de voz/);
  const list=await b('/api/dms');assert.equal(list.conversations.length,1);assert.equal(list.conversations[0].unreadCount,2);assert.deepEqual(list.conversations[0].participants,[bb.user.accountId,aa.user.accountId]);
  await b(`/api/dms/${c.conversation_id}/read`,{sequence:history.messages.at(-1).sequence});assert.equal((await b('/api/dms')).conversations[0].unreadCount,0);
  for(const [request,action,expected,actor,clientId]of [['decline','decline','declined',b,'b-phone'],['cancel','cancel','cancelled',a,'a-device']]){const call=(await create(request)).call;assert.equal((await actor(`/api/calls/${call.call_id}/${action}`,{clientId})).call.state,expected);}
  const missed=(await create('missed')).call;await new Promise(r=>setTimeout(r,1100));assert.equal((await b('/api/sync?clientId=b-phone')).calls.find(x=>x.call_id===missed.call_id).state,'missed');
  const message={body:'Mensagem idempotente',clientId:'same-request'};const first=await a(`/api/dms/${c.conversation_id}/messages`,message);const second=await a(`/api/dms/${c.conversation_id}/messages`,message);assert.equal(first.message.messageId,second.message.messageId);
  assert.equal((await b(`/api/dms/${c.conversation_id}/messages`)).messages.filter(x=>x.body===message.body).length,1);
  await b('/api/auth/logout',{});await b('/api/auth/login',{login:'bobby',password:'Nightcall123!'});assert.ok((await b(`/api/dms/${c.conversation_id}/messages`)).messages.some(x=>x.body==='Chamada perdida'));
 }finally{await server.close();}
});
