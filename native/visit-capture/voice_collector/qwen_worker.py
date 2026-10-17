"""JSON-lines worker; stdout reserved for protocol, model logs on stderr."""
import argparse, contextlib, json, sys, time, os, threading
from pathlib import Path
parent_pid=os.getppid()
def watch_parent():
    while True:
        time.sleep(2)
        if os.getppid()!=parent_pid:
            os._exit(0)
threading.Thread(target=watch_parent,daemon=True).start()
p=argparse.ArgumentParser();p.add_argument('--model',required=True);a=p.parse_args()
with contextlib.redirect_stdout(sys.stderr):
    from mlx_audio.stt import load
    import mlx.core as mx
    model=load(str(Path(a.model).resolve()))
for line in sys.stdin:
    try:
        request=json.loads(line)
        language=request.get('language','auto')
        language={'zh':'Chinese','de':'German','en':'English','auto':None}.get(language,language)
        start=time.perf_counter()
        with contextlib.redirect_stdout(sys.stderr):
            result=model.generate(request['audio'],language=language,max_tokens=4096,chunk_duration=30,verbose=False)
            mx.synchronize()
        response={'text':result.text,'seconds':time.perf_counter()-start}
    except Exception as exc:
        response={'error':str(exc)}
    print(json.dumps(response,ensure_ascii=False),flush=True)
