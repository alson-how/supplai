import { scryptSync, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
export function hashPassword(password:string,salt:string){return scryptSync(password,salt,keyLength).toString('hex');}
export function verifyPassword(password:string,salt:string,expectedHash:string){const candidate=Buffer.from(hashPassword(password,salt),'hex');const expected=Buffer.from(expectedHash,'hex');return candidate.length===expected.length&&timingSafeEqual(candidate,expected);}
