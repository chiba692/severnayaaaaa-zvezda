const {validate,type,now,today,mins}=require('./_schedule');
const {reply,env,clean}=require('./_util');
const {sendPush}=require('./_push');
const {guardPublicPost}=require('./_public-guard');

function safe(row){
  return{
    id:row.id,owner_name:row.owner_name,pet:row.pet,pet_species:row.pet_species,pet_age:row.pet_age,
    booking_date:row.booking_date,booking_time:String(row.booking_time||'').slice(0,5),booking_type:row.booking_type,
    status:row.status,service:row.service,service_details:row.service_details||{},stay_start:row.stay_start,stay_end:row.stay_end,
    comment:row.comment,created_at:row.created_at,updated_at:row.updated_at,
    client_notice:row.client_notice||null,client_notice_at:row.client_notice_at||null,
    previous_booking_date:row.previous_booking_date||null,
    previous_booking_time:row.previous_booking_time?String(row.previous_booking_time).slice(0,5):null
  }
}

exports.handler=async event=>{
  try{
    const {url,headers}=env(),qs=event.queryStringParameters||{},token=clean(qs.token||qs.t||'',80);
    if(event.httpMethod==='GET'){
      if(!token)return reply(400,{error:'Ссылка на заявку неполная'});
      const r=await fetch(`${url}/rest/v1/bookings?public_token=eq.${encodeURIComponent(token)}&select=*&limit=1`,{headers});
      if(!r.ok)throw Error(await r.text());
      const row=(await r.json())[0];
      if(!row)return reply(404,{error:'Заявка не найдена'});
      return reply(200,{booking:safe(row)});
    }

    if(event.httpMethod==='POST'){
      let b;
      try{b=JSON.parse(event.body||'{}')}catch{return reply(400,{error:'Некорректный запрос'})}
      const tok=clean(b.token,80);
      if(!tok)return reply(400,{error:'Ссылка на заявку неполная'});
      const guard=await guardPublicPost(event,{scope:'booking-action',ipLimit:20,ipWindow:900,key:tok,keyLimit:8,keyWindow:900,maxBytes:5000});
      if(!guard.ok)return reply(guard.status,{error:guard.error});

      const fr=await fetch(`${url}/rest/v1/bookings?public_token=eq.${encodeURIComponent(tok)}&select=*&limit=1`,{headers});
      if(!fr.ok)throw Error(await fr.text());
      const row=(await fr.json())[0];
      if(!row)return reply(404,{error:'Заявка не найдена'});
      if(['completed','no_show','rejected','cancelled'].includes(row.status))return reply(400,{error:'Эту заявку уже нельзя изменить'});

      if(b.action==='cancel'){
        const pr=await fetch(`${url}/rest/v1/bookings?id=eq.${row.id}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({status:'cancelled',client_notice:null,client_notice_at:null,previous_booking_date:null,previous_booking_time:null,updated_at:new Date().toISOString()})});
        if(!pr.ok)throw Error(await pr.text());
        await sendPush({title:'↩️ Клиент отменил запись',body:`${row.owner_name}: ${row.pet}, ${row.booking_date} ${String(row.booking_time).slice(0,5)}`,url:'/admin.html#notifications'});
        return reply(200,{ok:true,status:'cancelled'});
      }

      if(b.action==='reschedule'){
        if(row.service==='inpatient')return reply(400,{error:'Для стационара изменение дат согласуйте с клиникой'});
        const date=String(b.booking_date||''),time=String(b.booking_time||''),err=validate(date,time);
        if(err)return reply(400,{error:err});
        if(date===today()){
          const n=now();if(mins(time)<=n.getHours()*60+n.getMinutes())return reply(400,{error:'Это время уже прошло'});
        }
        const qr=await fetch(`${url}/rest/v1/bookings?booking_date=eq.${encodeURIComponent(date)}&booking_time=eq.${encodeURIComponent(time)}&select=id,status`,{headers});
        if(!qr.ok)throw Error(await qr.text());
        if((await qr.json()).some(x=>String(x.id)!==String(row.id)&&!['rejected','cancelled'].includes(x.status)))return reply(409,{error:'Это время уже занято'});
        const pr=await fetch(`${url}/rest/v1/bookings?id=eq.${row.id}`,{method:'PATCH',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({booking_date:date,booking_time:time,booking_type:type(date),status:'new',client_notice:null,client_notice_at:null,previous_booking_date:null,previous_booking_time:null,updated_at:new Date().toISOString()})});
        if(!pr.ok)throw Error(await pr.text());
        await sendPush({title:'🗓 Клиент перенёс запись',body:`${row.owner_name}: ${row.pet} → ${date} ${time}`,url:'/admin.html#notifications'});
        return reply(200,{ok:true,status:'new'});
      }
      return reply(400,{error:'Неизвестное действие'});
    }
    return reply(405,{error:'Method not allowed'});
  }catch(e){console.error(e);return reply(500,{error:'Не удалось обработать заявку'})}
};
