import test from 'node:test';import assert from 'node:assert/strict';import {validateLocalDelivery} from '../tools/market-report/local-engine.mjs';import {SECTIONS} from '../tools/market-report/engine.mjs';
const base=SECTIONS.map(s=>'## '+s+'\n'+'[待核实]仅依据已提供资料给出条件化判断。'.repeat(25)).join('\n');
test('local delivery rejects invented standards and unconditional compliance claims',()=>{
 assert.throws(()=>validateLocalDelivery(base+'\n必须符合 IEC 61131-3。','客户仅要求接口测试'),/标准编号/);
 assert.throws(()=>validateLocalDelivery(base+'\n工业设备必须符合CE认证。','客户仅要求接口测试'),/强制/);
 assert.ok(validateLocalDelivery(base+'\n应核实CE是否适用于该用途。','原始资料'));
});
test('local delivery requires all revised chapters',()=>assert.throws(()=>validateLocalDelivery('## 执行结论\n摘要','原始资料'),/章节/));

test('numbered or bold section headings normalize without accepting missing chapters',()=>{const numbered=base.replace(/^## (.+)$/gm,'## 01. **$1**');assert.ok(validateLocalDelivery(numbered,'原始资料').includes('## 执行结论'));});

import {parseStructuredReport} from '../tools/market-report/local-engine.mjs';
test('structured revision produces canonical complete chapters and rejects missing fields',()=>{assert.ok(parseStructuredReport(JSON.stringify(Object.fromEntries(SECTIONS.map(s=>[s,'有证据的判断'])))).startsWith('## 执行结论'));assert.throws(()=>parseStructuredReport('{"执行结论":"摘要"}'),/未返回/);});
