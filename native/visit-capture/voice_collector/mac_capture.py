"""Mac microphone opens only after explicit console request and lease acquisition."""
import time,queue,signal,argparse
from datetime import datetime
import numpy as np
from .config import load_config
from .database import connect
from .visits import init,lease

def run(config):
    import sounddevice as sd,torch
    from silero_vad import load_silero_vad
    from .segmenter import SpeechSegmenter
    from .storage import ClipStorage
    cfg=load_config(config);db=connect(cfg.data_dir/'voice.db');init(db)
    storage=ClipStorage(cfg.data_dir,16000,cfg.storage.format);model=None
    while True:
        state=lease(db,'status')
        if state['requested']!='mac':time.sleep(1);continue
        grant=lease(db,'acquire','mac')
        if not grant['granted']:time.sleep(1);continue
        token=grant['token'];deadline=time.monotonic()+16;last=0
        try:
            if model is None:model=load_silero_vad(onnx=True)
            chunks=queue.Queue(maxsize=128)
            seg=SpeechSegmenter(16000,512,500,192,1000,500,20,.55)
            def callback(indata,frames,timing,status):
                if time.monotonic()>=deadline:return
                try:chunks.put_nowait(indata[:,0].copy())
                except queue.Full:pass
            def save(clip):
                if not clip:return
                path=storage.save(clip.samples,clip.started_at)
                cursor=db.execute('INSERT INTO clips(started_at,ended_at,duration_ms,audio_path,format,vad_peak,device_name) VALUES(?,?,?,?,?,?,?)',(clip.started_at.isoformat(),clip.ended_at.isoformat(),round(len(clip.samples)/16),str(path),path.suffix.lstrip('.'),clip.vad_peak,'mac'))
                active=db.execute('SELECT active_visit FROM visit_state WHERE id=1').fetchone()[0]
                if active:db.execute('INSERT INTO visit_clips VALUES(?,?)',(cursor.lastrowid,active))
                db.commit()
            with sd.InputStream(device=cfg.audio.device,channels=1,samplerate=16000,dtype='float32',blocksize=512,callback=callback):
                while time.monotonic()<deadline:
                    now=time.monotonic()
                    if now-last>=6:
                        if not lease(db,'renew','mac',token)['granted']:break
                        deadline=now+16;last=now
                    try:chunk=chunks.get(timeout=.5)
                    except queue.Empty:continue
                    probability=float(model(torch.from_numpy(chunk),16000).item())
                    save(seg.feed(chunk,probability,datetime.now().astimezone()))
                # Flush buffered speech with silence, then close microphone before releasing.
                for _ in range(40):save(seg.feed(np.zeros(512,dtype=np.float32),0,datetime.now().astimezone()))
        except Exception as exc:
            (cfg.data_dir/'mac-capture-error.txt').write_text(str(exc))
        finally:lease(db,'release','mac',token)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);run(p.parse_args().config)
