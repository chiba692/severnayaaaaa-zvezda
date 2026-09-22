const {validate,type,dateInfo}=require('./_schedule');
const {reply,env,isAdmin,clean,digits}=require('./_util');
const SERVICES=['exam','ultrasound','xray','vaccination','tests','inpatient','other'];
const STATUSES=['new','accepted','arrived','in_progress','completed','rejected','no_show','cancelled'];

function details(s,d){
  d=d&&typeof d==='object'?d:{};
  if(s==='vaccination')return{vaccine_type:clean(d.vaccine_type,30),last_vaccine_date:d.last_vaccine_date||null};
  if(['ultrasound','xray'].includes(s))return{area:clean(d.area,120)};
  if(s==='tests')return{test_type:clean(d.test_type,30)};
  if(s==='inpatient')return{care:clean(d.care,500)};
  if(s==='other')return{reason:clean(d.reason,200)};
  return{};
}
function time5(v){return String(v||'').slice(0,5)}
function whenText(row){
  if(row.service==='inpatient')return`${row.stay_start||row.booking_date} — ${row.stay_end||'?'}`;
  return`${row.booking_date} в ${time5(row.booking_time)}`;
}

exports.handler=async event=>{
  if(event.httpMethod!=='POST')return reply(405,{error:'Method not allowed'});
  if(!isAdmin(event))return reply(401,{error:'Требуется авторизация'});
  try{
    const b=JSON.parse(event.body||'{}'),{url,headers}=env();
    if(b.action==='delete'){
      if(!b.id)return reply(400,{error:'Не указана заявка'});
      const r=await fetch(`${url}/rest/v1/bookings?id=eq.${encodeURIComponent(b.id)}`,{method:'DELETE',headers});
      if(!r.ok)throw Error(await r.text());
      return reply(200,{ok:true});
    }
    if(b.action==='status'){
      if(!b.id||!STATUSES.includes(b.status))return reply(400,{error:'Некорректный статус'});
      const patch={status:b.status,updated_at:new Date().toISOString()};
      if(b.status==='arrived')patch.checked_in_at=new Date().toISOString();
      if(b.status==='in_progress')patch.started_at=new Date().toISOString();
      if(b.status==='completed')patch.completed_at=new Date().toISOString();
      const r=await fetch(`${url}/rest/v1/bookings?id=eq.${encodeURIComponent(b.id)}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(patch)});
      if(!r.ok)throw Error(await r.text());
      return reply(200,{ok:true});
    }
    if(b.action==='note'){
      if(!b.id)return reply(400,{error:'Не указана заявка'});
      const r=await fetch(`${url}/rest/v1/bookings?id=eq.${encodeURIComponent(b.id)}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({admin_note:clean(b.admin_note,1000)||null,updated_at:new Date().toISOString()})});
      if(!r.ok)throw Error(await r.text());
      return reply(200,{ok:true});
    }
    if(['create','edit'].includes(b.action)){
      const owner_name=clean(b.owner_name,100),phone=clean(b.phone,40),phone_norm=digits(phone),pet=clean(b.pet,100),pet_species=clean(b.pet_species,20)||'other',pet_age=clean(b.pet_age,40),service=clean(b.service,30)||'exam',comment=clean(b.comment,700),admin_note=clean(b.admin_note,1000),service_details=details(service,b.service_details);
      if(!owner_name||!phone||!pet||!SERVICES.includes(service))return reply(400,{error:'Заполните обязательные поля'});
      if(phone_norm.length<10||phone_norm.length>15)return reply(400,{error:'Проверьте номер телефона'});

      let oldRow=null;
      if(b.action==='edit'){
        if(!b.id)return reply(400,{error:'Не указана заявка'});
        const oldR=await fetch(`${url}/rest/v1/bookings?id=eq.${encodeURIComponent(b.id)}&select=*&limit=1`,{headers});
        if(!oldR.ok)throw Error(await oldR.text());
        oldRow=(await oldR.json())[0];
        if(!oldRow)return reply(404,{error:'Заявка не найдена'});
      }

      let booking_date=String(b.booking_date||''),booking_time=String(b.booking_time||''),stay_start=b.stay_start?String(b.stay_start):null,stay_end=b.stay_end?String(b.stay_end):null;
      const inpatient=service==='inpatient';
      if(inpatient){
        if(!dateInfo(stay_start)||!dateInfo(stay_end)||stay_end<stay_start)return reply(400,{error:'Проверьте даты стационара'});
        booking_date=stay_start;booking_time='00:00';
      }else{
        const err=validate(booking_date,booking_time,true);if(err)return reply(400,{error:err});
        const qr=await fetch(`${url}/rest/v1/bookings?booking_date=eq.${encodeURIComponent(booking_date)}&booking_time=eq.${encodeURIComponent(booking_time)}&select=id,status`,{headers});
        if(!qr.ok)throw Error(await qr.text());
        const conflicts=(await qr.json()).filter(x=>String(x.id)!==String(b.id||'')&&!['rejected','cancelled'].includes(x.status));
        if(conflicts.length)return reply(409,{error:'Это время уже занято'});
      }

      const payload={owner_name,phone,phone_norm,pet,pet_species,pet_age:pet_age||null,booking_date,booking_time,comment:comment||null,admin_note:admin_note||null,booking_type:type(booking_date),service,service_details,stay_start:inpatient?stay_start:null,stay_end:inpatient?stay_end:null,updated_at:new Date().toISOString()};

      if(oldRow){
        const oldWhen=whenText(oldRow),newWhen=whenText(payload);
        if(oldWhen!==newWhen){
          payload.previous_booking_date=oldRow.booking_date||null;
          payload.previous_booking_time=oldRow.service==='inpatient'?null:time5(oldRow.booking_time)||null;
          payload.client_notice=`Клиника изменила время записи. Было: ${oldWhen}. Теперь: ${newWhen}.`;
          payload.client_notice_at=new Date().toISOString();
        }
      }

      let r;
      if(b.action==='create'){
        payload.status='accepted';
        r=await fetch(`${url}/rest/v1/bookings`,{method:'POST',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(payload)});
      }else{
        r=await fetch(`${url}/rest/v1/bookings?id=eq.${encodeURIComponent(b.id)}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify(payload)});
      }
      if(!r.ok){
        const t=await r.text();
        if(r.status===409||t.includes('23505'))return reply(409,{error:'Это время уже занято'});
        throw Error(t);
      }
      return reply(200,{ok:true,schedule_changed:!!payload.client_notice});
    }
    return reply(400,{error:'Неизвестное действие'});
  }catch(e){console.error(e);return reply(500,{error:'Не удалось изменить заявку'})}
};
