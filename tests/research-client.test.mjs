import test from 'node:test';import assert from 'node:assert/strict';
import {researchBase,watchResearchJob,generateResearchReport} from '../tools/market-report/research-client.mjs';
const id='a'.repeat(32);
test('research jobs never send documents to a remote endpoint',()=>{
 for(const url of ['https://example.com/v1','http://example.com:4183/v1','http://localhost:1234/v1','http://user:pass@localhost:4183/v1'])assert.throws(()=>researchBase(url));
 assert.equal(researchBase(),'http://localhost:4183');
});
test('resuming a research job only reads status and preserves completed chapters on failure',async()=>{
 let calls=0;const updates=[];
 const fetchImpl=async()=>({ok:true,json:async()=>++calls===1?{id,status:'running',completedChapters:2,report:'已完成正文',events:[{text:'第二章已保存'}]}:{id,status:'failed',completedChapters:2,report:'已完成正文',error:'下一章未通过',events:[]}});
 await assert.rejects(watchResearchJob(id,{fetchImpl,wait:async()=>{},onUpdate:j=>updates.push(j)}),error=>{assert.equal(error.audit.completedChapters,2);assert.equal(error.jobId,id);return true;});
 assert.equal(updates[0].report,updates[1].report);assert.equal(calls,2);
});
test('completed durable jobs are loaded without rerunning a model or a source request',async()=>{
 let calls=0;
 const job=await watchResearchJob(id,{fetchImpl:async(url,options)=>{calls++;assert.ok(url.includes('/api/research/job?id='));assert.equal(options.method,undefined);return {ok:true,json:async()=>({id,status:'completed',report:'完整研究',events:[]})};}});
 assert.equal(job.report,'完整研究');assert.equal(calls,1);
});
test('starting research posts only the selected input and then watches its durable job',async()=>{
 const bodies=[];
 const fetchImpl=async(url,options)=>{if(options.method==='POST'){bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({id,status:'running'})};}return {ok:true,json:async()=>({id,status:'completed',report:'结果',events:[]})};};
 await generateResearchReport({endpoint:'http://localhost:4183/v1',profile:{product:'测试'},documents:'用户选定资料',fetchImpl});
 assert.deepEqual(bodies,[{profile:{product:'测试'},documents:'用户选定资料'}]);
});

test('interrupted and superseded jobs stop polling instead of waiting forever',async()=>{
 for(const status of ['interrupted','superseded'])await assert.rejects(watchResearchJob(id,{fetchImpl:async()=>({ok:true,json:async()=>({id,status,events:[]})}),wait:async()=>{throw new Error('unexpected polling');}}),error=>error.jobId===id);
});
test('table line breaks are allowed while other uploaded markup remains escaped',async()=>{
 const {renderMarkdown}=await import('../tools/market-report/render.mjs');
 const html=renderMarkdown('| 参数 | 说明 |\n| --- | --- |\n| CAN<br>RS485 | <img src=x onerror=alert(1)> |');
 assert.ok(html.includes('CAN<br/>RS485'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
});
