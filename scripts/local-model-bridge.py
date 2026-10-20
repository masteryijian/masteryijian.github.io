"""Loopback-only LM Studio bridge for the user's GitHub Pages origin. No cloud calls."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request, urllib.error, json, sqlite3
from pathlib import Path
from urllib.parse import urlsplit
ROOT = Path(__file__).resolve().parent.parent / "tools" / "market-report"
ALLOWED = {'https://masteryijian.github.io', 'http://localhost:4182', 'http://127.0.0.1:4182', 'http://localhost:4183', 'http://127.0.0.1:4183'}
class Handler(BaseHTTPRequestHandler):
    def allowed(self):
        return self.headers.get('Origin') in ALLOWED or not self.headers.get('Origin')
    def headers_out(self, status):
        self.send_response(status)
        origin = self.headers.get('Origin')
        if origin in ALLOWED:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Type','application/json')
        self.send_header('Cache-Control','no-store')
    def send_json(self,value,status=200):
        body=json.dumps(value,ensure_ascii=False).encode()
        self.headers_out(status);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if not self.allowed():self.send_error(403);return
        path=urlsplit(self.path).path
        if path=='/api/research/references':
            from report_harness import reference_catalog
            self.send_json({'references':[{k:r.get(k) for k in ('id','title','date')} for r in reference_catalog()]});return
        if path=='/api/research/jobs':
            from report_harness import ROOT as RESEARCH_ROOT,load_job,public_view
            rows=[]
            for item in RESEARCH_ROOT.glob('*.json'):
                job=load_job(item.stem)
                if job and job.get('status')!='superseded':rows.append({'id':job['id'],'product':job['profile'].get('product','项目'),'status':public_view(job)['status'],'createdAt':job['createdAt'],'completedChapters':len(job.get('chapters',[])),'totalChapters':13})
            self.send_json({'jobs':sorted(rows,key=lambda r:r['createdAt'],reverse=True)[:30]});return
        if path=='/api/research/job':
            from urllib.parse import parse_qs
            from report_harness import load_job,public_view
            ident=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
            job=load_job(ident)
            if job is None:self.send_json({'error':'research_job_not_found'},404);return
            self.send_json(public_view(job));return
        runtime=Path.home()/'Library/Application Support/OPCTechBridge'
        if path=='/api/context':
            customers=[];visits=[]
            crm=runtime/'opc.db'
            if crm.is_file():
                with sqlite3.connect('file:'+str(crm)+'?mode=ro',uri=True) as db:
                    db.row_factory=sqlite3.Row
                    customers=[{**dict(r),'id':'local:'+str(r['id']),'kind':'customer','updatedAt':r['updated_at']} for r in db.execute('SELECT id,company,contact,sector,stage,notes,source,updated_at FROM customers')]
            source=runtime/'VisitCapture/data/voice.db'
            if source.is_file():
                with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as db:
                    db.row_factory=sqlite3.Row
                    visits=[dict(r) for r in db.execute('SELECT v.id,v.customer,v.focus,v.created_at,count(c.clip_id) AS clip_count FROM visits v LEFT JOIN visit_clips c ON c.visit_id=v.id GROUP BY v.id ORDER BY v.created_at DESC LIMIT 200')]
            self.send_json({'customers':customers,'visits':visits});return
        if path=='/api/visit-evidence':
            from urllib.parse import parse_qs
            vid=parse_qs(urlsplit(self.path).query).get('id',[''])[0]
            source=runtime/'VisitCapture/data/voice.db'
            if not source.is_file():self.send_error(404);return
            with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as db:
                db.row_factory=sqlite3.Row
                visit=db.execute('SELECT id,customer,focus,created_at FROM visits WHERE id=?',(vid,)).fetchone()
                if not visit:self.send_error(404);return
                count=db.execute('SELECT count(*) FROM visit_clips WHERE visit_id=?',(vid,)).fetchone()[0]
                if count>1000:self.send_json({'error':'拜访超过1000片段，请拆分；不会截断'},413);return
                clips=[dict(r) for r in db.execute('SELECT c.id,c.started_at,c.device_name,c.transcript,c.transcription_status FROM clips c JOIN visit_clips v ON v.clip_id=c.id WHERE v.visit_id=? ORDER BY c.id',(vid,))]
                self.send_json({'visit':dict(visit),'clips':clips});return
        # Only exact public application assets may be served. Never expose .git or private runtime files.
        assets={('/tools/market-report/'+name):ROOT/name for name in ['index.html','app.js','styles.css','engine.mjs','local-engine.mjs','render.mjs','private-context.mjs','research-client.mjs']}
        assets['/tools/crm/model.js']=ROOT.parent/'crm/model.js'
        assets['/tools/workbench-model.js']=ROOT.parent/'workbench-model.js'
        target=assets.get(path)
        if target is None:self.send_error(404);return
        body=target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8' if target.suffix=='.html' else 'text/css' if target.suffix=='.css' else 'text/javascript; charset=utf-8')
        self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def do_OPTIONS(self):
        if not self.allowed(): self.send_error(403); return
        self.headers_out(204)
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','content-type')
        self.send_header('Content-Length','0')
        self.end_headers()
    def do_POST(self):
        if not self.allowed(): self.send_error(403); return
        if self.path not in {'/v1/chat/completions','/api/report/pdf','/api/research/start','/api/research/resume'}:self.send_error(404);return
        try:
            length = int(self.headers.get('Content-Length',0))
            if length < 1 or length > 2000000: self.send_error(413); return
            raw = self.rfile.read(length)
            data = json.loads(raw)
            if self.path=='/api/research/resume':
                from report_harness import resume_job
                try:self.send_json(resume_job(data.get('id','')),202)
                except ValueError:self.send_json({'error':'research_job_unavailable'},400)
                return
            if self.path=='/api/research/start':
                from report_harness import start_job
                try:self.send_json(start_job(data),202)
                except ValueError:self.send_json({'error':'invalid_or_oversized_research_input'},400)
                return
            if self.path=='/api/report/pdf':
                try:
                    from report_pdf import render_pdf
                    body=render_pdf(data)
                except ImportError:
                    self.send_json({'error':'PDF renderer requires reportlab; use Print / Save PDF meanwhile'},503);return
                except ValueError:
                    self.send_json({'error':'Invalid or oversized report'},400);return
                self.send_response(200)
                origin=self.headers.get('Origin')
                if origin in ALLOWED:self.send_header('Access-Control-Allow-Origin',origin);self.send_header('Vary','Origin')
                self.send_header('Content-Type','application/pdf');self.send_header('Content-Disposition','attachment; filename="techbridge-report.pdf"');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
            payload = {k:data[k] for k in ('model','messages','max_tokens','temperature','stream','response_format') if k in data}
            payload['stream'] = False
            req = urllib.request.Request('http://localhost:1234/v1/chat/completions',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
            with urllib.request.urlopen(req,timeout=900) as response:
                body = response.read()
                self.headers_out(200); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        except urllib.error.HTTPError as error:
            self.headers_out(error.code); self.end_headers(); self.wfile.write(error.read())
        except Exception:
            self.headers_out(502); self.end_headers(); self.wfile.write(b'{"error":"Local LM Studio unavailable"}')
    def log_message(self, *args): pass
if __name__ == '__main__':
    print('Local model bridge: http://localhost:4183/v1 -> LM Studio localhost:1234',flush=True)
    ThreadingHTTPServer(('127.0.0.1',4183),Handler).serve_forever()
