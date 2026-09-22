const {verifySession}=require('./_auth');
const reply=(statusCode,body,extra={})=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra},body:JSON.stringify(body)});
const clean=(v,n=200)=>String(v??'').trim().slice(0,n);
function env(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;if(!url||!key)throw Error('Supabase environment variables are missing');return{url,key,headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`}}}
function isAdmin(event){return verifySession(event)}
function digits(v){return String(v||'').replace(/\D/g,'')}
module.exports={reply,clean,env,isAdmin,digits};
