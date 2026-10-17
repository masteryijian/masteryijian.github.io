import test from 'node:test';
import assert from 'node:assert/strict';
import {contextCatalog,selectedContext} from '../tools/market-report/private-context.mjs';
const crm={customers:[{id:'a',company:'测试甲',notes:'专有需求'},{id:'b',company:'测试乙',notes:'不能串客户'}]};
const workbench={resources:[{id:'p',kind:'product',title:'传感器',notes:'特定接口',source:'厂家资料'},{id:'person',kind:'person',title:'联系人'}],communications:[{id:'ca',customerId:'a',notes:'现场预算约束',state:'pending'},{id:'cb',customerId:'b',notes:'其他客户私有情况',state:'confirmed'}]};
test('only selected customer/product and exact related communications enter assessment',()=>{
 const catalog=contextCatalog(crm,workbench);assert.equal(catalog.products.length,1);
 const selected=selectedContext(catalog,{customerId:'a',productIds:['p']});
 assert.equal(selected.customer.evidenceId,'PRIVATE:customer:a');assert.equal(selected.communications.length,1);assert.equal(selected.communications[0].id,'ca');assert.ok(!JSON.stringify(selected).includes('其他客户私有情况'));
});
test('no selection means no implicit disclosure of private CRM',()=>{const s=selectedContext(contextCatalog(crm,workbench));assert.equal(s.customer,null);assert.equal(s.products.length,0);assert.equal(s.communications.length,0);});
test('visit transcripts retain source IDs and unreviewed ASR evidence status',()=>{
 const s=selectedContext(contextCatalog(null,null),{visit:{visit:{id:'v',customer:'实机测试',created_at:'2026-10-17'},clips:[{id:12,transcript:'需要样机',transcription_status:'done'}]}});
 assert.equal(s.visit.clips[0].evidenceId,'PRIVATE:visit:v:clip:12');assert.match(s.visit.evidenceType,/未经逐字人工复核/);
});
test('missing records and oversized context fail rather than mixing or truncating',()=>{
 assert.throws(()=>selectedContext(contextCatalog(crm,workbench),{customerId:'missing'}));
 assert.throws(()=>contextCatalog({customers:[{id:'a',company:'A',notes:'a'.repeat(50001)}]},null));
});

import {verifyPrivateCitations} from '../tools/market-report/private-context.mjs';
test('source IDs tolerate typographic hyphens but reject invented or missing selected evidence',()=>{
 const evidence=selectedContext(contextCatalog({customers:[{id:'a-b',company:'测试'}]},workbench),{customerId:'a-b',productIds:['p']});
 const result=verifyPrivateCitations('依据 PRIVATE:customer:a‑b 与 PRIVATE:product:p。',evidence);
 assert.match(result.report,/PRIVATE:customer:a-b/);
 assert.throws(()=>verifyPrivateCitations('依据 PRIVATE:customer:invented',evidence),/未知/);
 assert.throws(()=>verifyPrivateCitations('仅依据 PRIVATE:customer:a-b',evidence),/产品/);
});

test('cross-customer visit evidence is explicitly identified rather than attributed to the selected buyer',()=>{const c=selectedContext(contextCatalog(crm,workbench),{customerId:'a',visit:{visit:{id:'v',customer:'测试乙'},clips:[]}});assert.match(c.relationshipWarning,/不能把他人的反馈/);});
