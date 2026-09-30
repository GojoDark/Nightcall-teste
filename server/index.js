import * as conversations from './conversations.js';
import { VoicePresence } from './voice-presence.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { db, newId } from './db.js';
import { clearSession, getAccountId, hashPassword, normalizeUsername, setSession, verifyPassword } from './auth.js';

const ROOT=fileURLToPath(new URL('../web',import.meta.url));
const PORT=Number(process.env.PORT||3000);
const publicUserSelect=`account_id AS accountId, username, display_name AS displayName, avatar_url AS avatarUrl, banner_url AS bannerUrl, status, custom_status AS customStatus, bio, links_json AS linksJson, created_at AS createdAt`;
const send=(res,status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data));};
const body=async(req)=>{let s='';for await(const c of req){s+=c;if(s.length>150*1024*1024)throw Error('BODY_TOO_LARGE')}return s?JSON.parse(s):{}};
const unauthorized=(res)=>send(res,401,{error:'UNAUTHORIZED'});
const requireAuth=(req,res)=>getAccountId(req);
const validUsername=(v)=>/^[a-zA-Z0-9._-]{3,32}$/.test(v);
const signalQueues=new Map();
const presence=new VoicePresence();
let signalSequence=0;const serverEpoch=crypto.randomUUID();
setInterval(()=>conversations.sweepCalls(),1000).unref();
const pushSignal=(to,event)=>{const q=signalQueues.get(to)||[];q.push({...event,seq:++signalSequence,at:Date.now()});signalQueues.set(to,q.slice(-100));};
const originOk=(req)=>{
  if(!['POST','PATCH','PUT','DELETE'].includes(req.method)||!req.headers.origin)return true;
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
};

