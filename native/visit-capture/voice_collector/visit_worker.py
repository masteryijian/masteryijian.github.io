import json,os,time,signal,argparse,threading
from pathlib import Path
from datetime import datetime,timezone
from .config import load_config
from .database import connect
from .visits import init
from .enricher import call_lmstudio

def archive_processed(db,cfg,clip_id):
    row=dict(db.execute('SELECT * FROM clips WHERE id=?',(clip_id,)).fetchone())
    if row['transcription_status']!='done' or not str(row['transcript'] or '').strip():return False
    if row['enrichment_status']!='done' or not row['summary']:return False
    folder=cfg.data_dir/'transcripts';folder.mkdir(exist_ok=True)
    target=folder/f'{clip_id}.json';temp=target.with_suffix('.tmp')
    with temp.open('w') as f:
        json.dump({k:v for k,v in row.items() if k not in ['audio_path','original_audio_path']},f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
    os.replace(temp,target)
    fd=os.open(folder,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
    if cfg.enrichment.permanently_delete:
        audio=Path(row['audio_path'])
        if audio.is_file() and (cfg.data_dir/'audio').resolve() in audio.resolve().parents:
            audio.unlink();db.execute("UPDATE clips SET audio_status='deleted' WHERE id=?",(clip_id,));db.commit()
    return True

def run(config):
    cfg=load_config(config);db=connect(cfg.data_dir/'voice.db');init(db)
    # Manual retry remains available; never delete failed/unstructured clips.
    while True:
        for r in db.execute("SELECT id FROM clips WHERE transcription_status='done' AND enrichment_status='done' AND audio_status='active'").fetchall():archive_processed(db,cfg,r['id'])
        for visit in db.execute('SELECT * FROM visits ORDER BY created_at DESC LIMIT 20').fetchall():
            rows=db.execute("SELECT c.* FROM clips c JOIN visit_clips v ON c.id=v.clip_id WHERE v.visit_id=? AND c.transcription_status='done' AND trim(coalesce(c.transcript,''))<>'' ORDER BY c.id",(visit['id'],)).fetchall()
            ids=[r['id'] for r in rows]
            if not rows or ids==json.loads(visit['summary_clip_ids_json'] or '[]'):continue
            text='\n'.join(f"[片段 {r['id']} {r['started_at']}] {r['transcript']}" for r in rows)
            if len(text)>50000:continue # explicit pending, no silent truncation
            try:
                result=call_lmstudio(cfg,'请用中文整合本次客户拜访。summary分为已确认陈述、客户需求、技术约束、报价问题、未解问题；action_items只提取明确承诺，标注片段编号，不推测CRM阶段或发送消息。客户：'+visit['customer']+'；关注：'+visit['focus']+'\n'+text)
                db.execute('UPDATE visits SET summary_json=?,summary_clip_max=?,summary_clip_ids_json=? WHERE id=?',(json.dumps(result,ensure_ascii=False),rows[-1]['id'],json.dumps(ids),visit['id']));db.commit()
            except Exception:pass
        time.sleep(5)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);run(p.parse_args().config)
