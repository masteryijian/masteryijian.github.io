export function visitCommunication(payload,customerId='',createdAt=new Date().toISOString()) {
  if(!payload?.visit || typeof payload.visit.id!=='string' || !Array.isArray(payload.clips))throw new Error('请选择本机拜访控制台导出的证据 JSON');
  const v=payload.visit;
  if(!v.customer || payload.clips.length>1000)throw new Error('拜访客户或片段数量无效');
  const text=value=>typeof value==='string'?value:'';
  const lines=payload.clips.map(c=>`[片段 ${c.id} ${text(c.started_at)} · ASR未逐字复核]\n${text(c.transcript)}`);
  let summary=null;if(v.summary_json){summary=JSON.parse(v.summary_json);if(!summary || typeof summary!=='object')throw new Error('整合结果格式无效');}
  const notes=`现场拜访资料 · 专有业务证据，来源不代表已独立验证。\n${text(v.focus)}\n\n[模型整合·待确认]\n${text(summary?.summary)}\n\n[原始转写]\n${lines.join('\n\n')}`;
  if(notes.length>48000)throw new Error('拜访资料超过48000字符，请按独立拜访拆分，不会静默截断');
  const actions=(Array.isArray(summary?.action_items)?summary.action_items:[]).filter(a=>typeof a.task==='string').map(a=>a.task);
  // Deterministic revision ID preserves previously confirmed notes and makes repeat imports idempotent.
  let hash=2166136261;for(const ch of notes){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  const id=`visit:${v.id}:${(hash>>>0).toString(16)}`;
  const record={id,title:`${v.customer} · 客户拜访`,customerId,date:text(v.created_at).slice(0,10),notes,state:'pending',nextAction:actions.join('；'),due:'',source:`本机Qwen ASR → GPT OSS 20B；拜访 ${v.id}；片段 ${payload.clips.map(c=>c.id).join(',')}；CRM候选待人工确认`,createdAt};
  if(record.id.length>200 || record.source.length>50000 || record.nextAction.length>50000)throw new Error('拜访字段过长');
  return record;
}
export function mergeVisitCommunication(workspace,record){
  if(workspace.communications.some(c=>c.id===record.id))return {workspace,added:false};
  return {workspace:{...workspace,communications:[record,...workspace.communications]},added:true};
}
