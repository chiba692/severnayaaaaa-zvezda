const fs=require('fs');
const path=require('path');
const vm=require('vm');
const cp=require('child_process');

const root=process.cwd();
const fail=(m)=>{console.error('\n[VALIDATE] ERROR: '+m+'\n');process.exit(1)};
const ok=(m)=>console.log('[VALIDATE] OK: '+m);
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

const required=[
  'index.html','admin.html','booking.html','netlify.toml','package.json',
  'site.webmanifest','admin-manifest.webmanifest','sw.js',
  'icons/site-icon-192.png','icons/site-icon-512.png',
  'icons/admin-icon-192.png','icons/admin-icon-512.png',
  'netlify/functions/send-booking.js','netlify/functions/public-booking.js',
  'netlify/functions/manage-booking.js','netlify/functions/get-bookings.js'
];
for(const f of required){
  if(!fs.existsSync(path.join(root,f))) fail('Нет обязательного файла: '+f);
}
ok('обязательные файлы на месте');

for(const f of ['index.html','admin.html','booking.html']){
  const s=read(f).trimStart().toLowerCase();
  if(!s.startsWith('<!doctype html') && !s.startsWith('<html')) fail(f+' не похож на HTML');
}
ok('HTML-файлы не перепутаны');

for(const f of ['package.json','site.webmanifest','admin-manifest.webmanifest']){
  try{JSON.parse(read(f))}catch(e){fail(f+' содержит невалидный JSON: '+e.message)}
}
ok('JSON и webmanifest валидны');

const pngSig=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
for(const f of required.filter(x=>x.endsWith('.png'))){
  const b=fs.readFileSync(path.join(root,f));
  if(b.length<64 || !b.subarray(0,8).equals(pngSig)) fail(f+' не является корректным PNG');
}
ok('иконки являются PNG');

const jsFiles=[];
function walk(dir){
  for(const n of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,n.name);
    if(n.isDirectory()) walk(p);
    else if(n.isFile() && p.endsWith('.js')) jsFiles.push(p);
  }
}
walk(path.join(root,'netlify','functions'));
jsFiles.push(path.join(root,'sw.js'));
for(const p of jsFiles){
  const r=cp.spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  if(r.status!==0) fail(path.relative(root,p)+' не проходит node --check:\n'+(r.stderr||r.stdout));
}
ok('серверный JavaScript проходит node --check');

for(const f of ['index.html','admin.html','booking.html']){
  const html=read(f);
  const blocks=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
  blocks.forEach((code,i)=>{
    try{new vm.Script(code,{filename:f+'#inline-'+(i+1)})}
    catch(e){fail(f+' содержит синтаксическую ошибку JS: '+e.message)}
  });
}
ok('встроенный JavaScript страниц синтаксически корректен');

const index=read('index.html');
if(/Защита от случайных дублей и спама/i.test(index)) fail('На клиентской странице остался технический блок про антиспам');
if(/Отзывы/i.test(index)) fail('На клиентской странице остался раздел отзывов');
ok('лишние клиентские блоки отсутствуют');

console.log('\n[VALIDATE] PROJECT READY FOR NETLIFY\n');
