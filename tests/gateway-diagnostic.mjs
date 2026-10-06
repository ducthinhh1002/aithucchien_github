// Diagnostic metadata only. No keys, provider body, or health data are logged.
import { createApp } from '../server/app.js';
const server=createApp({serveDist:false,onPlanValidationFailure:(safe)=>console.log('Plan schema metadata',JSON.stringify(safe)),fetchImpl:async (...args)=>{
  try { return await fetch(...args); }
  catch(error) { console.log('Connection error metadata', JSON.stringify({name:error.name,code:error.code,causeCode:error.cause?.code})); throw error; }
}}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
try {
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api/meal-plan`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:{age:25,weight:65,height:170,sex:'male',goal:'maintain',activity:'high',sports:['Chạy bộ'],sessionMinutes:60,bodyCondition:'Khỏe mạnh, tập đều'},preferences:'Món Việt dễ nấu.',allergies:'',avoidIngredients:'',days:Number(process.env.TEST_PLAN_DAYS||3)})});
 const data=await res.json(); console.log('Result metadata',JSON.stringify({status:res.status,errorCode:data.error?.code,dayCount:data.days?.length}));
} finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
