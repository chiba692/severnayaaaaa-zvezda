const crypto=require('crypto');
const {env}=require('./_util');

function bodyTooLarge(event,maxBytes=14000){return Buffer.byteLength(event.body||'','utf8')>maxBytes}
function sameOrigin(event){
  const h=event.headers||{};
  const host=String(h['x-forwarded-host']||h['X-Forwarded-Host']||h.host||h.Host||'').toLowerCase().split(',')[0].trim().split(':')[0];
  const source=h.origin||h.Origin||h.referer||h.Referer||'';
  if(!source)return true; // mobile/PWA requests can legitimately omit Origin/Referer
  if(!host)return false;
  try{return new URL(source).hostname.toLowerCase()===host}catch{return false}
}
function clientIp(event){
  const h=event.headers||{};
  return String(h['x-nf-client-connection-ip']||h['X-Nf-Client-Connection-Ip']||h['x-forwarded-for']||h['X-Forwarded-For']||h['client-ip']||h['Client-Ip']||'unknown').split(',')[0].trim().slice(0,120)
}
function fingerprint(value){
  const secret=process.env.RATE_LIMIT_SECRET||process.env.ADMIN_SESSION_SECRET;
  if(!secret)throw new Error('RATE_LIMIT_SECRET or ADMIN_SESSION_SECRET is required');
  return crypto.createHmac('sha256',secret).update(String(value||'unknown')).digest('hex')
}
async function consume(scope,rawKey,limit,windowSeconds){
  const {url,headers}=env();
  const r=await fetch(`${url}/rest/v1/rpc/consume_public_rate_limit`,{method:'POST',headers,body:JSON.stringify({p_scope:String(scope).slice(0,60),p_key_hash:fingerprint(rawKey),p_limit:Math.max(1,Math.min(100,Number(limit)||1)),p_window_seconds:Math.max(10,Math.min(86400,Number(windowSeconds)||60))})});
  if(!r.ok)throw new Error(`Rate limit backend error ${r.status}: ${await r.text()}`);
  return await r.json()===true
}
async function guardPublicPost(event,{scope='public',ipLimit=8,ipWindow=600,key=null,keyLimit=3,keyWindow=1800,maxBytes=14000}={}){
  if(bodyTooLarge(event,maxBytes))return{ok:false,status:413,error:'Слишком большой запрос'};
  if(!sameOrigin(event))return{ok:false,status:403,error:'Запрос отклонён защитой сайта'};
  const ip=clientIp(event);
  if(!(await consume(`${scope}:ip`,ip,ipLimit,ipWindow)))return{ok:false,status:429,error:'Слишком много запросов с этого устройства. Подождите немного и попробуйте снова.'};
  if(key&&!(await consume(`${scope}:key`,key,keyLimit,keyWindow)))return{ok:false,status:429,error:'Слишком много заявок с этим номером. Проверьте «Мои записи» или позвоните в клинику.'};
  return{ok:true}
}
module.exports={guardPublicPost,sameOrigin,bodyTooLarge,clientIp,fingerprint,consume};
