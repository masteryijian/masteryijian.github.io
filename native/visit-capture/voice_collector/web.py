from __future__ import annotations

import argparse
import hmac
import hashlib
import os
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from .config import load_config
from .database import connect, is_paused, set_paused
from .web_ui import HTML


LEGACY_HTML = """<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width'>
<title>本地人声收集器</title><style>body{font:16px system-ui;max-width:920px;margin:30px auto;padding:0 16px;background:#f5f5f3;color:#222}
.card{background:white;padding:18px;border-radius:14px;margin:12px 0}button{font:inherit;padding:9px 14px;border:0;border-radius:9px;background:#222;color:white}
.danger{background:#a22}audio{width:100%;margin-top:8px}.muted{color:#666;font-size:14px}.text{line-height:1.55;margin-top:10px;white-space:pre-wrap}input{font:inherit;padding:10px;width:min(420px,70%);border:1px solid #bbb;border-radius:9px}</style></head><body>
<h1>本地人声收集器</h1><div class='card' id='status'>读取状态…</div><div class='card'><input id='q' placeholder='搜索标题、摘要或转写文字'><button onclick='refresh()'>搜索</button></div><div id='clips'></div>
<script>async function refresh(){let s=await (await fetch('/api/status')).json();let sv=s.services||{};let line=n=>{let x=sv[n]||{};return `${n}：${x.state||'未知'}${x.pid?' · PID '+x.pid:''} · 重启 ${x.restart_count||0}次`};document.querySelector('#status').innerHTML=`<b>${s.paused?'已暂停':'正在监听'}</b> · 今日 ${s.today_count} 段 · ${(s.today_ms/60000).toFixed(1)} 分钟<br><span class=muted>监管器：${s.supervisor_alive?'正常':'未连接'} · 等待 ${s.pending_count} · 失败 ${s.failed_count} · 磁盘 ${(s.disk_bytes/1048576).toFixed(1)} MB</span><br><br><span class=muted>${line('collector')}<br>${line('web')}<br>${line('transcriber')}</span><br><br><button onclick='toggle(${!s.paused})'>${s.paused?'继续监听':'暂停监听'}</button>`;
document.querySelector('#status').innerHTML+=`<br><span class=muted>LLM：${s.enrichment_enabled?(s.enricher_alive?'正常':'等待 LM Studio'):'未启用'} · 待整理 ${s.enrichment_pending} · 整理失败 ${s.enrichment_failed} · 隔离音频 ${s.quarantined_count}</span>${s.enrichment_enabled?`<br><span class=muted>${line('enricher')}</span>`:''}`;
let q=document.querySelector('#q').value;let cs=await (await fetch('/api/clips?limit=100&q='+encodeURIComponent(q))).json();document.querySelector('#clips').innerHTML=cs.map(c=>`<div class=card><b>${esc(c.title||new Date(c.started_at).toLocaleString())}</b> · ${(c.duration_ms/1000).toFixed(1)} 秒 · <span class=muted>${sourceName(c.device_name)} · ${esc(c.category||'未分类')} · LLM ${c.enrichment_status||'pending'}</span><button class=danger style='float:right' onclick='del(${c.id})'>删除</button>${c.audio_status!=='deleted'?`<audio controls preload=none src='/api/clips/${c.id}/audio'></audio>`:'<div class=muted>音频已删除，文字仍保留</div>'}${c.summary?`<div class=text><b>摘要：</b>${esc(c.summary)}</div>`:''}<div class=text>${esc(c.transcript||statusText(c))}</div>${(c.tags||[]).length?`<div class=muted>标签：${(c.tags||[]).map(esc).join(' · ')}</div>`:''}${(c.action_items||[]).length?`<div class=text><b>待办：</b>${c.action_items.map(x=>esc(x.task)+(x.due_date?' ('+esc(x.due_date)+')':'')).join('；')}</div>`:''}${(c.related||[]).length?`<div class=muted>相关记录：${c.related.map(x=>esc(x.title||('#'+x.id))).join(' · ')}</div>`:''}${c.transcription_status==='failed'?`<button onclick='retry(${c.id})'>重试转写</button>`:''}${c.enrichment_status==='failed'?`<button onclick='retryLLM(${c.id})'>重试整理</button>`:''}</div>`).join('')||'<div class=card>没有匹配的录音。</div>'}
function sourceName(v){if(v==='apple-watch')return 'Apple Watch';if((v||'').startsWith('ipad-'))return 'iPad';if((v||'').startsWith('iphone-')||/^[0-9A-F-]{30,}$/i.test(v||''))return 'iPhone';return 'Mac'}
function esc(v){let d=document.createElement('div');d.textContent=v;return d.innerHTML}function statusText(c){return c.transcription_status==='processing'?'正在转写…':c.transcription_status==='failed'?('转写失败：'+(c.transcription_error||'')):'等待转写…'}
async function toggle(v){await fetch('/api/pause',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paused:v})});refresh()}
async function retry(id){await fetch('/api/clips/'+id+'/retry',{method:'POST'});refresh()}async function retryLLM(id){await fetch('/api/clips/'+id+'/retry-enrichment',{method:'POST'});refresh()}async function del(id){if(confirm('确定删除这段录音和记录？')){await fetch('/api/clips/'+id,{method:'DELETE'});refresh()}}refresh();setInterval(refresh,10000)</script></body></html>"""


