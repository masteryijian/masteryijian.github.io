import test from 'node:test';
import assert from 'node:assert/strict';
import {generateReport, responseText, checkReport, SECTIONS} from '../tools/market-report/engine.mjs';
const sources = [{url:'https://example.org/a',title:'A'},{url:'https://example.org/b',title:'B'}];
const report = SECTIONS.map(s=>`## ${s}\n${'判断与证据待人工核对。'.repeat(60)}`).join('\n');
test('incomplete model response cannot become a report',()=>assert.throws(()=>responseText({status:'incomplete',output:[]}),/未完成/));
test('short and missing-section reports fail delivery',()=>{assert.throws(()=>checkReport('摘要',sources),/结构/);assert.throws(()=>checkReport(SECTIONS.map(s=>'## '+s).join('\n'),sources),/过短/);});
test('no successful web search means no report and no synthesis',async()=>{
let calls=0;
const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'事实'}]}]})};};
await assert.rejects(generateReport({key:'test',model:'test',profile:{product:'公开产品'},documents:'资料',fetchImpl}),/实际网络搜索/); assert.equal(calls,2);
});
test('four actual calls precede delivery and credentials never enter audit or search input',async()=>{
const requests=[];
const fetchImpl=async(url,options)=>{const body=JSON.parse(options.body);requests.push(body); const i=requests.length;return {ok:true,json:async()=>({id:'r'+i,status:'completed',output:[...(i===2?[{type:'web_search_call',status:'completed',action:{sources}}]:[]),{type:'message',content:[{type:'output_text',text:i>=3?report:'事实和公开研究'}]}]})};};
const result=await generateReport({key:'secret-test-only',model:'test',profile:{product:'公开产品',customer:'私人客户'},documents:'内部报价123',fetchImpl});
assert.equal(requests.length,4);assert.equal(result.status,'generated_pending_human_review');assert.equal(result.sources.length,2);
assert.ok(!requests[1].input.includes('内部报价'));assert.ok(!requests[1].input.includes('私人客户'));assert.ok(!JSON.stringify(result).includes('secret-test-only'));assert.ok(requests.every(r=>r.store===false));
});
test('oversized files are rejected without truncation or network traffic',async()=>{await assert.rejects(generateReport({key:'test',model:'test',documents:'a'.repeat(180001),fetchImpl:()=>{throw new Error('should not call')}}),/不会静默截断/);});
test('HTTP errors stop immediately',async()=>{await assert.rejects(generateReport({key:'test',model:'test',profile:{},documents:'资料',fetchImpl:async()=>({ok:false,status:401})}),/401/);});

import {renderMarkdown} from '../tools/market-report/render.mjs';
test('report preview renders headings and tables but never executes uploaded HTML',()=>{const html=renderMarkdown('## 执行结论\n<script>alert(1)</script>\n[bad](javascript:alert)\n| A | B |\n| --- | --- |\n| 1 | 2 |');assert.ok(html.includes('<h2>'));assert.ok(html.includes('<table>'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));});

