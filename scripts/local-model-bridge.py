"""Loopback-only LM Studio bridge for the user's GitHub Pages origin. No cloud calls."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import urllib.request, urllib.error, json
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
    def do_GET(self):
        # Serve only the public assessment UI, never repository internals or personal files.
        path = urlsplit(self.path).path
        name = path.removeprefix('/tools/market-report/')
        if name not in {'index.html','app.js','styles.css','engine.mjs','local-engine.mjs','render.mjs'} or not path.startswith('/tools/market-report/'):
            self.send_error(404); return
        body = (ROOT / name).read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8' if name.endswith('.html') else 'text/css' if name.endswith('.css') else 'text/javascript; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self):
        if not self.allowed(): self.send_error(403); return
        self.headers_out(204)
        self.send_header('Access-Control-Allow-Methods','POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','content-type')
        self.send_header('Content-Length','0')
        self.end_headers()
    def do_POST(self):
        if not self.allowed(): self.send_error(403); return
        if self.path != '/v1/chat/completions': self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length',0))
            if length < 1 or length > 2000000: self.send_error(413); return
            raw = self.rfile.read(length)
            data = json.loads(raw)
            payload = {k:data[k] for k in ('model','messages','max_tokens','temperature','stream') if k in data}
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
