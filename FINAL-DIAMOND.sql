const crypto=require('crypto');
const {validate,type,now,today,mins,dateInfo}=require('./_schedule');
const {reply,env,clean,digits}=require('./_util');
const {sendPush}=require('./_push');
const {guardPublicPost}=require('./_public-guard');

const SERVICES={exam:'Осмотр',ultrasound:'УЗИ',xray:'Рентген',vaccination:'Вакцинация',tests:'Анализы',inpatient:'Стационар',other:'Другое'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
function details(s,d){d=d&&typeof d==='object'?d:{};if(s==='vaccination')return{vaccine_type:clean(d.vaccine_type,30),last_vaccine_date:d.last_vaccine_date||null};if(['ultrasound','xray'].includes(s))return{area:clean(d.area,120)};if(s==='tests')return{test_type:clean(d.test_type,30)};if(s==='inpatient')return{care:clean(d.care,500)};if(s==='other')return{reason:clean(d.reason,200)};return{}}
function mapDbError(t=''){
  if(t.includes('DUPLICATE_BOOKING'))return'Такая заявка уже недавно отправлена. Откройте «Мои записи» и проверьте её статус.';
  if(t.includes('BOOKING_RATE_LIMIT'))return'Слишком много заявок с этим номером за короткое время. Подождите немного или позвоните в клинику.';
  return null;
}
exports.handler=async event=>{
  if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
  try{
    let b;try{b=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'Некорректный запрос'})}
    if(clean(b.website,200))return reply(200,{ok:true,id:null,token:crypto.randomBytes(24).toString('hex')});
    const request_id=UUID.test(String(b.request_id||''))?String(b.request_id):null;
    if(!request_id)return reply(400,{error:'Обновите страницу и попробуйте снова'});
    const {url,headers}=env();

    // Idempotency: one browser submission = one booking even after retries.
    const ir=await fetch(`${url}/rest/v1/bookings?request_id=eq.${encodeURIComponent(request_id)}&select=id,public_token,status&limit=1`,{headers});
    if(!ir.ok)throw Error(await ir.text());
    const existing=(await ir.json())[0];
    if(existing)return reply(200,{ok:true,id:existing.id,token:existing.public_token,status:existing.status,idempotent:true});

    const owner_name=clean(b.owner_name,100),phone=clean(b.phone,40),phone_norm=digits(phone),pet=clean(b.pet,100),pet_species=clean(b.pet_species,20)||'other',pet_age=clean(b.pet_age,40),service=clean(b.service,30)||'exam',comment=clean(b.comment,700),service_details=details(service,b.service_details);
    if(!owner_name||!phone||!pet||!SERVICES[service])return reply(400,{error:'Заполните обязательные поля'});
    if(phone_norm.length<10||phone_norm.length>15)return reply(400,{error:'Проверьте номер телефона'});

    let booking_date=String(b.booking_date||''),booking_time=String(b.booking_time||''),stay_start=b.stay_start?String(b.stay_start):null,stay_end=b.stay_end?String(b.stay_end):null;
    const inpatient=service==='inpatient';
    if(inpatient){if(!dateInfo(stay_start)||!dateInfo(stay_end)||stay_end<stay_start||stay_start<today())return reply(400,{error:'Проверьте даты стационара'});booking_date=stay_start;booking_time='00:00'}
    else{const err=validate(booking_date,booking_time);if(err)return reply(400,{error:err});if(booking_date===today()){const n=now();if(mins(booking_time)<=n.getHours()*60+n.getMinutes())return reply(400,{error:'Это время уже прошло'})}}

    // Strong server-side throttling. These counters are atomic in PostgreSQL.
    const guard=await guardPublicPost(event,{scope:'booking',ipLimit:4,ipWindow:600,key:phone_norm,keyLimit:2,keyWindow:1800,maxBytes:12000});
    if(!guard.ok)return reply(guard.status,{error:guard.error});

    // Friendly pre-check for exact/near-identical recent submissions.
    const since=new Date(Date.now()-30*60*1000).toISOString();
    const dr=await fetch(`${url}/rest/v1/bookings?phone_norm=eq.${encodeURIComponent(phone_norm)}&created_at=gte.${encodeURIComponent(since)}&select=id,pet,service,status,public_token,booking_date,booking_time&order=created_at.desc&limit=8`,{headers});
    if(!dr.ok)throw Error(await dr.text());
    const recent=await dr.json();
    const duplicate=recent.find(x=>!['rejected','cancelled'].includes(x.status)&&norm(x.pet)===norm(pet)&&x.service===service);
    if(duplicate)return reply(409,{error:'Похожая заявка уже отправлена недавно. Не создаём дубль — откройте «Мои записи» и проверьте существующую запись.'});

    if(!inpatient){
      const q=await fetch(`${url}/rest/v1/bookings?booking_date=eq.${encodeURIComponent(booking_date)}&booking_time=eq.${encodeURIComponent(booking_time)}&select=id,status`,{headers});
      if(!q.ok)throw Error(await q.text());
      if((await q.json()).some(x=>!['rejected','cancelled'].includes(x.status)))return reply(409,{error:'Это время уже занято. Выберите другое.'});
    }

    const public_token=crypto.randomBytes(24).toString('hex');
    const payload={owner_name,phone,phone_norm,pet,pet_species,pet_age:pet_age||null,booking_date,booking_time,comment:comment||null,booking_type:type(booking_date),status:'new',service,service_details,stay_start:inpatient?stay_start:null,stay_end:inpatient?stay_end:null,public_token,request_id,updated_at:new Date().toISOString()};
    const ins=await fetch(`${url}/rest/v1/bookings`,{method:'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(payload)});
    if(!ins.ok){
      const t=await ins.text(),mapped=mapDbError(t);if(mapped)return reply(t.includes('RATE')?429:409,{error:mapped});
      if(ins.status===409||t.includes('23505'))return reply(409,{error:'Это время уже занято или такая заявка уже отправлена.'});
      throw Error(t);
    }
    const row=(await ins.json())[0],when=inpatient?`${stay_start} — ${stay_end}`:`${booking_date} в ${booking_time}`,visitName=(!inpatient&&type(booking_date)==='traumatologist')?'Приём травматолога':SERVICES[service];
    const push=await sendPush({title:'🐾 Новая заявка — '+visitName,body:`${owner_name}: ${pet}, ${when}`,url:'/admin.html#notifications',badge:1});
    return reply(200,{ok:true,id:row?.id,token:public_token,status:'new',push});
  }catch(e){console.error(e);return reply(500,{error:'Не удалось отправить заявку. Попробуйте позже или позвоните в клинику.'})}
};