import {localBase, localChat, generateLocalReport} from '../tools/market-report/local-engine.mjs';
test('local mode rejects non-loopback destinations and credential URLs',()=>{
 for(const address of ['https://example.com/v1','http://192.168.1.2/v1','http://user:pass@localhost:1234/v1','http://localhost:1234/wrong']) assert.throws(()=>localBase(address));
 assert.equal(localBase('http://localhost:4183/v1/'),'http://localhost:4183/v1');
});
test('local mode rejects truncated output and does not require a cloud key',async()=>{
 const mock=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'partial'}}]})});
 await assert.rejects(localChat({endpoint:'http://localhost:4183/v1',model:'local',messages:[],fetchImpl:mock}),/未完整/);
});
test('local report makes five local calls and never claims internet verification',async()=>{
 const calls=[];let n=0;
 const mock=async(url,options)=>{calls.push({url,body:JSON.parse(options.body),headers:options.headers});n++;
 const text=n===5?JSON.stringify(Object.fromEntries(SECTIONS.map(s=>[s,'[分析判断]具体证据与待核实任务。'.repeat(60)]))):n>=2 && n<=4?JSON.stringify(Object.fromEntries(SECTIONS.slice((n-2)*4,(n-1)*4).map(s=>[s,'[分析判断]具体证据与待核实任务。'.repeat(60)]))):'[待核实]资料审阅或交付复核';
 return {ok:true,json:async()=>({id:'local'+n,model:'local',choices:[{finish_reason:'stop',message:{content:text}}]})};};
 const result=await generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',profile:{product:'测试'},documents:'测试文档',fetchImpl:mock});
 assert.equal(calls.length,5);assert.ok(calls.every(c=>c.url.startsWith('http://localhost:4183/')));assert.ok(calls.every(c=>!c.headers.Authorization && !c.body.tools));assert.equal(result.networkResearchPerformed,false);assert.equal(result.status,'local_draft_pending_external_verification');
});

 test('structured chapter groups retry only the failed group and final malformed JSON gets repaired',async()=>{
 const calls=[], stages=[];let failedGroup=false,failedFinal=false;
 const mock=async(url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  const required=body.response_format?.json_schema.schema.required;
  let text='资料事实审阅';
  if(required){
   if(required[0]===SECTIONS[8] && required.length===4 && !failedGroup){failedGroup=true;text='## 9. **代理与合作**\n格式不匹配';}
   else if(required.length===12 && !failedFinal){failedFinal=true;text='{';}
   else text=JSON.stringify(Object.fromEntries(required.map(s=>[s,'[分析判断]具体证据与待核实任务。'.repeat(60)])));
  }
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:text}}]})};
 };
 const result=await generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',documents:'测试资料',onStage:(_,text)=>stages.push(text),fetchImpl:mock});
 assert.equal(calls.length,7);
 assert.equal(calls.filter(c=>c.response_format?.json_schema.schema.required[0]===SECTIONS[0] && c.response_format.json_schema.schema.required.length===4).length,1);
 assert.ok(stages.some(s=>s.includes('重新生成第9')));
 assert.ok(result.report.includes('## 最终建议'));
 });
 test('repeated incomplete chapter output stops after one retry',async()=>{
 let calls=0;
 const mock=async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:++calls===1?'资料':'{}'}}]})});
 await assert.rejects(generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',documents:'资料',fetchImpl:mock}),/未返回修订章节/);
 assert.equal(calls,3);
 });

test('repeated invented standards are quarantined transparently after model correction',async()=>{
 let n=0;const bodies=[];
 const mock=async(url,options)=>{
  n++;const body=JSON.parse(options.body);bodies.push(body);
  const sections=body.response_format?.json_schema.schema.required;
  const text=sections?JSON.stringify(Object.fromEntries(sections.map(s=>[s,'[分析判断]样机接口需取得供应商文件和客户测试反馈后决策。'.repeat(25)+(n>=5?'必须ISO 10218认证才能出售。':'')]))):'原始资料审阅';
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:text}}]})};
 };
 const result=await generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',documents:'虚构样机，无标准资料',fetchImpl:mock});
 assert.equal(n,6);assert.equal(result.withheldClaims.length,12);
 assert.ok(!result.report.includes('ISO 10218'));
 assert.ok(!result.report.includes('认证才能出售'));
 assert.ok(result.report.includes('已撤下 12 处'));
 assert.ok(!bodies[5].messages[1].content.includes('ISO 10218'));
});

test('transient failure preserves completed stages and resumes without replay; changed source invalidates cache',async()=>{
 const checkpoint={};let calls=0,fail=true;
 const mock=async(url,options)=>{
  const body=JSON.parse(options.body);calls++;
  const sections=body.response_format?.json_schema.schema.required;
  if(sections?.[0]===SECTIONS[4] && fail)return {ok:false,status:503};
  const text=sections?JSON.stringify(Object.fromEntries(sections.map(s=>[s,'[分析判断]实际资料支持范围与核实步骤。'.repeat(60)]))):'事实';
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:text}}]})};
 };
 const args={endpoint:'http://localhost:4183/v1',model:'local',documents:'资料一',checkpoint,fetchImpl:mock};
 await assert.rejects(generateLocalReport(args),error=>{assert.equal(error.audit.status,'failed_not_delivered');assert.equal(error.audit.stages.length,2);return /503/.test(error.message);});
 assert.equal(calls,4);fail=false;
 const result=await generateLocalReport(args);assert.equal(calls,7);assert.equal(result.stages.filter(s=>s.reused).length,2);
 await generateLocalReport({...args,documents:'资料二'});assert.equal(calls,12);
});
test('authentication failure does not retry or launch final correction',async()=>{
 let calls=0;
 await assert.rejects(generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',documents:'资料',fetchImpl:async()=>{calls++;return {ok:false,status:401};}}),/401/);
 assert.equal(calls,1);
});

test('timeout is not automatically duplicated and carries diagnostic audit',async()=>{
 let calls=0;
 await assert.rejects(generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',documents:'资料',fetchImpl:async()=>{calls++;throw {name:'TimeoutError'};}}),error=>{assert.ok(error.audit);return /超时/.test(error.message);});
 assert.equal(calls,1);
});
