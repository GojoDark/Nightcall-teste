import {db,newId} from './db.js';

for(const [table,name,definition] of [
  ['messages','kind',"TEXT NOT NULL DEFAULT 'message'"],['messages','event_json','TEXT'],['messages','client_id','TEXT'],
  ['dm_participants','last_read_rowid','INTEGER NOT NULL DEFAULT 0'],['users','last_seen_ms','INTEGER NOT NULL DEFAULT 0'],
  ['channel_messages','client_id','TEXT']
])if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_client ON messages(author_id,client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_message_client ON channel_messages(author_id,client_id) WHERE client_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS app_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_app_events_account ON app_events(account_id,seq);
CREATE TABLE IF NOT EXISTS private_calls(
 call_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES dm_conversations(conversation_id),
 caller_id TEXT NOT NULL REFERENCES users(account_id), callee_id TEXT NOT NULL REFERENCES users(account_id),
 caller_client TEXT NOT NULL, callee_client TEXT, caller_session TEXT NOT NULL, callee_session TEXT,
 state TEXT NOT NULL, created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL, connected_ms INTEGER, ended_ms INTEGER,
 caller_connected INTEGER NOT NULL DEFAULT 0, callee_connected INTEGER NOT NULL DEFAULT 0,
 caller_seen INTEGER NOT NULL, callee_seen INTEGER NOT NULL, request_id TEXT NOT NULL,
 UNIQUE(caller_id,request_id));
CREATE INDEX IF NOT EXISTS idx_private_calls_users ON private_calls(caller_id,callee_id,state);
`);
export const ACTIVE=['calling','ringing','connecting','connected'];
const now=()=>Date.now();
export function fail(status,message){throw Object.assign(Error(message),{status});}
export function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
export function notify(accounts,kind,payload){for(const account of new Set(accounts))db.prepare('INSERT INTO app_events(account_id,kind,payload,created_ms) VALUES(?,?,?,?)').run(account,kind,JSON.stringify(payload),now());}
export function participants(cid){return db.prepare('SELECT account_id FROM dm_participants WHERE conversation_id=?').all(cid).map(x=>x.account_id);}
export function related(a,b){return !!(db.prepare("SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))").get(a,b,b,a)||db.prepare('SELECT 1 FROM space_members a JOIN space_members b ON a.space_id=b.space_id WHERE a.account_id=? AND b.account_id=?').get(a,b));}
export function ensureDM(a,b){
  if(a===b||!related(a,b))fail(403,'NOT_CONNECTED');
  const found=db.prepare('SELECT a.conversation_id AS id FROM dm_participants a JOIN dm_participants b ON a.conversation_id=b.conversation_id WHERE a.account_id=? AND b.account_id=?').get(a,b);
  if(found)return found.id;
  const id=newId('dm');db.prepare('INSERT INTO dm_conversations(conversation_id) VALUES(?)').run(id);
  for(const account of [a,b])db.prepare('INSERT INTO dm_participants(conversation_id,account_id) VALUES(?,?)').run(id,account);
  notify([a,b],'dm',{conversationId:id});return id;
}
export function assertMember(id,cid){if(!participants(cid).includes(id))fail(404,'CONVERSATION_NOT_FOUND');}
export function listDMs(id){return db.prepare(`SELECT c.conversation_id AS conversationId,c.created_at AS createdAt,
 u.account_id AS accountId,u.username,u.display_name AS displayName,u.avatar_url AS avatarUrl,
 CASE WHEN u.last_seen_ms<? THEN 'offline' ELSE u.status END AS userStatus,
 (SELECT body FROM messages WHERE conversation_id=c.conversation_id AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1) AS lastMessage,
 (SELECT kind FROM messages WHERE conversation_id=c.conversation_id AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1) AS lastEventKind,
 (SELECT created_at FROM messages WHERE conversation_id=c.conversation_id AND deleted_at IS NULL ORDER BY rowid DESC LIMIT 1) AS lastMessageAt,
 (SELECT COALESCE(MAX(rowid),0) FROM messages WHERE conversation_id=c.conversation_id) AS activity,
 (SELECT COUNT(*) FROM messages WHERE conversation_id=c.conversation_id AND deleted_at IS NULL AND rowid>me.last_read_rowid AND author_id<>?) AS unreadCount
 FROM dm_conversations c JOIN dm_participants me ON me.conversation_id=c.conversation_id AND me.account_id=?
 JOIN dm_participants other ON other.conversation_id=c.conversation_id AND other.account_id<>?
 JOIN users u ON u.account_id=other.account_id ORDER BY activity DESC,c.created_at DESC`).all(now()-25000,id,id,id).map(d=>({...d,participants:[id,d.accountId]}));}
export function messages(id,cid){assertMember(id,cid);return db.prepare(`SELECT * FROM (SELECT m.rowid AS sequence,m.message_id AS messageId,m.author_id AS authorId,m.body,m.kind,m.event_json AS eventJson,m.created_at AS createdAt,u.username,u.display_name AS displayName,u.avatar_url AS avatarUrl FROM messages m JOIN users u ON u.account_id=m.author_id WHERE m.conversation_id=? AND m.deleted_at IS NULL ORDER BY m.rowid DESC LIMIT 300) ORDER BY sequence`).all(cid);}
export function sendMessage(id,cid,b){
  assertMember(id,cid);const body=String(b.body||'').trim(),clientId=String(b.clientId||newId('send'));
  if(!body||body.length>4000||clientId.length>120)fail(400,'INVALID_MESSAGE');
  const existing=db.prepare('SELECT message_id AS messageId,conversation_id AS cid FROM messages WHERE author_id=? AND client_id=?').get(id,clientId);
  if(existing){if(existing.cid!==cid)fail(409,'IDEMPOTENCY_CONFLICT');return existing;}
  const messageId=newId('msg');db.prepare('INSERT INTO messages(message_id,conversation_id,author_id,body,client_id) VALUES(?,?,?,?,?)').run(messageId,cid,id,body,clientId);
  notify(participants(cid),'dm',{conversationId:cid,fromId:id,messageId,preview:body.slice(0,100)});return {messageId,body,authorId:id};
}
export function readDM(id,cid,sequence){assertMember(id,cid);const max=db.prepare('SELECT COALESCE(MAX(rowid),0) AS n FROM messages WHERE conversation_id=?').get(cid).n;db.prepare('UPDATE dm_participants SET last_read_rowid=MAX(last_read_rowid,?) WHERE account_id=? AND conversation_id=?').run(Math.min(max,Math.max(0,Number(sequence)||0)),id,cid);notify([id],'read',{conversationId:cid});}
function event(call,body){db.prepare("INSERT INTO messages(message_id,conversation_id,author_id,body,kind,event_json) VALUES(?,?,?,?,'call',?)").run(newId('evt'),call.conversation_id,call.caller_id,body,JSON.stringify({callId:call.call_id,state:call.state,durationSeconds:call.connected_ms?Math.max(0,Math.floor(((call.ended_ms||now())-call.connected_ms)/1000)):0}));notify([call.caller_id,call.callee_id],'call',{conversationId:call.conversation_id,callId:call.call_id,state:call.state});}
export function callById(id){return db.prepare('SELECT * FROM private_calls WHERE call_id=?').get(id);}
export function publicCall(c){const person=id=>db.prepare('SELECT account_id AS accountId,display_name AS displayName,username FROM users WHERE account_id=?').get(id);return {...c,caller:person(c.caller_id),callee:person(c.callee_id)};}
export function transition(call,state){
  if(!ACTIVE.includes(call.state))return call;
  const terminal=!ACTIVE.includes(state),time=now();db.prepare('UPDATE private_calls SET state=?,updated_ms=?,ended_ms=CASE WHEN ? THEN ? ELSE ended_ms END WHERE call_id=?').run(state,time,terminal?1:0,time,call.call_id);
  const updated=callById(call.call_id);
  if(terminal){const duration=updated.connected_ms?Math.max(0,Math.floor((time-updated.connected_ms)/1000)):0;event(updated,({declined:'Chamada recusada',missed:'Chamada perdida',cancelled:'Chamada cancelada',failed:'Chamada falhou',ended:`Chamada de voz — ${Math.floor(duration/60)} min ${duration%60} s`})[state]);}
  else notify([call.caller_id,call.callee_id],'call-state',{callId:call.call_id,state});
  return updated;
}
export function sweepCalls(time=now()){
  for(const call of db.prepare("SELECT * FROM private_calls WHERE state IN ('calling','ringing','connecting','connected')").all()){
    if(['calling','ringing'].includes(call.state)&&time-call.created_ms>Number(process.env.NIGHTCALL_RING_TIMEOUT_MS||45000))transition(call,'missed');
    else if(call.state==='connecting'&&time-call.updated_ms>45000)transition(call,'failed');
    else if(call.state==='connected'&&(time-call.caller_seen>60000||time-call.callee_seen>60000))transition(call,'failed');
  }
}
export function createCall(id,b){
  sweepCalls();const client=String(b.clientId||''),requestId=String(b.requestId||''),target=String(b.targetId||'');if(!client||client.length>120||!requestId||requestId.length>120)fail(400,'INVALID_CLIENT');
  return transaction(()=>{
    const duplicate=db.prepare('SELECT * FROM private_calls WHERE caller_id=? AND request_id=?').get(id,requestId);if(duplicate)return duplicate;
    if(db.prepare("SELECT 1 FROM private_calls WHERE state IN ('calling','ringing','connecting','connected') AND (caller_id IN (?,?) OR callee_id IN (?,?))").get(id,target,id,target))fail(409,'CALL_BUSY');
    const cid=ensureDM(id,target),callId=newId('call'),time=now();
    db.prepare("INSERT INTO private_calls(call_id,conversation_id,caller_id,callee_id,caller_client,caller_session,state,created_ms,updated_ms,caller_seen,callee_seen,request_id) VALUES(?,?,?,?,?,?,'calling',?,?,?,?,?)").run(callId,cid,id,target,client,newId('rtc'),time,time,time,time,requestId);
    const call=callById(callId);event(call,'Chamada iniciada');return call;
  });
}
export function callAction(id,callId,action,b){
  sweepCalls();const c=callById(callId);if(!c||![c.caller_id,c.callee_id].includes(id))fail(404,'CALL_NOT_FOUND');
  const caller=id===c.caller_id,client=String(b.clientId||'');if(!client||client.length>120)fail(400,'INVALID_CLIENT');
  if(!ACTIVE.includes(c.state))return c;
  if(action==='ringing'){if(!caller&&c.state==='calling')return transition(c,'ringing');return c;}
  if(action==='accept'){
    if(caller)fail(403,'CALLEE_ONLY');
    if(!['calling','ringing'].includes(c.state)){if(c.callee_client===client)return c;fail(409,'CALL_ALREADY_HANDLED');}
    db.prepare("UPDATE private_calls SET state='connecting',callee_client=?,callee_session=?,callee_seen=?,updated_ms=? WHERE call_id=?").run(client,newId('rtc'),now(),now(),callId);
    notify([c.caller_id,c.callee_id],'call-state',{callId,state:'connecting'});return callById(callId);
  }
  if(action==='decline'){if(caller||!['calling','ringing'].includes(c.state))fail(409,'INVALID_CALL_STATE');return transition(c,'declined');}
  if((caller?c.caller_client:c.callee_client)!==client)fail(409,'CALL_OTHER_CLIENT');
  if(action==='cancel'){if(!caller||!['calling','ringing'].includes(c.state))fail(409,'INVALID_CALL_STATE');return transition(c,'cancelled');}
  if(action==='end')return transition(c,c.connected_ms?'ended':caller&&['calling','ringing'].includes(c.state)?'cancelled':'failed');
  if(action==='fail')return transition(c,'failed');
  if(action==='connected'&&['connecting','connected'].includes(c.state)){
    db.prepare(`UPDATE private_calls SET ${caller?'caller_connected':'callee_connected'}=1 WHERE call_id=?`).run(callId);
    const updated=callById(callId);if(updated.caller_connected&&updated.callee_connected&&!updated.connected_ms){db.prepare("UPDATE private_calls SET state='connected',connected_ms=?,updated_ms=? WHERE call_id=?").run(now(),now(),callId);notify([c.caller_id,c.callee_id],'call-state',{callId,state:'connected'});}return callById(callId);
  }
  fail(409,'INVALID_CALL_STATE');
}
export function syncCalls(id,client){
  for(const c of db.prepare("SELECT * FROM private_calls WHERE state IN ('calling','ringing','connecting','connected') AND (caller_id=? OR callee_id=?)").all(id,id)){
    const caller=c.caller_id===id;if((caller?c.caller_client:c.callee_client)===client)db.prepare(`UPDATE private_calls SET ${caller?'caller_seen':'callee_seen'}=? WHERE call_id=?`).run(now(),c.call_id);
  }
  sweepCalls();return db.prepare('SELECT * FROM private_calls WHERE (caller_id=? OR callee_id=?) AND (ended_ms IS NULL OR ended_ms>?) ORDER BY created_ms DESC LIMIT 15').all(id,id,now()-120000).map(publicCall);
}
