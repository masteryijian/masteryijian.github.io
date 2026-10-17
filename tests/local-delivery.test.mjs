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

import {quarantineUnsupportedStandards} from '../tools/market-report/local-engine.mjs';
test('unsupported standard sentences are withheld in full, known exact IDs remain',()=>{
 const clean='[分析判断]根据资料确认接口和样机测试，其他事项待核实。'.repeat(20);
 const result=quarantineUnsupportedStandards(clean+'需要ISO 10218认证才能出售。核实客户用途。已提供ISO 9001。','企业自述ISO 9001');
 assert.ok(!result.report.includes('认证才能出售'));
 assert.ok(!result.report.includes('ISO 10218'));
 assert.ok(result.report.includes('ISO 9001'));
 assert.ok(result.report.includes('核实客户用途'));
 assert.equal(result.withheld.length,1);
 assert.match(result.withheld[0].text,/认证才能出售/);
});
test('source substring cannot authorize another standard and excessive removals block delivery',()=>{
 const result=quarantineUnsupportedStandards('有依据分析。'.repeat(100)+'ISO 900认证。','ISO 9001');
 assert.equal(result.withheld.length,1);
 assert.throws(()=>quarantineUnsupportedStandards('必须ISO 10218认证。','无标准'),/四分之一/);
});

test('long total report cannot conceal an empty chapter',()=>{
 const report=SECTIONS.map((s,i)=>'## '+s+'\n'+(i===11?'待核实':'具体依据和行动。'.repeat(80))).join('\n\n');
 assert.throws(()=>validateLocalDelivery(report,'资料'),/章节有效论证不足/);
});

import {normalizeSourceText} from '../tools/market-report/local-engine.mjs';
test('PDF compatibility glyph cleanup preserves real repetitions and numbers',()=>{
 assert.equal(normalizeSourceText('灵⼼心巧⼿手（北北京）科技，⼒力力 370g ±0.2mm'),'灵心巧手（北京）科技，力 370g ±0.2mm');
 assert.equal(normalizeSourceText('人人协作 1100'), '人人协作 1100');
});
test('contact details cannot prove registration or source reliability',()=>{
 assert.throws(()=>validateLocalDelivery(base+'\n官网和电话说明企业具备正式注册及运营资质。','资料'),/无效论证/);
 assert.throws(()=>validateLocalDelivery(base+'\n无标准编号引用，符合删除要求。','资料'),/内部校验/);
});
