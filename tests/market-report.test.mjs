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
