const {reply}=require('./_util');exports.handler=async()=>{const publicKey=process.env.VAPID_PUBLIC_KEY;return publicKey?reply(200,{publicKey}):reply(500,{error:'VAPID public key is missing'})};
