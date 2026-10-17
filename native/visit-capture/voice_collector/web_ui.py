HTML = r"""<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Voice Collector</title>
<style>
body{font:15px system-ui;max-width:1050px;margin:24px auto;padding:0 16px;background:#f4f4f1;color:#202020}
h1{margin-bottom:4px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.card{background:#fff;padding:17px;border-radius:14px;margin:12px 0;box-shadow:0 1px 5px #0001}
button{font:inherit;padding:8px 12px;border:0;border-radius:8px;background:#222;color:#fff;margin:3px}
.secondary{background:#666}.danger{background:#a32626}.warn{background:#9a6500}.good{color:#18713b}
.muted{color:#666;font-size:13px}.text{line-height:1.55;white-space:pre-wrap;margin-top:9px}
audio{width:100%;margin-top:8px}input{font:inherit;padding:9px;border:1px solid #aaa;border-radius:8px;width:min(500px,70%)}
.pill{display:inline-block;padding:2px 8px;border-radius:12px;background:#eee;margin:2px;font-size:12px}
nav button{background:#ddd;color:#222}.hidden{display:none}.task{border-left:5px solid #bd8b19}
</style></head><body>
<h1>Voice Collector</h1><div class="muted">本地语音、文字知识库和Codex任务中心</div>
<nav class="card"><button onclick="show('records')">记录</button><button onclick="show('tasks')">Codex任务</button><button onclick="show('system')">系统与空间</button></nav>

<section id="system" class="hidden"><div id="status" class="card">读取状态…</div>
<div class="card"><b>快捷控制</b><div class="text">
<button onclick="restart('all')">重新启动全部服务</button>
<button class="secondary" onclick="restart('collector')">重启采集</button>
<button class="secondary" onclick="restart('transcriber')">重启转写</button>
<button class="secondary" onclick="restart('enricher')">重启LLM整理</button>
</div></div>
<div class="card"><b>释放磁盘空间</b><p class="muted">只删除已成功转写、成功整理的音频；文字、摘要、标签、待办和关联继续保留。重要记录默认跳过。</p>
<button class="danger" onclick="bulkDelete()">删除已处理的普通音频</button></div></section>

<section id="records"><div class="card"><input id="q" placeholder="搜索标题、摘要或转写"><button onclick="loadRecords()">搜索</button></div><div id="clips"></div></section>
<section id="tasks" class="hidden"><div class="card"><b>Todo → Codex</b><p class="muted">以“Todo ……”开始的语音会出现在这里。只有点击批准后Codex才会执行。</p></div><div id="taskList"></div></section>

<script>
const esc=v=>{let d=document.createElement('div');d.textContent=v??'';return d.innerHTML};
function show(id){for(let x of ['records','tasks','system'])document.getElementById(x).classList.toggle('hidden',x!==id);if(id==='tasks')loadTasks();if(id==='system')loadStatus()}
function source(v){if(v==='apple-watch')return'Apple Watch';if((v||'').startsWith('ipad-'))return'iPad';if((v||'').startsWith('iphone-'))return'iPhone';return'Mac'}
async function api(url,opt){let r=await fetch(url,opt);if(!r.ok)throw new Error((await r.text())||r.status);return r.json()}
async function loadStatus(){let s=await api('/api/status');let sv=s.services||{},line=n=>{let x=sv[n]||{};return `${n}: ${x.state||'未运行'}${x.pid?' · PID '+x.pid:''} · 重启${x.restart_count||0}次`};document.getElementById('status').innerHTML=`<span class="pill">ASR：${esc(s.asr_backend||"whisper")}</span><br><b>${s.paused?'采集已暂停':'正在监听'}</b> · 今日${s.today_count}段 · ${(s.today_ms/60000).toFixed(1)}分钟<br><span class="muted">磁盘音频 ${(s.disk_bytes/1048576).toFixed(1)} MB · 转写等待 ${s.pending_count} · LLM等待 ${s.enrichment_pending} · 隔离 ${s.quarantined_count}</span><div class="text muted">${['collector','web','transcriber','enricher','codex_runner'].map(line).join('<br>')}</div><button onclick="togglePause(${!s.paused})">${s.paused?'继续采集':'暂停采集'}</button>`}
async function loadRecords(){let q=document.getElementById('q').value,cs=await api('/api/clips?limit=100&q='+encodeURIComponent(q));document.getElementById('clips').innerHTML=cs.map(c=>`<div class="card"><b>${esc(c.title||new Date(c.started_at).toLocaleString())}</b><span class="muted"> · ${source(c.device_name)} · ${esc(c.category||'未分类')} · ${esc(c.audio_status)}</span>${c.audio_status!=='deleted'?`<audio controls preload="none" src="/api/clips/${c.id}/audio"></audio><button class="danger" onclick="deleteAudio(${c.id})">仅删除音频</button>`:'<p class="good">音频已删除，文字已保留</p>'}${c.summary?`<div class="text"><b>摘要：</b>${esc(c.summary)}</div>`:''}<div class="text">${esc(c.transcript||'等待转写…')}</div><div>${(c.tags||[]).map(x=>`<span class="pill">${esc(x)}</span>`).join('')}</div>${(c.action_items||[]).length?`<div class="text"><b>待办：</b>${c.action_items.map(x=>esc(x.task)).join('；')}</div>`:''}</div>`).join('')||'<div class="card">没有记录</div>'}
async function loadTasks(){let ts=await api('/api/tasks');document.getElementById('taskList').innerHTML=ts.map(t=>`<div class="card task"><b>${esc(t.title)}</b> · <span class="muted">${esc(t.status)}</span><div class="text">${esc(t.instruction)}</div>${t.result_text?`<div class="text"><b>结果：</b>${esc(t.result_text)}</div>`:''}${t.error?`<div class="text danger">${esc(t.error)}</div>`:''}${t.status==='needs_approval'?`<button onclick="taskAction(${t.id},'approve')">批准执行</button><button class="secondary" onclick="taskAction(${t.id},'reject')">忽略</button>`:''}${t.status==='failed'?`<button onclick="taskAction(${t.id},'retry')">重试</button>`:''}</div>`).join('')||'<div class="card">还没有Todo任务</div>'}
async function togglePause(v){await api('/api/pause',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({paused:v})});loadStatus()}
async function restart(target){if(confirm('确定重新启动 '+target+'？')){await api('/api/control/restart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({target})});alert('已安排重启，约5秒后刷新');setTimeout(loadStatus,6000)}}
async function deleteAudio(id){if(confirm('只删除这条记录的音频？文字和整理结果会保留。')){let r=await api('/api/clips/'+id+'/audio',{method:'DELETE'});alert('释放 '+(r.freed_bytes/1048576).toFixed(2)+' MB');loadRecords()}}
async function bulkDelete(){if(confirm('删除所有已转写并成功整理的普通音频？文字会保留，操作不可撤销。')){let r=await api('/api/storage/delete-processed',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({include_important:false})});alert(`删除 ${r.deleted_count} 段，释放 ${(r.freed_bytes/1048576).toFixed(1)} MB`);loadStatus()}}
async function taskAction(id,a){await api(`/api/tasks/${id}/${a}`,{method:'POST'});loadTasks()}
loadStatus();loadRecords();setInterval(loadStatus,10000)
</script></body></html>"""
