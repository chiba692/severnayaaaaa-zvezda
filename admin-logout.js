const TZ='Europe/Moscow';
const S={0:null,1:['10:00','17:00'],2:['10:00','17:00'],3:['10:00','17:00'],4:['10:00','17:00'],5:['10:00','17:00'],6:['10:00','16:00']};
const mins=t=>{const m=/^(\d{2}):(\d{2})$/.exec(String(t||''));if(!m)return null;const h=+m[1],n=+m[2];return h<24&&n<60?h*60+n:null};
function dateInfo(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||''));if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],x=new Date(Date.UTC(y,mo-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d?{y,mo,d,x}:null}
function now(){return new Date(new Date().toLocaleString('en-US',{timeZone:TZ}))}
function today(){const d=now();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function validate(date,time,allowPast=false){const di=dateInfo(date),m=mins(time);if(!di||m===null)return 'Некорректные дата или время';if(!allowPast&&date<today())return 'Дата уже прошла';const sch=S[di.x.getUTCDay()];if(!sch)return 'В этот день клиника закрыта';const a=mins(sch[0]),b=mins(sch[1]);if(m<a||m>=b||(m-a)%20)return 'Время не соответствует расписанию';return null}
function type(date){const di=dateInfo(date);return di&&di.x.getUTCDay()===6&&di.d<=7?'traumatologist':'regular'}
function addDays(date,n){const di=dateInfo(date);if(!di)return null;const d=new Date(di.x);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function nextFirstSaturday(from=today()){
  for(let i=0;i<40;i++){const ds=addDays(from,i),di=dateInfo(ds);if(di&&di.x.getUTCDay()===6&&di.d<=7)return ds}
  return null;
}
module.exports={TZ,S,mins,dateInfo,now,today,validate,type,addDays,nextFirstSaturday};
