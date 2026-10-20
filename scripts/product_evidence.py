"""Explicit manufacturer-field adapter. Values stay exact, scoped to one product block."""
import re
FIELDS=['自由度','传动方式','重量','最大负载','五指最大抓握力','控制接口']
def linker_fields(sources):
 rows=[]
 for source in sources:
  if source.get('kind')!='manufacturer':continue
  text=source.get('text','');matches=list(re.finditer(r'^\s*Linker Hand ([A-Z]\d+(?:[ \t]+(?:Lite|Pro))?)[ \t]*$',text,re.M))
  for i,m in enumerate(matches):
   block=text[m.end():matches[i+1].start() if i+1<len(matches) else len(text)];fields={};quotes={}
   for name in FIELDS:
    found=re.search(r'^\s*'+re.escape(name)+r'：([^\n]+)',block,re.M)
    if found:fields[name]=found[1].strip();quotes[name]=found[0].strip()
   if len(fields)>=4:rows.append({'model':m[1],'sourceId':source['id'],'fields':fields,'quotes':quotes,'evidenceKind':'manufacturer_claim_not_independently_tested'})
 return rows

def technical_matrix(sources,documents):
 rows=linker_fields(sources)
 if not rows:return '',[]
 def value(row,key):return row['fields'].get(key,'本次未列明').replace('|','／')
 text='### 厂家网页参数逐项摘录\n以下由程序按型号区块提取，保留原文值；不是实测结果。上传资料与网页发生差异时不拼接，须以拟采购硬件版本及正式数据表对版。网页抓取日期见来源索引。\n\n'
 text+='| 型号 | 自由度原文 | 传动原文 | 重量原文 | 来源 |\n| --- | --- | --- | --- | --- |\n'
 for r in rows:text+='| '+r['model']+' | '+value(r,'自由度')+' | '+value(r,'传动方式')+' | '+value(r,'重量')+' | ['+r['sourceId']+'] |\n'
 text+='\n| 型号 | 厂家标称最大负载 | 厂家标称五指抓握力 | 接口原文 | 来源 |\n| --- | --- | --- | --- | --- |\n'
 for r in rows:text+='| '+r['model']+' | '+value(r,'最大负载')+' | '+value(r,'五指最大抓握力')+' | '+value(r,'控制接口')+' | ['+r['sourceId']+'] |\n'
 text+='\n最大负载与抓握力是不同指标，原网页未在这些字段中提供完整工况；不得把标称负载转换成任意姿态安全抓取能力。未把单一型号手册的版本、精度、寿命或试验条件分配给其他型号。\n'
 conflicts=[]
 for doc in documents:
  names=re.findall(r'Linker Hand ([A-Z]\d+(?:[ \t]+(?:Lite|Pro))?)',doc.get('text',''))
  if not names:continue
  row=next((r for r in rows if r['model']==names[0]),None)
  if not row:continue
  raw=doc['text'];m=re.search(r'(?:重量|整机)[^。\n]{0,20}?(\d[\d,]*(?:\.\d+)?\s*g)\b',raw.replace('\n',' '))
  if m and '重量' in row['fields']:
   a=re.sub(r'[^0-9.]','',m[1]);b=re.sub(r'[^0-9.]','',row['fields']['重量'])
   if a and b and float(a)!=float(b):conflicts.append((row['model'],m[1],doc['id'],row['fields']['重量'],row['sourceId']))
 if conflicts:
  text+='\n### 同型号资料差异（签约前对版）\n\n| 型号 | 上传资料重量 | 网页重量 | 判断 |\n| --- | --- | --- | --- |\n'
  for model,old,did,new,wid in conflicts:text+='| '+model+' | '+old+' ['+did+'] | '+new+' ['+wid+'] | 两份厂家资料不一致；不能自行判定为同硬件修订版 |\n'
 return text,rows