async function api(req,res){
  if(!originOk(req)) return send(res,403,{error:'BAD_ORIGIN'});
  const url=new URL(req.url,`http://${req.headers.host}`); const path=url.pathname;
  if(path==='/api/health') return send(res,200,{ok:true,service:'nightcall-api'});
  try{
    if(path==='/api/auth/register'&&req.method==='POST'){
      const b=await body(req); const displayName=String(b.displayName||'').trim(); const username=normalizeUsername(String(b.username||'')); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
      if(!displayName||displayName.length>40||!validUsername(username)||!/^\S+@\S+\.\S+$/.test(email)||password.length<8||password.length>128)return send(res,400,{error:'INVALID_INPUT'});
      const exists=db.prepare('SELECT username,email FROM users WHERE username=? OR email=?').get(username,email); if(exists?.username===username)return send(res,409,{error:'USERNAME_TAKEN'});if(exists?.email===email)return send(res,409,{error:'EMAIL_TAKEN'});
      const accountId=newId('usr');const hash=await hashPassword(password);db.prepare(`INSERT INTO users(account_id,username,display_name,email,password_hash,status) VALUES(?,?,?,?,?,'online')`).run(accountId,username,displayName,email,hash);setSession(accountId,res);return send(res,201,{user:db.prepare(`SELECT ${publicUserSelect} FROM users WHERE account_id=?`).get(accountId)});
    }
    if(path==='/api/auth/login'&&req.method==='POST'){
      const b=await body(req);const login=String(b.login||'').trim().toLowerCase().replace(/^@/,'');const password=String(b.password||'');const user=db.prepare('SELECT * FROM users WHERE username=? OR lower(email)=?').get(login,login);if(!user||!(await verifyPassword(password,user.password_hash)))return send(res,401,{error:'INVALID_CREDENTIALS'});db.prepare("UPDATE users SET status='online',updated_at=CURRENT_TIMESTAMP WHERE account_id=?").run(user.account_id);setSession(user.account_id,res);return send(res,200,{user:db.prepare(`SELECT ${publicUserSelect} FROM users WHERE account_id=?`).get(user.account_id)});
    }
    if(path==='/api/auth/logout'&&req.method==='POST'){const account=getAccountId(req);if(account){presence.removeAccount(account);db.prepare('UPDATE users SET last_seen_ms=0 WHERE account_id=?').run(account);for(const call of conversations.syncCalls(account,''))if(conversations.ACTIVE.includes(call.state))conversations.transition(call,'failed');}clearSession(req,res);return send(res,200,{ok:true});}
    if(path==='/api/auth/me'&&req.method==='GET'){const id=requireAuth(req,res);if(!id)return unauthorized(res);const user=db.prepare(`SELECT ${publicUserSelect} FROM users WHERE account_id=?`).get(id);return user?send(res,200,{user}):unauthorized(res);}
    const id=requireAuth(req,res); if(!id)return unauthorized(res);
    if(path==='/api/sync'&&req.method==='GET'){
      const client=String(url.searchParams.get('clientId')||'');if(!client||client.length>120)return send(res,400,{error:'INVALID_CLIENT'});
      db.prepare('UPDATE users SET last_seen_ms=? WHERE account_id=?').run(Date.now(),id);
      const after=Math.max(0,Number(url.searchParams.get('after'))||0);
      const query=after?'SELECT seq,kind,payload,created_ms AS at FROM app_events WHERE account_id=? AND seq>? ORDER BY seq LIMIT 200':'SELECT * FROM (SELECT seq,kind,payload,created_ms AS at FROM app_events WHERE account_id=? AND seq>? ORDER BY seq DESC LIMIT 200) ORDER BY seq';
      const events=db.prepare(query).all(id,after).map(e=>({...e,payload:JSON.parse(e.payload)}));
      const signalAfter=Number(url.searchParams.get('signalAfter'))||0;
      const signals=(signalQueues.get(id)||[]).filter(e=>Date.now()-e.at<60000&&e.seq>signalAfter);
      const online=db.prepare("SELECT account_id AS accountId,CASE WHEN last_seen_ms<? THEN 'offline' ELSE status END AS status FROM users WHERE account_id IN (SELECT requester_id FROM friendships WHERE addressee_id=? UNION SELECT addressee_id FROM friendships WHERE requester_id=? UNION SELECT sm.account_id FROM space_members sm JOIN space_members me ON sm.space_id=me.space_id WHERE me.account_id=?)").all(Date.now()-25000,id,id,id);
      return send(res,200,{events,signals,calls:conversations.syncCalls(id,client),online,epoch:serverEpoch});
    }
    if(path==='/api/calls'&&req.method==='POST')return send(res,201,{call:conversations.publicCall(conversations.createCall(id,await body(req)))});
    const callRoute=path.match(/^\/api\/calls\/([^/]+)(?:\/([^/]+))?$/);
    if(callRoute){const [,cid,action]=callRoute;
      if(req.method==='POST'&&action)return send(res,200,{call:conversations.publicCall(conversations.callAction(id,cid,action,await body(req)))});
      const call=conversations.callById(cid);if(!call||![call.caller_id,call.callee_id].includes(id))return send(res,404,{error:'CALL_NOT_FOUND'});
      if(req.method==='GET')return send(res,200,{call:conversations.publicCall(call)});
    }
    const readRoute=path.match(/^\/api\/dms\/([^/]+)\/read$/);if(readRoute&&req.method==='POST'){const b=await body(req);conversations.readDM(id,readRoute[1],b.sequence);return send(res,200,{ok:true});}

    if(path==='/api/profile/me'&&req.method==='GET'){return send(res,200,{user:db.prepare(`SELECT ${publicUserSelect},email FROM users WHERE account_id=?`).get(id)});}
    const publicProfile=path.match(/^\/api\/profile\/([^/]+)$/);if(publicProfile&&req.method==='GET'){const u=db.prepare(`SELECT ${publicUserSelect} FROM users WHERE account_id=?`).get(publicProfile[1]);return u?send(res,200,{user:u}):send(res,404,{error:'USER_NOT_FOUND'});}
    if(path==='/api/profile/me'&&req.method==='PATCH'){const b=await body(req);const displayName=String(b.displayName||'').trim();const bio=String(b.bio||'');const customStatus=String(b.customStatus||'');const status=String(b.status||'online');const avatarUrl=String(b.avatarUrl||'').trim();const bannerUrl=String(b.bannerUrl||'').trim();let links=[];try{links=Array.isArray(b.links)?b.links:JSON.parse(String(b.linksJson||'[]'))}catch{}links=links.slice(0,5).map(x=>({label:String(x.label||'').slice(0,30),url:String(x.url||'').slice(0,500)})).filter(x=>x.url);if(!displayName||displayName.length>40||bio.length>240||customStatus.length>80||avatarUrl.length>140000000||bannerUrl.length>140000000||!['online','away','dnd','offline'].includes(status))return send(res,400,{error:'INVALID_INPUT'});db.prepare(`UPDATE users SET display_name=?,bio=?,custom_status=?,status=?,avatar_url=?,banner_url=?,links_json=?,updated_at=CURRENT_TIMESTAMP WHERE account_id=?`).run(displayName,bio,customStatus,status,avatarUrl||null,bannerUrl||null,JSON.stringify(links),id);const u=db.prepare(`SELECT ${publicUserSelect},email FROM users WHERE account_id=?`).get(id);u.links=JSON.parse(u.linksJson||'[]');conversations.notify(db.prepare('SELECT account_id FROM users').all().filter(x=>x.account_id===id||conversations.related(id,x.account_id)).map(x=>x.account_id),'profile',{accountId:id});return send(res,200,{user:u});}
    if(path==='/api/friends'&&req.method==='GET'){
      const rows=db.prepare(`SELECT f.friendship_id AS friendshipId,f.status,f.requester_id AS requesterId,f.addressee_id AS addresseeId,u.account_id AS accountId,u.username,u.display_name AS displayName,u.avatar_url AS avatarUrl,CASE WHEN u.last_seen_ms<(unixepoch('now')*1000-25000) THEN 'offline' ELSE u.status END AS userStatus,u.custom_status AS customStatus FROM friendships f JOIN users u ON u.account_id=CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END WHERE f.requester_id=? OR f.addressee_id=? ORDER BY f.updated_at DESC`).all(id,id,id);return send(res,200,{friends:rows});
    }
    if(path==='/api/friends/request'&&req.method==='POST'){
      const b=await body(req);const username=normalizeUsername(String(b.username||''));const target=db.prepare('SELECT account_id FROM users WHERE username=?').get(username);if(!target)return send(res,404,{error:'USER_NOT_FOUND'});if(target.account_id===id)return send(res,400,{error:'CANNOT_ADD_SELF'});const ex=db.prepare(`SELECT friendship_id,status FROM friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`).get(id,target.account_id,target.account_id,id);if(ex)return send(res,409,{error:'RELATION_EXISTS',status:ex.status});db.prepare(`INSERT INTO friendships(friendship_id,requester_id,addressee_id,status) VALUES(?,?,?,'pending')`).run(newId('fr'),id,target.account_id);conversations.notify([id,target.account_id],'friend',{fromId:id});return send(res,201,{ok:true});
    }
    const match=path.match(/^\/api\/friends\/([^/]+)\/(accept|decline)$/);if(match&&req.method==='POST'){const [_,fid,action]=match;const relation=db.prepare('SELECT requester_id,addressee_id FROM friendships WHERE friendship_id=?').get(fid);if(action==='accept'){const r=db.prepare(`UPDATE friendships SET status='accepted',updated_at=CURRENT_TIMESTAMP WHERE friendship_id=? AND addressee_id=? AND status='pending'`).run(fid,id);if(!r.changes)return send(res,404,{error:'REQUEST_NOT_FOUND'});conversations.notify([relation.requester_id,relation.addressee_id],'friend',{friendshipId:fid});return send(res,200,{ok:true});}const r=db.prepare(`DELETE FROM friendships WHERE friendship_id=? AND addressee_id=? AND status='pending'`).run(fid,id);if(!r.changes)return send(res,404,{error:'REQUEST_NOT_FOUND'});return send(res,200,{ok:true});}
    if(path==='/api/spaces'&&req.method==='GET'){const rows=db.prepare(`SELECT s.space_id AS spaceId,s.name,s.icon_url AS iconUrl,s.owner_id AS ownerId,s.is_private AS isPrivate,s.created_at AS createdAt,sm.role FROM spaces s JOIN space_members sm ON sm.space_id=s.space_id WHERE sm.account_id=? ORDER BY s.created_at ASC`).all(id);return send(res,200,{spaces:rows});}
    if(path==='/api/spaces'&&req.method==='POST'){const b=await body(req);const name=String(b.name||'').trim();if(!name||name.length>48)return send(res,400,{error:'INVALID_SPACE_NAME'});const spaceId=newId('sp');db.prepare('INSERT INTO spaces(space_id,owner_id,name,is_private) VALUES(?,?,?,1)').run(spaceId,id,name);db.prepare("INSERT INTO space_members(space_id,account_id,role) VALUES(?,?,'owner')").run(spaceId,id);db.prepare("INSERT INTO channels(channel_id,space_id,name,type,is_private) VALUES(?,?,?,'text',0)").run(newId('ch'),spaceId,'geral');db.prepare("INSERT INTO channels(channel_id,space_id,name,type,is_private) VALUES(?,?,?,'voice',0)").run(newId('ch'),spaceId,'Madrugada');return send(res,201,{space:{spaceId,name,ownerId:id,isPrivate:1,role:'owner'}});}
    const spaceMatch=path.match(/^\/api\/spaces\/([^/]+)$/);if(spaceMatch&&req.method==='GET'){const sid=spaceMatch[1];const member=db.prepare('SELECT role FROM space_members WHERE space_id=? AND account_id=?').get(sid,id);if(!member)return send(res,404,{error:'SPACE_NOT_FOUND'});const space=db.prepare('SELECT space_id AS spaceId,name,icon_url AS iconUrl,owner_id AS ownerId,is_private AS isPrivate,created_at AS createdAt FROM spaces WHERE space_id=?').get(sid);const channels=db.prepare('SELECT channel_id AS channelId,name,type,is_private AS isPrivate FROM channels WHERE space_id=? ORDER BY type,name').all(sid);const members=db.prepare(`SELECT u.account_id AS accountId,u.username,u.display_name AS displayName,u.avatar_url AS avatarUrl,u.banner_url AS bannerUrl,u.bio,u.custom_status AS customStatus,u.status,sm.role FROM space_members sm JOIN users u ON u.account_id=sm.account_id WHERE sm.space_id=? ORDER BY CASE sm.role WHEN 'owner' THEN 0 ELSE 1 END,u.display_name`).all(sid);return send(res,200,{space:{...space,role:member.role},channels,members});}
    const spaceSettings=path.match(/^\/api\/spaces\/([^/]+)\/settings$/);if(spaceSettings&&req.method==='PATCH'){const sid=spaceSettings[1];const own=db.prepare("SELECT 1 FROM spaces WHERE space_id=? AND owner_id=?").get(sid,id);if(!own)return send(res,403,{error:'OWNER_ONLY'});const b=await body(req);const name=String(b.name||'').trim();const iconUrl=String(b.iconUrl||'').trim();if(!name||name.length>48||iconUrl.length>140000000)return send(res,400,{error:'INVALID_INPUT'});db.prepare('UPDATE spaces SET name=?,icon_url=? WHERE space_id=?').run(name,iconUrl||null,sid);return send(res,200,{ok:true});}
    const createChannel=path.match(/^\/api\/spaces\/([^/]+)\/channels$/);if(createChannel&&req.method==='POST'){const sid=createChannel[1];const own=db.prepare("SELECT 1 FROM spaces WHERE space_id=? AND owner_id=?").get(sid,id);if(!own)return send(res,403,{error:'OWNER_ONLY'});const b=await body(req);const name=String(b.name||'').trim().slice(0,40);const type=['text','voice'].includes(b.type)?b.type:'text';if(!name)return send(res,400,{error:'INVALID_INPUT'});const channelId=newId('ch');db.prepare('INSERT INTO channels(channel_id,space_id,name,type,is_private) VALUES(?,?,?,?,0)').run(channelId,sid,name,type);return send(res,201,{channel:{channelId,name,type}});}
    const inviteMatch=path.match(/^\/api\/spaces\/([^/]+)\/invite$/);if(inviteMatch&&req.method==='POST'){const sid=inviteMatch[1];const member=db.prepare('SELECT role FROM space_members WHERE space_id=? AND account_id=?').get(sid,id);if(!member)return send(res,404,{error:'SPACE_NOT_FOUND'});const inviteBody=await body(req);const invited=String(inviteBody.inviteeId||'');if(invited&&!conversations.related(id,invited))return send(res,403,{error:'NOT_CONNECTED'});const token=crypto.randomBytes(18).toString('base64url');const tokenHash=crypto.createHash('sha256').update(token).digest('hex');db.prepare(`INSERT INTO space_invites(invite_id,space_id,inviter_id,token_hash,expires_at) VALUES(?,?,?,?,datetime('now','+7 days'))`).run(newId('inv'),sid,id,tokenHash);if(invited)conversations.notify([invited],'invite',{spaceId:sid,fromId:id,token,name:db.prepare('SELECT name FROM spaces WHERE space_id=?').get(sid).name});return send(res,201,{token,expiresInDays:7});}
    if(path==='/api/spaces/join'&&req.method==='POST'){const b=await body(req);const token=String(b.token||'').trim();if(!token)return send(res,400,{error:'INVALID_INVITE'});const tokenHash=crypto.createHash('sha256').update(token).digest('hex');const inv=db.prepare(`SELECT i.space_id AS spaceId,s.name FROM space_invites i JOIN spaces s ON s.space_id=i.space_id WHERE i.token_hash=? AND (i.expires_at IS NULL OR i.expires_at>CURRENT_TIMESTAMP)`).get(tokenHash);if(!inv)return send(res,404,{error:'INVALID_INVITE'});db.prepare("INSERT OR IGNORE INTO space_members(space_id,account_id,role) VALUES(?,?,'member')").run(inv.spaceId,id);return send(res,200,{space:{spaceId:inv.spaceId,name:inv.name}});}

    const channelMsg=path.match(/^\/api\/channels\/([^/]+)\/messages$/);
    if(channelMsg&&req.method==='GET'){const cid=channelMsg[1];const ch=db.prepare('SELECT c.channel_id,c.space_id,c.type FROM channels c JOIN space_members sm ON sm.space_id=c.space_id WHERE c.channel_id=? AND sm.account_id=?').get(cid,id);if(!ch||ch.type!=='text')return send(res,404,{error:'CHANNEL_NOT_FOUND'});const rows=db.prepare(`SELECT * FROM (SELECT m.rowid AS sequence,m.message_id AS messageId,m.author_id AS authorId,m.body,m.created_at AS createdAt,u.username,u.display_name AS displayName,u.avatar_url AS avatarUrl FROM channel_messages m JOIN users u ON u.account_id=m.author_id WHERE m.channel_id=? AND m.deleted_at IS NULL ORDER BY m.rowid DESC LIMIT 300) ORDER BY sequence`).all(cid);return send(res,200,{messages:rows});}
    if(channelMsg&&req.method==='POST'){const cid=channelMsg[1];const ch=db.prepare('SELECT c.channel_id,c.space_id,c.type FROM channels c JOIN space_members sm ON sm.space_id=c.space_id WHERE c.channel_id=? AND sm.account_id=?').get(cid,id);if(!ch||ch.type!=='text')return send(res,404,{error:'CHANNEL_NOT_FOUND'});const b=await body(req);const message=String(b.body||'').trim();if(!message||message.length>4000)return send(res,400,{error:'INVALID_MESSAGE'});const clientId=String(b.clientId||newId('send'));if(clientId.length>120)return send(res,400,{error:'INVALID_MESSAGE'});const duplicate=db.prepare('SELECT message_id AS messageId,channel_id AS channelId FROM channel_messages WHERE author_id=? AND client_id=?').get(id,clientId);if(duplicate){if(duplicate.channelId!==cid)return send(res,409,{error:'IDEMPOTENCY_CONFLICT'});return send(res,200,{message:duplicate});}const messageId=newId('cmsg');db.prepare('INSERT INTO channel_messages(message_id,channel_id,author_id,body,client_id) VALUES(?,?,?,?,?)').run(messageId,cid,id,message,clientId);conversations.notify(db.prepare('SELECT account_id FROM space_members WHERE space_id=?').all(ch.space_id).map(x=>x.account_id),'channel',{channelId:cid,fromId:id});return send(res,201,{message:{messageId,authorId:id,body:message}});}
    if(path==='/api/rtc-config'&&req.method==='GET'){
      let iceServers=[{urls:'stun:stun.l.google.com:19302'}];
      if(process.env.NIGHTCALL_TURN_URL)iceServers.push({urls:process.env.NIGHTCALL_TURN_URL.split(','),username:process.env.NIGHTCALL_TURN_USERNAME||'',credential:process.env.NIGHTCALL_TURN_PASSWORD||''});
      return send(res,200,{iceServers});
    }
    if(path==='/api/signals'&&req.method==='GET'){
      const after=Number(new URL(req.url,'http://localhost').searchParams.get('after')||0);
      const q=(signalQueues.get(id)||[]).filter(e=>Date.now()-e.at<60000);signalQueues.set(id,q);
      return send(res,200,{events:q.filter(e=>e.seq>after)});
    }
    if(path==='/api/signals'&&req.method==='POST'){
      const b=await body(req),targetId=String(b.targetId||''),type=String(b.type||''),p=b.payload||{};
      if(!targetId||targetId===id||!['rtc','private-invite','private-accept','private-reject','private-end'].includes(type))return send(res,400,{error:'INVALID_SIGNAL'});
      if(type==='rtc'&&p.kind==='voice'){
        const members=presence.state(p.context);
        if(!members.some(m=>m.accountId===id&&m.sessionId===p.fromSession)||!members.some(m=>m.accountId===targetId&&m.sessionId===p.toSession))return send(res,409,{error:'STALE_VOICE_SESSION'});
      }else if(type==='rtc'){
        const call=conversations.callById(p.context);
        const caller=call?.caller_id===id;
        if(!call||p.kind!=='private'||![call.caller_id,call.callee_id].includes(id)||!['connecting','connected'].includes(call.state)||(caller?call.callee_id:call.caller_id)!==targetId||(caller?call.caller_session:call.callee_session)!==p.fromSession||(caller?call.callee_session:call.caller_session)!==p.toSession)return send(res,409,{error:'STALE_CALL_SESSION'});
      }else return send(res,410,{error:'CALL_PROTOCOL_UPDATED'});
      if(JSON.stringify(p).length>100000)return send(res,400,{error:'SIGNAL_TOO_LARGE'});
      pushSignal(targetId,{fromId:id,type,payload:p});return send(res,201,{ok:true});
    }
    const voice=path.match(/^\/api\/voice\/([^/]+)\/(join|state|heartbeat|leave)$/);
    if(voice){
      const [,cid,action]=voice;
      const ch=db.prepare("SELECT c.space_id FROM channels c JOIN space_members sm ON sm.space_id=c.space_id WHERE c.channel_id=? AND c.type='voice' AND sm.account_id=?").get(cid,id);
      if(!ch)return send(res,404,{error:'CHANNEL_NOT_FOUND'});
      if((action==='state'&&req.method!=='GET')||(action!=='state'&&req.method!=='POST'))return send(res,405,{error:'METHOD_NOT_ALLOWED'});
      let joined;
      if(action!=='state'){
        const b=await body(req),sid=String(b.sessionId||'');
        if(!sid||sid.length>100)return send(res,400,{error:'INVALID_SESSION'});
        if(action==='join'&&!presence.join(cid,id,sid))return send(res,409,{error:'VOICE_ALREADY_JOINED'});
        if(action==='heartbeat')joined=presence.heartbeat(cid,id,sid);
        if(action==='leave')presence.leave(cid,id,sid);
      }
      const sessions=presence.state(cid),ids=sessions.map(m=>m.accountId);
      const profiles=ids.length?db.prepare(`SELECT account_id AS accountId,username,display_name AS displayName,avatar_url AS avatarUrl,status FROM users WHERE account_id IN (${ids.map(()=>'?').join(',')})`).all(...ids):[];
      return send(res,200,{ok:true,joined,sessions,participants:ids,profiles});
    }

    if(path==='/api/dms'&&req.method==='GET')return send(res,200,{conversations:conversations.listDMs(id)});
    if(path==='/api/dms'&&req.method==='POST'){const b=await body(req);const conversationId=conversations.transaction(()=>conversations.ensureDM(id,String(b.accountId||'')));return send(res,201,{conversationId});}
    const dmMatch=path.match(/^\/api\/dms\/([^/]+)\/messages$/);
    if(dmMatch&&req.method==='GET')return send(res,200,{messages:conversations.messages(id,dmMatch[1])});
    if(dmMatch&&req.method==='POST'){const data=await body(req);return send(res,201,{message:conversations.transaction(()=>conversations.sendMessage(id,dmMatch[1],data))});}
    return send(res,404,{error:'NOT_FOUND'});
  }catch(e){console.error(e);return send(res,e.status||500,{error:e.status?e.message:'INTERNAL_ERROR'});}
}

const mime={'.webmanifest':'application/manifest+json','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon'};
async function staticFile(req,res){let pathname=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);if(pathname==='/')pathname='/index.html';const safe=normalize(pathname).replace(/^([.][.][\\/])+/, '');const file=join(ROOT,safe);try{const info=await stat(file);if(!info.isFile())throw 0;res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':['.html','.js','.css'].includes(extname(file))?'no-cache':'public,max-age=86400'});createReadStream(file).pipe(res);}catch{const html=await readFile(join(ROOT,'index.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(html);}}

const server=http.createServer(async(req,res)=>{if(req.url.startsWith('/api/'))return api(req,res);return staticFile(req,res)});
server.listen(PORT,()=>console.log(`Nightcall running at http://localhost:${server.address().port}`));

