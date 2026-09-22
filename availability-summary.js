const crypto=require('crypto');
const {guardPublicPost}=require('./_public-guard');
const out=(statusCode,body,headers={})=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers},body:JSON.stringify(body)});
function safeEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));if(aa.length!==bb.length)return false;return crypto.timingSafeEqual(aa,bb)}
exports.handler=async event=>{
  if(event.httpMethod!=='POST')return out(405,{error:'Method not allowed'});
  try{
    const guard=await guardPublicPost(event,{scope:'admin-login',ipLimit:8,ipWindow:900,maxBytes:3000});
    if(!guard.ok)return out(guard.status,{error:guard.error});
    const {login,password}=JSON.parse(event.body||'{}'),adminLogin=process.env.ADMIN_LOGIN,adminPassword=process.env.ADMIN_PASSWORD,secret=process.env.ADMIN_SESSION_SECRET;
    if(!adminLogin||!adminPassword||!secret)return out(500,{error:'Сервер авторизации не настроен'});
    if(!safeEqual(login,adminLogin)||!safeEqual(password,adminPassword))return out(401,{error:'Неверный логин или пароль'});
    const payload=Buffer.from(JSON.stringify({role:'admin',exp:Date.now()+604800000})).toString('base64url'),sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url'),token=`${payload}.${sig}`;
    return out(200,{ok:true},{'Set-Cookie':`admin_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`});
  }catch(e){console.error(e);return out(400,{error:'Некорректный запрос'})}
};
