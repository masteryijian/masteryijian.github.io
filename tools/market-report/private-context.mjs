// Explicit selection only. Never infer customer interest or treat ASR text as verified facts.
const string = (v,max=50000) => {if(v==null)return '';if(typeof v!=='string'||v.length>max)throw new Error('专有资料字段无效或过长');return v;};
export function contextCatalog(crm,workbench) {
  const customers=(crm?.customers || []).map(c=>({id:string(c.id,200),company:string(c.company,200),contact:string(c.contact,200),sector:string(c.sector,200),kind:string(c.kind,30),stage:string(c.stage,50),notes:string(c.notes),source:string(c.source,2000),updatedAt:string(c.updatedAt,50)}));
  const products=(workbench?.resources || []).filter(r=>r.kind==='product').map(r=>({id:string(r.id,200),title:string(r.title,500),customerId:string(r.customerId,200),notes:string(r.notes),keywords:string(r.keywords,4000),source:string(r.source,2000),updatedAt:string(r.updatedAt||r.createdAt,50)}));
  const communications=(workbench?.communications || []).map(c=>({id:string(c.id,200),customerId:string(c.customerId,200),title:string(c.title,500),date:string(c.date,50),notes:string(c.notes),nextAction:string(c.nextAction,4000),source:string(c.source,2000),state:string(c.state,50)}));
  return {customers,products,communications};
}
export function selectedContext(catalog,{customerId='',productIds=[],visit=null}={}) {
  const selectedCustomer=catalog.customers.find(c=>c.id===customerId);
  if(customerId&&!selectedCustomer)throw new Error('选定客户不存在，请重新读取CRM');
  const customer=selectedCustomer ? {...selectedCustomer,evidenceId:'PRIVATE:customer:'+encodeURIComponent(selectedCustomer.id),evidenceType:selectedCustomer.kind==='research'?'研究线索，不代表已经拜访、客户关系或采购意向':'客户档案记录，非公开独立验证'} : null;
  const products=productIds.map(id=>{const r=catalog.products.find(p=>p.id===id);if(!r)throw new Error('选定产品不存在');return {...r,evidenceId:'PRIVATE:product:'+encodeURIComponent(r.id),evidenceType:'专有产品资料，需按来源区分厂家自述和现场验证'};});
  const communications=customer ? catalog.communications.filter(c=>c.customerId===customer.id).map(c=>({...c,evidenceId:'PRIVATE:communication:'+encodeURIComponent(c.id),evidenceType:c.state==='confirmed'?'用户已确认纪要（不等于全部陈述已独立验证）':'待人工确认纪要'})) : [];
  let visitEvidence=null;
  if(visit){
    if(!visit.visit || !Array.isArray(visit.clips))throw new Error('拜访资料格式无效');
    visitEvidence={id:string(visit.visit.id,200),customer:string(visit.visit.customer,500),focus:string(visit.visit.focus,4000),date:string(visit.visit.created_at,100),evidenceType:'现场录音的ASR转写，未经逐字人工复核；独有一手线索，不等于客户采购承诺',clips:visit.clips.map(c=>({evidenceId:'PRIVATE:visit:'+encodeURIComponent(string(visit.visit.id,200))+':clip:'+c.id,date:string(c.started_at,100),device:string(c.device_name,200),transcript:string(c.transcript),asrStatus:string(c.transcription_status,50)}))};
  }
  const relationshipWarning=customer && visitEvidence && customer.company.trim()!==visitEvidence.customer.trim() ? '客户档案与所选拜访原客户名称不同；必须作为跨客户参考，不能把他人的反馈、需求或承诺归给本客户。' : '';
  const result={customer,products,communications,visit:visitEvidence,relationshipWarning,usageRule:'只将选中的专有资料用于本次分析。引用证据ID，区分客户陈述、现场观察、ASR待复核、公开事实和AI判断。不能由潜在线索推断成交/认证/采购承诺；专有资料的局限也必须写出。'};
  if(JSON.stringify(result).length>100000)throw new Error('选中的专有资料超过100000字符，请拆分拜访或缩小选择；不会静默截断。');
  return result;
}

export function verifyPrivateCitations(report,evidence) {
  if(!evidence)return {report,cited:[]};
  const expected=[evidence.customer?.evidenceId,...(evidence.products||[]).map(p=>p.evidenceId),...(evidence.communications||[]).map(c=>c.evidenceId),...(evidence.visit?.clips||[]).map(c=>c.evidenceId)].filter(Boolean);
  if(!expected.length)return {report,cited:[]};
  const allowed=new Set(expected),cited=new Set();
  const normalized=report.replace(/PRIVATE:[A-Za-z0-9:%._\-\u2010-\u2015]+/g,raw=>{
    let id=raw.replace(/[\u2010-\u2015]/g,'-');
    if(!allowed.has(id) && id.endsWith('.') && allowed.has(id.slice(0,-1)))id=id.slice(0,-1);
    if(!allowed.has(id))throw new Error('报告引用了未知专有证据编号，未交付：'+id);
    cited.add(id);return id+(raw.endsWith('.')&&!id.endsWith('.')?'.':'');
  });
  if(evidence.customer && !cited.has(evidence.customer.evidenceId))throw new Error('报告未引用所选客户档案，未交付');
  if(evidence.products?.length && !evidence.products.some(p=>cited.has(p.evidenceId)))throw new Error('报告未引用所选产品证据，未交付');
  if(evidence.visit?.clips?.length && !evidence.visit.clips.some(c=>cited.has(c.evidenceId)))throw new Error('报告未引用所选现场拜访，未交付');
  if(!cited.size)throw new Error('报告未引用所选专有业务证据，未交付');
  return {report:normalized,cited:[...cited]};
}
