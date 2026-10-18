import crypto from 'node:crypto';
import { db } from './db.js';

const sessions=new Map();

export function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
  const hash=crypto.scryptSync(password,salt,64).toString('hex');
  return {salt,hash};
}
export function verifyPassword(password,salt,hash){
  const actual=crypto.scryptSync(password,salt,64);
  const expected=Buffer.from(hash,'hex');
  return expected.length===actual.length && crypto.timingSafeEqual(expected,actual);
}
export function createSession(userId){
  const token=crypto.randomBytes(32).toString('hex');
  sessions.set(token,{userId,createdAt:Date.now()});
  return token;
}
export function deleteSession(token){ sessions.delete(token); }
export function publicUser(user){
  if(!user)return null;
  return {id:user.id,username:user.username,fullName:user.full_name,role:user.role,active:!!user.active,defaultLocationId:user.default_location_id?Number(user.default_location_id):null,requireLocationChoice:!!user.require_location_choice,canWithdraw:!!user.can_withdraw,canDeposit:!!user.can_deposit};
}
export function allowedLocations(userId){
  return db.prepare('SELECT l.* FROM user_locations ul JOIN locations l ON l.id=ul.location_id WHERE ul.user_id=? AND l.active=1 ORDER BY l.name').all(userId);
}
export function auth(req,res,next){
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  const session=sessions.get(token);
  if(!session)return res.status(401).json({error:'Sesión requerida.'});
  const user=db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.userId);
  if(!user){sessions.delete(token);return res.status(401).json({error:'Usuario no disponible.'})}
  req.user=user; req.token=token; next();
}
export function systemAdmin(req,res,next){
  if(req.user?.role!=='SYSTEM_ADMIN')return res.status(403).json({error:'Solo el administrador del sistema puede realizar esta acción.'});
  next();
}
export function canUseLocation(user,locationId){
  if(user.role==='SYSTEM_ADMIN')return true;
  return !!db.prepare('SELECT 1 FROM user_locations WHERE user_id=? AND location_id=?').get(user.id,locationId);
}
export function canRegisterLocation(user,locationId){
  if(user.role==='SYSTEM_ADMIN')return true;
  if(user.role==='USER')return canUseLocation(user,locationId);
  return !!db.prepare('SELECT 1 FROM locations target WHERE target.id=? AND target.active=1 AND EXISTS (SELECT 1 FROM user_locations ul JOIN locations own ON own.id=ul.location_id WHERE ul.user_id=? AND own.company_id=target.company_id)').get(locationId,user.id);
}
export function registrationLocations(user,companyId){
  if(user.role==='SYSTEM_ADMIN')return db.prepare('SELECT * FROM locations WHERE company_id=? AND active=1 ORDER BY name').all(companyId);
  if(user.role==='LOCAL_ADMIN'){
    const hasCompany=db.prepare('SELECT 1 FROM user_locations ul JOIN locations l ON l.id=ul.location_id WHERE ul.user_id=? AND l.company_id=?').get(user.id,companyId);
    if(!hasCompany)return [];
    return db.prepare('SELECT * FROM locations WHERE company_id=? AND active=1 ORDER BY name').all(companyId);
  }
  return db.prepare('SELECT l.* FROM user_locations ul JOIN locations l ON l.id=ul.location_id WHERE ul.user_id=? AND l.company_id=? AND l.active=1 ORDER BY l.name').all(user.id,companyId);
}
