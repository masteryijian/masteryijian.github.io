// The loopback service owns durable jobs. Browsers only submit selected input and render progress.
export function researchBase(endpoint='http://localhost:4183/v1'){
 const url=new URL(endpoint);
 if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.port!=='4183'||url.username||url.password||url.search||url.hash)throw new Error('完整研究需连接本机报告服务 http://localhost:4183/v1');
 return url.origin;
}
async function request(base,path,options={},fetchImpl=globalThis.fetch){
 let response;
 try{response=await fetchImpl(base+path,{...options,signal:AbortSignal.timeout(12000)});}catch{throw new Error('浏览器未连接到本机研究服务。请打开本机评估入口；后台已完成的章节会保留。');}
 if(!response.ok)throw new Error('本机研究服务 HTTP '+response.status);
 return response.json();
}
export async function watchResearchJob(id,{endpoint,onUpdate=()=>{},onEvent=()=>{},fetchImpl=globalThis.fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!/^[a-f0-9]{32}$/.test(id))throw new Error('研究任务编号无效');
 const base=researchBase(endpoint);let delivered=0,failures=0;
 for(;;){
  let job;
  try{job=await request(base,'/api/research/job?id='+id,{},fetchImpl);failures=0;}
  catch(error){if(++failures>=3){error.jobId=id;throw error;}await wait(2500*failures);continue;}
  await onUpdate(job);
  const events=job.events||[];for(const event of events.slice(delivered))onEvent(event);delivered=events.length;
  if(job.status==='completed')return job;
  if(['failed','superseded','paused','interrupted'].includes(job.status)){const error=new Error(job.error||'研究未完成；已通过章节保留在本机，可重试接续');error.audit=job;error.jobId=id;throw error;}
  await wait(2500);
 }
}
export async function generateResearchReport({endpoint,profile,documents,onUpdate,onEvent,onJob=()=>{},fetchImpl=globalThis.fetch,wait}){
 const base=researchBase(endpoint);
 const job=await request(base,'/api/research/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,documents})},fetchImpl);
 onJob(job.id);
 return watchResearchJob(job.id,{endpoint,onUpdate,onEvent,fetchImpl,wait});
}
