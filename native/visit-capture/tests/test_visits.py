import json, sqlite3
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from voice_collector.database import connect
from voice_collector.visits import init,lease
from voice_collector.visit_worker import archive_processed
from voice_collector.config import Config
from voice_collector.web import create_app

def test_one_owner_and_fenced_release(tmp_path):
    db=connect(tmp_path/'voice.db');init(db)
    a=lease(db,'acquire','phone',now=100)
    assert a['granted']
    assert not lease(db,'acquire','watch',now=101)['granted']
    assert not lease(db,'renew','phone','wrong',now=102)['granted']
    lease(db,'release','phone','wrong',now=103)
    assert lease(db,'status',now=103)['owner']=='phone'
    lease(db,'request','watch',now=104)
    assert not lease(db,'renew','phone',a['token'],now=105)['granted']
    lease(db,'release','phone',a['token'],now=106)
    b=lease(db,'acquire','watch',now=107)
    assert b['granted'] and b['epoch']>a['epoch']
    lease(db,'release','phone',a['token'],now=108)
    assert lease(db,'status',now=108)['owner']=='watch'

def test_expiry_includes_no_overlap_guard(tmp_path):
    db=connect(tmp_path/'voice.db');init(db)
    lease(db,'acquire','phone',now=100)
    assert not lease(db,'acquire','ipad',now=134)['granted']
    assert lease(db,'acquire','ipad',now=136)['granted']

def test_cleanup_only_after_text_and_structure_are_durable(tmp_path):
    cfg=Config();cfg.storage.data_dir=str(tmp_path);cfg.enrichment.permanently_delete=True
    audio=tmp_path/'audio'/'test.wav';audio.parent.mkdir();audio.write_bytes(b'original')
    db=connect(tmp_path/'voice.db')
    db.execute("INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak,transcript,transcription_status,enrichment_status,summary) VALUES('2026','2026',1000,?,'wav',1,'测试转写','done','failed','')",(str(audio),));db.commit()
    assert not archive_processed(db,cfg,1) and audio.exists()
    db.execute("UPDATE clips SET enrichment_status='done',summary='整理结果' WHERE id=1");db.commit()
    assert archive_processed(db,cfg,1)
    assert not audio.exists()
    assert json.loads((tmp_path/'transcripts/1.json').read_text())['transcript']=='测试转写'
    assert db.execute('SELECT audio_status FROM clips').fetchone()[0]=='deleted'

def test_authenticated_upload_is_idempotent_and_visit_linked(tmp_path):
    config=tmp_path/'config.json';config.write_text(json.dumps({'storage':{'data_dir':str(tmp_path/'data')},'mobile':{'enabled':True,'upload_token':'test-only'}}))
    client=TestClient(create_app(str(config)))
    assert client.get('/api/mobile/console').status_code==401
    headers={'Authorization':'Bearer test-only'}
    visit=client.post('/api/mobile/visits',json={'customer':'设备联调测试（非真实客户）'},headers=headers).json()
    fields={'recorded_at':'2026-10-16T20:00:00Z','duration_ms':'1000','device_id':'test-phone','visit_id':visit['id']}
    first=client.post('/api/mobile/upload',data=fields,files={'audio':('test.wav',b'fake-test-audio','audio/wav')},headers=headers).json()
    second=client.post('/api/mobile/upload',data=fields,files={'audio':('test.wav',b'fake-test-audio','audio/wav')},headers=headers).json()
    assert first['clip_id']==second['clip_id'] and second['duplicate']
    console=client.get('/api/mobile/console',headers=headers).json()
    assert len(console['clips'])==1 and console['visit']['id']==visit['id']


def test_existing_visit_schema_gains_explicit_summary_coverage(tmp_path):
    db=connect(tmp_path/'voice.db')
    db.execute("CREATE TABLE visits(id TEXT PRIMARY KEY,customer TEXT,focus TEXT,created_at TEXT,summary_json TEXT,summary_clip_max INTEGER DEFAULT 0)")
    db.execute("INSERT INTO visits(id,customer) VALUES('v','已有客户')");db.commit()
    init(db)
    assert db.execute("SELECT customer,summary_clip_ids_json FROM visits WHERE id='v'").fetchone()[0]=='已有客户'
    assert 'summary_clip_ids_json' in {r[1] for r in db.execute('PRAGMA table_info(visits)')}


def test_stop_request_does_not_permanently_reserve_the_microphone(tmp_path):
    db=connect(tmp_path/'voice.db');init(db)
    a=lease(db,'acquire','mac',now=100)
    lease(db,'request','stopped',now=101)
    assert not lease(db,'renew','mac',a['token'],now=102)['granted']
    lease(db,'release','mac',a['token'],now=103)
    assert lease(db,'acquire','phone',now=104)['granted']
