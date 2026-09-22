const crypto=require('crypto');
function verifySession(event){
  const cookies=event.headers.cookie||event.headers.Cookie||'',m=cookies.match(/(?:^|;\s*)admin_session=([^;]+)/);if(!m)return false;
  const [p,s]=m[1].split('.'),secret=process.env.ADMIN_SESSION_SECRET;if(!p||!s||!secret)return false;
  const ex=crypto.createHmac('sha256',secret).update(p).digest('base64url');
  if(s.length!==ex.length||!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(ex)))return false;
  try{const x=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));return x.role==='admin'&&x.exp>Date.now()}catch{return false}
}
module.exports={verifySession};
