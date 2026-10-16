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
 const text=n>=2 && n<=4 ? SECTIONS.slice((n-2)*4,(n-1)*4).map(s=>'## '+s+'\n'+'[分析判断]具体证据与待核实任务。'.repeat(60)).join('\n'):'[待核实]资料审阅或交付复核';
 return {ok:true,json:async()=>({id:'local'+n,model:'local',choices:[{finish_reason:'stop',message:{content:text}}]})};};
 const result=await generateLocalReport({endpoint:'http://localhost:4183/v1',model:'local',profile:{product:'测试'},documents:'测试文档',fetchImpl:mock});
 assert.equal(calls.length,5);assert.ok(calls.every(c=>c.url.startsWith('http://localhost:4183/')));assert.ok(calls.every(c=>!c.headers.Authorization && !c.body.tools));assert.equal(result.networkResearchPerformed,false);assert.equal(result.status,'local_draft_pending_external_verification');
});
