"""Install the loopback-only report helper using the chosen ReportLab-capable Python."""
from pathlib import Path
import shutil,plistlib,os,subprocess,sys,time
source=Path(__file__).resolve().parent.parent
runtime=Path.home()/'Library/Application Support/OPCTechBridge/ReportService'
app=runtime/'app';logs=runtime/'logs';logs.mkdir(parents=True,exist_ok=True)
for folder,names in {'scripts':['local-model-bridge.py','report_pdf.py','research_sources.py','report_harness.py','product_evidence.py'],'tools/market-report':['index.html','app.js','styles.css','engine.mjs','local-engine.mjs','render.mjs','private-context.mjs','research-client.mjs'],'tools/crm':['model.js'],'tools':['workbench-model.js']}.items():
    dest=app/folder;dest.mkdir(parents=True,exist_ok=True)
    for name in names:shutil.copy2(source/folder/name,dest/name)
label='com.yijian.techbridge.report';plist=Path.home()/('Library/LaunchAgents/'+label+'.plist');plist.parent.mkdir(exist_ok=True)
subprocess.run(['launchctl','bootout',f'gui/{os.getuid()}/{label}'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
value={'Label':label,'ProgramArguments':[sys.executable,str(app/'scripts/local-model-bridge.py')],'WorkingDirectory':str(app),'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'StandardOutPath':str(logs/'out.log'),'StandardErrorPath':str(logs/'error.log')}
plist.write_bytes(plistlib.dumps(value))
for attempt in range(10):
    result=subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(plist)],capture_output=True,text=True)
    if result.returncode==0:break
    time.sleep(1)
else:raise RuntimeError('Report service registration failed: '+result.stderr)

print('Local report service installed at http://localhost:4183; private context stays on this Mac.')
