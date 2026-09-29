import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'nightcall_session';
const DAYS = 30;
const sessionHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const normalizeUsername = (value) => value.trim().replace(/^@/, '').toLowerCase();
export async function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); const derived = await scrypt(password, salt, 64); return `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`; }
export async function verifyPassword(password, encoded) { const [,salt,hex] = encoded.split('$'); if (!salt || !hex) return false; const derived = await scrypt(password, salt, 64); return crypto.timingSafeEqual(Buffer.from(hex,'hex'), Buffer.from(derived)); }
export function setSession(accountId, res) { const token=crypto.randomBytes(32).toString('base64url'); const expires=new Date(Date.now()+DAYS*86400000); db.prepare('INSERT INTO sessions(session_id_hash,account_id,expires_at) VALUES(?,?,?)').run(sessionHash(token),accountId,expires.toISOString()); res.setHeader('Set-Cookie',`${COOKIE}=${token}; Max-Age=${DAYS*86400}; Path=/; HttpOnly; SameSite=Lax`); }
export function clearSession(req,res){ const token=getCookie(req,COOKIE); if(token) db.prepare('DELETE FROM sessions WHERE session_id_hash=?').run(sessionHash(token)); res.setHeader('Set-Cookie',`${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`); }
export function getAccountId(req){ const token=getCookie(req,COOKIE); if(!token)return null; const row=db.prepare('SELECT account_id,expires_at FROM sessions WHERE session_id_hash=?').get(sessionHash(token)); if(!row)return null; if(Date.parse(row.expires_at)<=Date.now()){db.prepare('DELETE FROM sessions WHERE session_id_hash=?').run(sessionHash(token));return null} return row.account_id; }
export function getCookie(req,name){ const raw=req.headers.cookie||''; for(const part of raw.split(';')){const [k,...v]=part.trim().split('=');if(k===name)return decodeURIComponent(v.join('='));}return null; }