def create_app(config_path: str | None = None) -> FastAPI:
    cfg = load_config(config_path)
    db_path = cfg.data_dir / "voice.db"
    app = FastAPI(title="TechBridge Visit Console")
    from .visits import mount
    mount(app, cfg)

    @app.middleware("http")
    async def local_admin_only(request: Request, call_next):
        # LAN binding is needed for iPhone uploads. All administration, audio
        # playback and deletion APIs remain accessible only on this Mac.
        host = request.client.host if request.client else ""
        is_loopback = host in {"127.0.0.1", "::1", "localhost"}
        if not is_loopback and not request.url.path.startswith("/api/mobile/"):
            return JSONResponse({"detail": "Admin API is local-only"}, status_code=403)
        return await call_next(request)

    def require_mobile_token(authorization: str | None) -> None:
        if not cfg.mobile.enabled or not cfg.mobile.upload_token:
            raise HTTPException(503, "Mobile upload is disabled")
        expected = f"Bearer {cfg.mobile.upload_token}"
        if not authorization or not hmac.compare_digest(authorization, expected):
            raise HTTPException(401, "Invalid upload token")

    @app.get("/", response_class=HTMLResponse)
    def index() -> str:
        return HTML

    @app.get("/api/status")
    def status() -> dict:
        with connect(db_path) as db:
            today = datetime.now().astimezone().date().isoformat()
            row = db.execute("SELECT count(*) n,coalesce(sum(duration_ms),0) ms FROM clips WHERE substr(started_at,1,10)=?", (today,)).fetchone()
            beats = {r["service"]: r["updated_at"] for r in db.execute("SELECT service,updated_at FROM heartbeat")}
            def alive(service: str) -> bool:
                if service not in beats:
                    return False
                stamp = datetime.fromisoformat(beats[service]).replace(tzinfo=timezone.utc)
                return (datetime.now(timezone.utc) - stamp).total_seconds() < 30
            queue = db.execute("SELECT sum(transcription_status='pending') pending,sum(transcription_status='failed') failed,"
                               "sum(enrichment_status='pending' AND transcription_status='done') enrichment_pending,"
                               "sum(enrichment_status='failed') enrichment_failed,"
                               "sum(audio_status='quarantined') quarantined FROM clips").fetchone()
            services = {r["service"]: dict(r) for r in db.execute("SELECT service,pid,state,restart_count,started_at,stopped_at,last_exit_code,last_error,updated_at FROM service_processes")}
            roots = (cfg.data_dir / "audio", cfg.data_dir / "audio_quarantine")
            disk = sum(p.stat().st_size for root in roots if root.exists()
                       for p in root.rglob("*") if p.is_file())
            task_counts = {r["status"]: r["n"] for r in db.execute(
                "SELECT status,count(*) n FROM agent_tasks GROUP BY status"
            )}
            return {"paused": is_paused(db), "today_count": row["n"], "today_ms": row["ms"],
                    "asr_backend": cfg.transcription.backend, "asr_model": cfg.transcription.qwen_model if cfg.transcription.backend == "qwen-asr" else cfg.transcription.model,
                    "collector_alive": alive("collector"), "transcriber_alive": alive("transcriber"),
                    "supervisor_alive": alive("supervisor"), "services": services,
                    "pending_count": queue["pending"] or 0, "failed_count": queue["failed"] or 0,
                    "enrichment_enabled": cfg.enrichment.enabled,
                    "enricher_alive": alive("enricher"),
                    "enrichment_pending": queue["enrichment_pending"] or 0,
                    "enrichment_failed": queue["enrichment_failed"] or 0,
                    "quarantined_count": queue["quarantined"] or 0,
                    "codex_enabled": cfg.codex.enabled,
                    "codex_alive": alive("codex_runner"),
                    "task_counts": task_counts,
                    "disk_bytes": disk}

    @app.get("/api/mobile/health")
    def mobile_health(authorization: str | None = Header(default=None)) -> dict:
        require_mobile_token(authorization)
        return {"ok": True, "server_time": datetime.now().astimezone().isoformat(), "version": "0.10.0"}

    @app.post("/api/mobile/upload")
    async def mobile_upload(
        audio: UploadFile = File(...),
        recorded_at: str = Form(...),
        duration_ms: int = Form(...),
        device_id: str = Form("iphone"),
        visit_id: str = Form(""),
        authorization: str | None = Header(default=None),
    ) -> dict:
        require_mobile_token(authorization)
        if duration_ms < 100 or duration_ms > 24 * 60 * 60 * 1000:
            raise HTTPException(400, "Invalid duration")
        try:
            started = datetime.fromisoformat(recorded_at.replace("Z", "+00:00")).astimezone()
        except ValueError as exc:
            raise HTTPException(400, "Invalid recorded_at") from exc
        suffix = Path(audio.filename or "recording.m4a").suffix.lower()
        if suffix not in {".m4a", ".mp4", ".wav", ".opus", ".caf"}:
            raise HTTPException(400, "Unsupported audio format")
        safe_device = re.sub(r"[^A-Za-z0-9_-]", "_", device_id)[:40] or "iphone"
        folder = cfg.data_dir / "audio" / started.strftime("%Y/%m/%d")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{started.strftime('%H-%M-%S-%f')[:-3]}-{safe_device}-{uuid.uuid4().hex[:8]}{suffix}"
        limit = cfg.mobile.maximum_upload_mb * 1024 * 1024
        written = 0
        digest = hashlib.sha256()
        try:
            with path.open("wb") as output:
                while chunk := await audio.read(1024 * 1024):
                    written += len(chunk)
                    if written > limit:
                        raise HTTPException(413, "Upload too large")
                    output.write(chunk)
                    digest.update(chunk)
                output.flush()
                os.fsync(output.fileno())
        except Exception:
            path.unlink(missing_ok=True)
            raise
        ended = started.timestamp() + duration_ms / 1000
        ended_at = datetime.fromtimestamp(ended, tz=started.tzinfo)
        fingerprint = hashlib.sha256((device_id+recorded_at+digest.hexdigest()).encode()).hexdigest()
        with connect(db_path) as db:
            db.execute('BEGIN IMMEDIATE')
            receipt=db.execute('SELECT clip_id FROM upload_receipts WHERE fingerprint=?',(fingerprint,)).fetchone()
            if receipt:
                db.commit();path.unlink(missing_ok=True)
                return {'ok':True,'clip_id':receipt[0],'bytes':written,'duplicate':True}
            cursor = db.execute(
                "INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak,device_name) "
                "VALUES(?,?,?,?,?,?,?)",
                (started.isoformat(), ended_at.isoformat(), duration_ms, str(path), suffix.lstrip("."), 1.0, safe_device),
            )
            clip_id = cursor.lastrowid
            db.execute('INSERT INTO upload_receipts VALUES(?,?)',(fingerprint,clip_id))
            if visit_id and db.execute('SELECT 1 FROM visits WHERE id=?',(visit_id,)).fetchone():
                db.execute('INSERT INTO visit_clips VALUES(?,?)',(clip_id,visit_id))
            db.commit()
        return {"ok": True, "clip_id": clip_id, "bytes": written}

    @app.post("/api/pause")
    def pause(body: dict) -> dict:
        with connect(db_path) as db:
            set_paused(db, bool(body.get("paused")))
        return {"ok": True}

    @app.get("/api/clips")
    def clips(limit: int = 100, q: str = "") -> list[dict]:
        with connect(db_path) as db:
            if q.strip():
                rows = db.execute("SELECT * FROM clips WHERE transcript LIKE ? OR title LIKE ? OR summary LIKE ? OR category LIKE ? ORDER BY started_at DESC LIMIT ?", ((f"%{q.strip()}%",) * 4) + (min(limit, 500),)).fetchall()
            else:
                rows = db.execute("SELECT * FROM clips ORDER BY started_at DESC LIMIT ?", (min(limit, 500),)).fetchall()
            result = []
            for row in rows:
                item = dict(row)
                for source, target in (("tags_json", "tags"), ("entities_json", "entities"),
                                       ("action_items_json", "action_items")):
                    try:
                        item[target] = json.loads(item.get(source) or "[]")
                    except json.JSONDecodeError:
                        item[target] = []
                links = db.execute(
                    "SELECT c.id,c.title,l.score,l.reason FROM clip_links l "
                    "JOIN clips c ON c.id=CASE WHEN l.source_clip_id=? THEN l.target_clip_id "
                    "ELSE l.source_clip_id END WHERE l.source_clip_id=? OR l.target_clip_id=? "
                    "ORDER BY l.score DESC LIMIT 5",
                    (row["id"], row["id"], row["id"]),
                ).fetchall()
                item["related"] = [dict(link) for link in links]
                result.append(item)
            return result

    @app.post("/api/clips/{clip_id}/retry")
    def retry(clip_id: int) -> dict:
        get_clip(clip_id)
        with connect(db_path) as db:
            db.execute("UPDATE clips SET transcription_status='pending',transcription_attempts=0,transcription_error=NULL WHERE id=?", (clip_id,))
            db.commit()
        return {"ok": True}

    @app.post("/api/clips/{clip_id}/retry-enrichment")
    def retry_enrichment(clip_id: int) -> dict:
        get_clip(clip_id)
        with connect(db_path) as db:
            db.execute("UPDATE clips SET enrichment_status='pending',enrichment_attempts=0,"
                       "enrichment_error=NULL WHERE id=?", (clip_id,))
            db.commit()
        return {"ok": True}

    @app.delete("/api/clips/{clip_id}/audio")
    def delete_audio_only(clip_id: int) -> dict:
        row = get_clip(clip_id)
        path = Path(row["audio_path"])
        freed = 0
        if path.is_file() and cfg.data_dir in path.resolve().parents:
            freed = path.stat().st_size
            path.unlink()
        with connect(db_path) as db:
            db.execute("UPDATE clips SET audio_status='deleted' WHERE id=?", (clip_id,))
            db.commit()
        return {"ok": True, "freed_bytes": freed}

    @app.post("/api/storage/delete-processed")
    def delete_processed_audio(body: dict) -> dict:
        include_important = bool(body.get("include_important", False))
        with connect(db_path) as db:
            sql = (
                "SELECT * FROM clips WHERE transcription_status='done' "
                "AND enrichment_status='done' AND audio_status<>'deleted'"
            )
            params: tuple = ()
            if not include_important:
                sql += " AND coalesce(importance,1)<?"
                params = (cfg.enrichment.important_threshold,)
            rows = db.execute(sql, params).fetchall()
            freed = 0
            deleted = 0
            for row in rows:
                path = Path(row["audio_path"])
                if path.is_file() and cfg.data_dir in path.resolve().parents:
                    freed += path.stat().st_size
                    path.unlink()
                db.execute("UPDATE clips SET audio_status='deleted' WHERE id=?", (row["id"],))
                deleted += 1
            db.commit()
        return {"ok": True, "deleted_count": deleted, "freed_bytes": freed}

    @app.get("/api/tasks")
    def tasks(limit: int = 100) -> list[dict]:
        with connect(db_path) as db:
            rows = db.execute(
                "SELECT t.*,c.transcript,c.started_at FROM agent_tasks t "
                "LEFT JOIN clips c ON c.id=t.clip_id ORDER BY t.created_at DESC LIMIT ?",
                (min(limit, 500),),
            ).fetchall()
            return [dict(row) for row in rows]

    @app.post("/api/tasks/{task_id}/approve")
    def approve_task(task_id: int) -> dict:
        with connect(db_path) as db:
            row = db.execute("SELECT id FROM agent_tasks WHERE id=?", (task_id,)).fetchone()
            if not row:
                raise HTTPException(404)
            db.execute(
                "UPDATE agent_tasks SET status='approved',approved_at=?,attempts=0,error=NULL "
                "WHERE id=?", (datetime.now().astimezone().isoformat(), task_id),
            )
            db.commit()
        return {"ok": True}

    @app.post("/api/tasks/{task_id}/reject")
    def reject_task(task_id: int) -> dict:
        with connect(db_path) as db:
            cursor = db.execute(
                "UPDATE agent_tasks SET status='rejected' WHERE id=? AND status<>'running'",
                (task_id,),
            )
            db.commit()
            if not cursor.rowcount:
                raise HTTPException(409, "Task is running or missing")
        return {"ok": True}

    @app.post("/api/tasks/{task_id}/retry")
    def retry_task(task_id: int) -> dict:
        with connect(db_path) as db:
            cursor = db.execute(
                "UPDATE agent_tasks SET status='approved',attempts=0,error=NULL WHERE id=?",
                (task_id,),
            )
            db.commit()
            if not cursor.rowcount:
                raise HTTPException(404)
        return {"ok": True}

    @app.post("/api/control/restart")
    def restart_services(body: dict) -> dict:
        target = str(body.get("target", "all"))
        if target not in {"all", "collector", "transcriber", "enricher", "codex_runner"}:
            raise HTTPException(400, "Invalid target")
        with connect(db_path) as db:
            db.execute(
                "INSERT INTO control_commands(command,target,status) VALUES('restart',?,'pending')",
                (target,),
            )
            db.commit()
        return {"ok": True, "message": "Restart scheduled"}

    def get_clip(clip_id: int):
        db = connect(db_path)
        row = db.execute("SELECT * FROM clips WHERE id=?", (clip_id,)).fetchone()
        db.close()
        if not row:
            raise HTTPException(404)
        return row

    @app.get("/api/clips/{clip_id}/audio")
    def audio(clip_id: int):
        row = get_clip(clip_id)
        path = Path(row["audio_path"])
        if not path.is_file() or cfg.data_dir not in path.resolve().parents:
            raise HTTPException(404)
        return FileResponse(path)

    @app.delete("/api/clips/{clip_id}")
    def delete(clip_id: int) -> dict:
        row = get_clip(clip_id)
        path = Path(row["audio_path"])
        if cfg.data_dir in path.resolve().parents:
            path.unlink(missing_ok=True)
        with connect(db_path) as db:
            db.execute("DELETE FROM clips WHERE id=?", (clip_id,))
            db.commit()
        return {"ok": True}

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config")
    args = parser.parse_args()
    cfg = load_config(args.config)
    uvicorn.run(create_app(args.config), host=cfg.web.host, port=cfg.web.port)


if __name__ == "__main__":
    main()
