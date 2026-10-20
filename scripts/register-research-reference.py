"""Copy an explicitly selected historical report into the local service library."""
import argparse,json,os,re
from pathlib import Path

def register(source,ident,title,date,hints,root=None):
 if not re.fullmatch(r'[a-z0-9-]{1,64}',ident):raise ValueError('Invalid reference identifier')
 source=Path(source).resolve()
 if source.suffix.lower()!='.md' or source.stat().st_size>500000:raise ValueError('Expected Markdown, at most 500 KB')
 from report_harness import redact,atomic
 root=root or Path.home()/'Library/Application Support/OPCTechBridge/ReportService'
 folder=root/'reference-library';folder.mkdir(parents=True,exist_ok=True,mode=0o700)
 target=folder/(ident+'.md');text=redact(source.read_text());target.write_text(text);os.chmod(target,0o600)
 catalog=root/'research-reference-catalog.json'
 data=json.loads(catalog.read_text()) if catalog.exists() else {'references':[]}
 item={'id':ident,'title':title,'date':date,'entityHints':hints,'path':str(target)}
 data['references']=[r for r in data['references'] if r.get('id')!=ident]+[item];atomic(catalog,data)
 return {'registered':True,'id':ident,'characters':len(text)}
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source');parser.add_argument('--id',required=True);parser.add_argument('--title',required=True);parser.add_argument('--date',required=True);parser.add_argument('--entity',action='append',required=True);a=parser.parse_args()
 print(json.dumps(register(a.source,a.id,a.title,a.date,a.entity),ensure_ascii=False))
