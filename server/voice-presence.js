export class VoicePresence {
  constructor({now=Date.now, ttl=30000}={}) {this.rooms=new Map();this.now=now;this.ttl=ttl;}
  state(channel) {
    const room=this.rooms.get(channel);
    if(!room)return [];
    for(const [id,entry] of room)if(this.now()-entry.seen>this.ttl)room.delete(id);
    if(!room.size)this.rooms.delete(channel);
    return [...room].map(([accountId,x])=>({accountId,sessionId:x.sessionId}));
  }
  join(channel,id,sessionId) {
    for(const key of this.rooms.keys()) {
      this.state(key);
      const existing=this.rooms.get(key)?.get(id);
      if(existing && (key!==channel || existing.sessionId!==sessionId))return false;
    }
    const room=this.rooms.get(channel)||new Map();
    room.set(id,{sessionId,seen:this.now()});this.rooms.set(channel,room);return true;
  }
  heartbeat(channel,id,sessionId) {this.state(channel);const e=this.rooms.get(channel)?.get(id);if(!e||e.sessionId!==sessionId)return false;e.seen=this.now();return true;}
  leave(channel,id,sessionId) {const room=this.rooms.get(channel);if(room?.get(id)?.sessionId===sessionId)room.delete(id);this.state(channel);}
  removeAccount(id) {for(const [channel,room]of this.rooms){room.delete(id);this.state(channel);}}
}
