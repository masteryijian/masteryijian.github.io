"""Public-only evidence acquisition. HTTPS, pinned public DNS, no cookies or credentials."""
import concurrent.futures, hashlib, html, http.client, ipaddress, json, re, socket, ssl, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

MAX_BYTES=5_000_000
class SourceError(Exception): pass

def public_target(url, resolver=socket.getaddrinfo):
    parts=urlsplit(url)
    if parts.scheme!='https' or not parts.hostname or parts.username or parts.password or parts.port not in (None,443): raise SourceError('public_https_required')
    if re.search(r'(?:token|secret|password|api[_-]?key|signature|auth)=',parts.query,re.I): raise SourceError('credential_query_rejected')
    host=parts.hostname.lower()
    if host=='localhost' or host.endswith(('.local','.internal','.localhost')): raise SourceError('private_host_rejected')
    try: answers=resolver(host,443,type=socket.SOCK_STREAM)
    except OSError: raise SourceError('dns_unavailable') from None
    addresses=list(dict.fromkeys(item[4][0] for item in answers))
    if not addresses or any(not ipaddress.ip_address(addr).is_global for addr in addresses): raise SourceError('private_address_rejected')
    path=urlunsplit(('', '', parts.path or '/',parts.query,''))
    return host,addresses[0],path

class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self,host,address):
        super().__init__(host,timeout=12,context=ssl.create_default_context());self.address=address
    def connect(self):
        raw=socket.create_connection((self.address,443),self.timeout)
        try:self.sock=self._context.wrap_socket(raw,server_hostname=self.host)
        except BaseException:raw.close();raise

def get_public(url,redirects=3):
    for _ in range(redirects+1):
        host,address,path=public_target(url);connection=PinnedHTTPS(host,address)
        try:
            connection.request('GET',path,headers={'User-Agent':'TechBridgeResearch/1.0 (public document research)','Accept':'text/html,application/pdf,text/plain;q=0.9'})
            response=connection.getresponse()
            if response.status in (301,302,303,307,308):
                destination=response.getheader('Location')
                if not destination:raise SourceError('redirect_missing')
                url=urljoin(url,destination);continue
            if response.status!=200:raise SourceError('http_'+str(response.status))
            if int(response.getheader('Content-Length','0'))>MAX_BYTES:raise SourceError('source_oversized')
            body=response.read(MAX_BYTES+1)
            if len(body)>MAX_BYTES:raise SourceError('source_oversized')
            return url,response.getheader('Content-Type',''),body
        finally:connection.close()
    raise SourceError('redirect_limit')

class PublicText(HTMLParser):
    def __init__(self):super().__init__();self.parts=[];self.links=[];self.title=[];self.hidden=0;self.in_title=False
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag in ('script','style','noscript','svg','nav','footer'):self.hidden+=1
        if tag=='title':self.in_title=True
        if tag=='a' and attrs.get('href'):self.links.append(attrs['href'])
        if tag in ('p','div','li','h1','h2','h3','tr','br'):self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript','svg','nav','footer'):self.hidden=max(0,self.hidden-1)
        if tag=='title':self.in_title=False
    def handle_data(self,data):
        if self.in_title:self.title.append(data)
        if not self.hidden:self.parts.append(data)

def clean_public_text(value):
    value=html.unescape(value).replace('\x00','')
    value=re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]+-----','[redacted]',value,flags=re.S)
    value=re.sub(r'(?im)^.*(?:api[_ -]?key|access[_ -]?token|password|密码|私钥)\s*[:=].*$','[redacted]',value)
    return re.sub(r'[ \t]+',' ',re.sub(r'\n\s*\n+','\n',value)).strip()

