"""Authenticated capture arbitration and traceable visit records. No cloud services."""
import time, uuid, json, hmac
from datetime import datetime, timezone
from fastapi import Header, HTTPException
from .database import connect
SCHEMA = """
CREATE TABLE IF NOT EXISTS capture_lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, token TEXT, expires REAL NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0, requested TEXT);
INSERT OR IGNORE INTO capture_lease(id) VALUES(1);
CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,customer TEXT NOT NULL,focus TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,summary_json TEXT,summary_clip_max INTEGER NOT NULL DEFAULT 0,summary_clip_ids_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS visit_clips(clip_id INTEGER PRIMARY KEY,visit_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS upload_receipts(fingerprint TEXT PRIMARY KEY,clip_id INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visit_state(id INTEGER PRIMARY KEY CHECK(id=1),active_visit TEXT);
INSERT OR IGNORE INTO visit_state(id) VALUES(1);
"""
def init(db):
    db.executescript(SCHEMA)
    if 'summary_clip_ids_json' not in {r[1] for r in db.execute('PRAGMA table_info(visits)')}:
        db.execute("ALTER TABLE visits ADD COLUMN summary_clip_ids_json TEXT NOT NULL DEFAULT '[]'");db.commit()

def lease(db, action, owner='', token='', now=None):
    now = time.time() if now is None else now
    if not isinstance(owner,str) or len(owner)>100: raise ValueError('Invalid device identity')
    db.execute('BEGIN IMMEDIATE')
    row = dict(db.execute('SELECT * FROM capture_lease WHERE id=1').fetchone())
    granted = False
    if action == 'request':
        db.execute('UPDATE capture_lease SET requested=? WHERE id=1',(owner,))
    elif action == 'acquire':
        if (not row['owner'] or now > row['expires']+5) and (not row['requested'] or row['requested'] in {owner,'stopped'}):
            db.execute('UPDATE capture_lease SET owner=?,token=?,expires=?,epoch=epoch+1,requested=NULL WHERE id=1',(owner,uuid.uuid4().hex,now+30))
            granted=True
    elif action == 'renew':
        if owner==row['owner'] and token==row['token'] and now < row['expires'] and not (row['requested'] and row['requested']!=owner):
            db.execute('UPDATE capture_lease SET expires=? WHERE id=1',(now+30,));granted=True
    elif action == 'release':
        if owner==row['owner'] and token==row['token']:
            db.execute("UPDATE capture_lease SET owner=NULL,token=NULL,expires=0,requested=CASE WHEN requested='stopped' THEN NULL ELSE requested END WHERE id=1")
    elif action != 'status': raise ValueError('Invalid lease action')
    row = dict(db.execute('SELECT * FROM capture_lease WHERE id=1').fetchone());db.commit()
    return {'granted':granted,'owner':row['owner'],'epoch':row['epoch'],'token':row['token'] if granted else None,'valid_for':18 if granted else 0,'requested':row['requested'],'server_time':now}

def mount(app, cfg):
    path=cfg.data_dir/'voice.db'
    with connect(path) as db:init(db)
    def auth(authorization):
        if not cfg.mobile.enabled or not authorization or not hmac.compare_digest(authorization,'Bearer '+cfg.mobile.upload_token):raise HTTPException(401,'Unauthorized')
    @app.post('/api/mobile/lease')
    def control(body:dict,authorization:str|None=Header(default=None)):
        auth(authorization)
        with connect(path) as db:return lease(db,body.get('action','status'),body.get('owner',''),body.get('token',''))
    @app.get('/api/mobile/visits')
    def visits(authorization:str|None=Header(default=None)):
        auth(authorization)
        with connect(path) as db:
            current=db.execute('SELECT active_visit FROM visit_state WHERE id=1').fetchone()[0]
            return {'active_visit':current,'visits':[dict(r) for r in db.execute('SELECT * FROM visits ORDER BY created_at DESC LIMIT 100')]}
    @app.post('/api/mobile/visits')
    def add_visit(body:dict,authorization:str|None=Header(default=None)):
        auth(authorization)
        customer=str(body.get('customer','')).strip()[:200]
        if not customer:raise HTTPException(400,'客户名称必填')
        vid=uuid.uuid4().hex
        with connect(path) as db:
            db.execute('INSERT INTO visits(id,customer,focus,created_at) VALUES(?,?,?,?)',(vid,customer,str(body.get('focus',''))[:4000],datetime.now(timezone.utc).isoformat()))
            db.execute('UPDATE visit_state SET active_visit=? WHERE id=1',(vid,));db.commit()
        return {'id':vid,'customer':customer}
    @app.get('/api/mobile/console')
    def console(authorization:str|None=Header(default=None)):
        auth(authorization)
        with connect(path) as db:
            active=db.execute('SELECT active_visit FROM visit_state WHERE id=1').fetchone()[0]
            visit=db.execute('SELECT * FROM visits WHERE id=?',(active,)).fetchone()
            rows=db.execute('SELECT c.*,v.visit_id FROM clips c LEFT JOIN visit_clips v ON c.id=v.clip_id WHERE v.visit_id=? ORDER BY c.id DESC LIMIT 50',(active,)).fetchall() if active else []
            clips=[]
            for r in rows:
                c=dict(r);c.pop('audio_path',None);c.pop('original_audio_path',None)
                clips.append(c)
            owner=lease(db,'status')
            owner.pop('token',None)
            return {'lease':owner,'visit':dict(visit) if visit else None,'clips':clips,'asr':cfg.transcription.backend,'llm':cfg.enrichment.model,'privacy':'本地处理；CRM变更仅作为待确认候选'}

    from fastapi.responses import HTMLResponse
    from .visit_ui import HTML
    @app.get('/visit',response_class=HTMLResponse)
    def visit_page():return HTML
    @app.get('/api/visit-console')
    def local_console():return console('Bearer '+cfg.mobile.upload_token)
    @app.post('/api/visit-create')
    def local_create(body:dict):return add_visit(body,'Bearer '+cfg.mobile.upload_token)
    @app.post('/api/capture-request')
    def local_capture(body:dict):
        with connect(path) as db:return lease(db,'request',str(body.get('owner','stopped')))
