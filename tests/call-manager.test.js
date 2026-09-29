import test from 'node:test';
import assert from 'node:assert/strict';
import {CallManager} from '../web/js/call-manager.js';
import {VoicePresence} from '../server/voice-presence.js';
import {PrivateCalls} from '../web/js/private-calls.js';
class Track {constructor(kind){this.kind=kind;this.enabled=true;this.readyState='live';}stop(){this.readyState='ended';}}
class Stream {constructor(tracks){this.tracks=tracks;}getTracks(){return this.tracks;}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}}
class Peer {
  constructor(){this.signalingState='stable';this.connectionState='new';this.transceivers=[];this.candidates=[];}
  addTransceiver(track){const t={sender:{track:typeof track==='string'?null:track,async replaceTrack(next){this.track=next;}}};this.transceivers.push(t);return t;}
  getTransceivers(){return this.transceivers;}
  async setLocalDescription(){this.localDescription={type:this.signalingState==='have-remote-offer'?'answer':'offer'};this.signalingState=this.localDescription.type==='offer'?'have-local-offer':'stable';}
  async setRemoteDescription(d){this.remoteDescription=d;this.signalingState=d.type==='offer'?'have-remote-offer':'stable';}
  async addIceCandidate(c){this.candidates.push(c);}
  close(){this.connectionState='closed';}restartIce(){this.restarts=(this.restarts||0)+1;}
}
function fixture(id='a'){
  const requests=[],errors=[];let captures=0;
  const m=new CallManager({accountId:id,Peer,Stream,media:{async getUserMedia(c){captures++;return new Stream([new Track(c.video?'video':'audio')]);},async getDisplayMedia(){return new Stream([new Track('video')]);}},api:async(path,o)=>{requests.push([path,o]);return {sessions:[],profiles:[]};},audioFactory:()=>({play:async()=>{},remove(){this.removed=true;}}),error:e=>errors.push(e)});
  return {m,requests,errors,get captures(){return captures;}};
}
const context={kind:'private',id:'call-1',localId:'local',targetId:'b'};
test('slow hangup acknowledgement cannot restart media from a stale sync snapshot',async()=>{
  const {m}=fixture();await m.enter(context);
  let resolve,starts=0;const controller=Object.create(PrivateCalls.prototype);
  const call={call_id:'call-1',caller_id:'a',callee_id:'b',caller_client:'client',state:'connected'};
  Object.assign(controller,{manager:m,user:{accountId:'a'},clientId:'client',current:call,view:{update(){}},render(){},mediaChanged(){},toast(){},changed(){},action:()=>new Promise(r=>resolve=r),startRTC(){starts++;}});
  const ending=controller.end();await Promise.resolve();assert.equal(m.session,null);
  controller.apply([call]);controller.apply([call]);assert.equal(starts,0);assert.equal(m.session,null);
  resolve({call:{...call,state:'ended'}});await ending;assert.equal(controller.ending,null);assert.equal(starts,0);
});
test('repeated entry keeps identity, microphone, peer, mute and volume',async()=>{
  const f=fixture(),m=f.m;await m.enter(context);const s=m.session,mic=m.streams.audio,p=m.peer('b','remote');m.mute();m.volume('b',.3);await m.enter(context);
  assert.equal(m.session,s);assert.equal(m.streams.audio,mic);assert.equal(m.peers.get('b'),p);assert.equal(f.captures,1);assert.equal(mic.getAudioTracks()[0].enabled,false);assert.equal(m.volumes.get('b'),.3);
  await assert.rejects(m.enter({...context,id:'other'}));await m.leave();assert.equal(p.pc.connectionState,'closed');assert.equal(mic.getTracks()[0].readyState,'ended');assert.equal(m.session,null);
});
test('camera and screen send independently and stop independently',async()=>{
  const {m}=fixture();await m.enter(context);const p=m.peer('b','remote');await m.toggleMedia('camera');const camera=m.streams.camera;await m.toggleMedia('screen');
  assert.equal(p.transceivers[1].sender.track,camera.getTracks()[0]);assert.equal(p.transceivers[2].sender.track,m.streams.screen.getTracks()[0]);await m.toggleMedia('screen');assert.equal(p.transceivers[2].sender.track,null);assert.equal(camera.getTracks()[0].readyState,'live');await m.leave();
});
test('shared audio remains separate from mic and obeys volume, deafen and cleanup',async()=>{
  const {m}=fixture();await m.enter(context);const p=m.peer('b','remote'),mic=m.streams.audio;
  await m.toggleMedia('camera');const camera=m.streams.camera;
  const audio=new Track('audio'),video=new Track('video');
  await m.setMedia('screen',new Stream([audio,video]));
  assert.equal(p.transceivers[2].sender.track,video);assert.equal(p.transceivers[3].sender.track,audio);
  assert.equal(p.transceivers[0].sender.track,mic.getAudioTracks()[0]);
  p.pc.ontrack({transceiver:p.transceivers[3],track:new Track('audio')});
  m.volume('b',.2);m.deafen();assert.equal(p.sharedAudio.volume,.2);assert.equal(p.sharedAudio.muted,true);
  m.deafen(false);assert.equal(p.sharedAudio.muted,false);
  await m.setMedia('screen',null);assert.equal(p.transceivers[3].sender.track,null);assert.equal(audio.readyState,'ended');
  assert.equal(camera.getVideoTracks()[0].readyState,'live');await m.leave();assert.equal(p.sharedAudio.removed,true);
});
test('early ICE is queued, stale contexts ignored, polite glare accepts offer',async()=>{
  const {m,errors}=fixture('z');await m.enter(context);const p=m.peer('b','remote');const signal=data=>m.signal({fromId:'b',payload:{kind:'private',context:'call-1',fromSession:'remote',toSession:'local',...data}});
  await signal({candidate:{candidate:'early'}});assert.equal(p.ice.length,1);await signal({description:{type:'offer'},media:{revision:1,camera:true,screen:true}});assert.equal(p.pc.candidates.length,1);assert.equal(p.remote.screen,true);
  await signal({context:'old',media:{revision:3,screen:false}});assert.equal(p.remote.screen,true);
  p.pc.signalingState='have-local-offer';await signal({description:{type:'offer'}});assert.equal(p.pc.localDescription.type,'answer');assert.deepEqual(errors,[]);await m.leave();
});
test('impolite glare ignores colliding offer and candidates',async()=>{
  const {m}=fixture();await m.enter(context);const p=m.peer('b','remote');p.pc.signalingState='have-local-offer';await m.signal({fromId:'b',payload:{kind:'private',context:'call-1',fromSession:'remote',toSession:'local',description:{type:'offer'}}});assert.equal(p.ignoreOffer,true);assert.equal(p.pc.remoteDescription,undefined);await m.leave();
});
test('deafen applies to new remote audio, restoring mute and individual volume',async()=>{
  const {m}=fixture();await m.enter(context);m.deafen();m.volume('b',.25);const p=m.peer('b','remote');p.pc.ontrack({transceiver:p.transceivers[0],track:new Track('audio')});assert.equal(p.audio.muted,true);assert.equal(p.audio.volume,.25);m.deafen(false);assert.equal(m.streams.audio.getTracks()[0].enabled,true);m.mute();m.deafen();m.deafen(false);assert.equal(m.streams.audio.getTracks()[0].enabled,false);await m.leave();assert.equal(p.audio.removed,true);
});
test('mic replacement preserves mute and stops old capture',async()=>{
  const {m}=fixture();await m.enter(context);m.mute();const old=m.streams.audio,p=m.peer('b','remote');await m.updateSettings({input:'new'});assert.equal(old.getTracks()[0].readyState,'ended');assert.equal(p.transceivers[0].sender.track,m.streams.audio.getTracks()[0]);assert.equal(p.transceivers[0].sender.track.enabled,false);await m.leave();
});
test('leave while permission pending cannot resurrect a session',async()=>{
  const {m}=fixture();let resolve;m.media.getUserMedia=()=>new Promise(r=>resolve=r);const entering=m.enter(context);await m.leave();const track=new Track('audio');resolve(new Stream([track]));await entering;assert.equal(m.session,null);assert.equal(track.readyState,'ended');
});
test('failed media replacement restores previous track and releases new capture',async()=>{
  const {m}=fixture();await m.enter(context);const p=m.peer('b','remote'),old=m.streams.audio,next=new Stream([new Track('audio')]);
  const replace=p.transceivers[0].sender.replaceTrack;p.transceivers[0].sender.replaceTrack=async function(track){if(track===next.getTracks()[0])throw Error('device failed');return replace.call(this,track);};
  await assert.rejects(m.setMedia('audio',next));assert.equal(m.streams.audio,old);assert.equal(old.getTracks()[0].readyState,'live');assert.equal(next.getTracks()[0].readyState,'ended');await m.leave();
});
test('late private signaling cannot replace the accepted peer session',async()=>{
  const {m}=fixture();await m.enter(context);const p=m.peer('b','remote');await m.signal({fromId:'b',payload:{kind:'private',context:'call-1',fromSession:'stale',toSession:'local',description:{type:'offer'}}});assert.equal(m.peers.get('b'),p);await m.leave();
});
test('presence requires explicit join, deduplicates and rejects stale exits',()=>{
  let now=0;const p=new VoicePresence({now:()=>now,ttl:30});assert.deepEqual(p.state('room'),[]);assert.equal(p.heartbeat('room','a','1'),false);assert.equal(p.join('room','a','1'),true);assert.equal(p.join('room','a','1'),true);assert.equal(p.state('room').length,1);assert.equal(p.join('room','a','2'),false);assert.equal(p.join('other','a','1'),false);p.leave('room','a','wrong');assert.equal(p.state('room').length,1);p.leave('room','a','1');assert.equal(p.state('room').length,0);p.join('room','a','2');now=31;assert.deepEqual(p.state('room'),[]);
});
test('community membership reconciles departed peers and rejects unknown sessions',async()=>{
  const {m}=fixture();await m.enter({kind:'voice',id:'room',localId:'local'});await m.syncPresence({sessions:[{accountId:'a',sessionId:'local'},{accountId:'b',sessionId:'remote'}],profiles:[]});assert.equal(m.peers.size,1);const p=m.peers.get('b');await m.signal({fromId:'c',payload:{kind:'voice',context:'room',fromSession:'remote',toSession:'local',candidate:{}}});assert.equal(m.peers.size,1);await m.syncPresence({sessions:[],profiles:[]});assert.equal(p.pc.connectionState,'closed');await m.leave();
});