def acquire(url,kind,topic):
    started=time.time()
    try:
        final,content_type,body=get_public(url);links=[]
        if 'pdf' in content_type or body.startswith(b'%PDF'):
            from pypdf import PdfReader
            from io import BytesIO
            reader=PdfReader(BytesIO(body));parts=[]
            for i,page in enumerate(reader.pages[:60]):parts.append('[PDF page '+str(i+1)+']\n'+(page.extract_text() or ''))
            text='\n'.join(parts);title=urlsplit(final).path.rsplit('/',1)[-1]
        elif 'html' in content_type:
            parser=PublicText();parser.feed(body.decode('utf-8',errors='replace'));text=' '.join(parser.parts);title=' '.join(parser.title).strip();links=parser.links
        elif 'text/' in content_type or final.endswith(('.md','.txt')):text=body.decode('utf-8',errors='replace');title=urlsplit(final).path.rsplit('/',1)[-1]
        else:raise SourceError('unsupported_content')
        text=clean_public_text(text)
        if len(text)<180:raise SourceError('insufficient_public_text')
        if re.search(r'verify you are human|checking your browser|enable javascript and cookies to continue',text[:1500],re.I):raise SourceError('access_challenge')
        return {'url':final,'requestedUrl':url,'title':title[:240],'kind':kind,'topic':topic,'retrievedAt':datetime.now(timezone.utc).isoformat(),'retrievalStatus':'retrieved','text':text[:100000],'sourceCharacters':len(text),'truncated':len(text)>100000,'sha256':hashlib.sha256(body).hexdigest(),'links':links[:100],'seconds':round(time.time()-started,2)}
    except Exception as error:
        reason=str(error) if isinstance(error,SourceError) else type(error).__name__
        return {'requestedUrl':url,'kind':kind,'topic':topic,'retrievalStatus':'unavailable','reason':reason[:80],'seconds':round(time.time()-started,2)}

ROBOTICS_SOURCES=[
 ('https://schunk.com/us/en/gripping-systems/special-gripper/svh/svh-rechte-hand/p/000000000001545592','competitor','technical'),
 ('https://qbrobotics.com/product/qb-softhand-research/','competitor','technical'),
 ('https://en.tesollo.com/dg-5f/','competitor','technical'),
 ('https://shadowrobot.com/wp-content/uploads/2024/12/shadow_dexterous_hand_e_technical_specification_20241204.pdf','competitor','technical'),
 ('https://ifr.org/img/worldrobotics/Executive_Summary_WR_2025_Industrial_Robots.pdf','industry','market'),
 ('https://press.siemens.com/global/en/pressrelease/siemens-and-humanoid-bring-physical-ai-factory-floor-deploying-humanoids-industrial','public_case','market'),
 ('https://www.fzi.de/en/research/research-fields/robotics/','research_institution','customers'),
]
REGULATORY_SOURCES=[
 ('https://single-market-economy.ec.europa.eu/single-market/goods/ce-marking/manufacturers_en','regulator','compliance'),
 ('https://single-market-economy.ec.europa.eu/single-market/goods/ce-marking/importers-and-distributors_en','regulator','compliance'),
 ('https://eur-lex.europa.eu/EN/legal-content/summary/machinery-safety-requirements.html','regulator','compliance'),
 ('https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/electromagnetic-compatibility-emc-directive_en','regulator','compliance'),
]

def source_plan(documents,profile):
    # Only explicit public website domains leave the machine, never CRM or visit text.
    domains=list(dict.fromkeys(re.findall(r'\bwww\.[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+',documents)))[:2]
    explicit=profile.get('publicWebsite','')
    planned=[('https://'+domain+'/','manufacturer','company') for domain in domains]
    if explicit and len(explicit)<300:planned.insert(0,(explicit,'manufacturer','company'))
    robotics=bool(re.search(r'灵巧|机械手|dexterous|robotic hand',documents[:30000],re.I))
    if robotics:planned+=ROBOTICS_SOURCES
    if any('linkerbot' in url for url,_,_ in planned):
        planned.insert(1,('https://raw.githubusercontent.com/linker-bot/linkerhand-ros2-sdk/main/README.md','manufacturer_sdk','technical'))
        planned.insert(2,('https://a.storyblok.com/f/298593/x/50a0fc9e84/linker-hand-l20-v10-20260324.pdf','product_document_reference','technical'))
    planned+=REGULATORY_SOURCES
    return list(dict.fromkeys(planned))[:16]

def collect_sources(documents,profile,on_event=lambda text:None):
    plan=source_plan(documents,profile);receipts=[]
    # Public downloads only; local model work remains serial.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures={pool.submit(acquire,*item):item for item in plan}
        for future in concurrent.futures.as_completed(futures):
            item=future.result();receipts.append(item)
            on_event('公开来源 '+str(len(receipts))+'/'+str(len(plan))+'：'+('已读取' if item['retrievalStatus']=='retrieved' else '不可读取')+' · '+urlsplit(item['requestedUrl']).hostname)
    sources=[]
    for item in sorted(receipts,key=lambda x:x['requestedUrl']):
        if item['retrievalStatus']=='retrieved':sources.append({**item,'id':'WEB:'+str(len(sources)+1).zfill(2)})
    return sources,receipts
