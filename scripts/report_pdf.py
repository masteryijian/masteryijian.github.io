"""Private A4 report renderer. No network, no persisted documents, no HTML execution."""
from io import BytesIO
from pathlib import Path
import html, re, os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle, HRFlowable
FONT = 'TechBridgeBody'
FONT_PATH = Path(os.environ.get('TECHBRIDGE_PDF_FONT','/System/Library/Fonts/Supplemental/Arial Unicode.ttf'))
if FONT_PATH.is_file():
    pdfmetrics.registerFont(TTFont(FONT,str(FONT_PATH)))
else:
    FONT='STSong-Light';pdfmetrics.registerFont(UnicodeCIDFont(FONT))
pdfmetrics.registerFontFamily(FONT,normal=FONT,bold=FONT,italic=FONT,boldItalic=FONT)
INK=colors.HexColor('#17323D'); MUTED=colors.HexColor('#657780'); ACCENT=colors.HexColor('#216E68')
BODY=ParagraphStyle('Body',fontName=FONT,fontSize=10.3,leading=17,spaceAfter=7,textColor=INK,wordWrap='CJK',allowWidows=0,allowOrphans=0)
H2=ParagraphStyle('H2',parent=BODY,fontSize=14,leading=21,spaceBefore=17,spaceAfter=9,textColor=ACCENT,keepWithNext=True)
H3=ParagraphStyle('H3',parent=BODY,fontSize=11.3,leading=18,spaceBefore=9,keepWithNext=True)
SMALL=ParagraphStyle('Small',parent=BODY,fontSize=8.5,leading=13,textColor=MUTED)
QUOTE=ParagraphStyle('Quote',parent=SMALL,leftIndent=10,borderPadding=8,backColor=colors.HexColor('#F1F5F4'),spaceAfter=5)
CELL=ParagraphStyle('Cell',parent=BODY,fontSize=8.6,leading=13,spaceAfter=0)
def inline(value):
    value=html.escape(str(value),quote=True)
    value=re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)',r'<link href="\2" color="#216E68">\1</link>',value)
    return re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',value)
def render_pdf(payload):
    text=payload.get('report','');profile=payload.get('profile') or {}
    if not isinstance(text,str) or not text.strip() or len(text)>180000:raise ValueError('Report missing or oversized')
    evidence_ids=list(dict.fromkeys(x.rstrip('.') for x in re.findall(r'PRIVATE:[A-Za-z0-9:%._-]+',text)))
    evidence_labels={value:f'[专有证据 {i+1:02d}]' for i,value in enumerate(evidence_ids)}
    text=re.sub(r'PRIVATE:[A-Za-z0-9:%._-]+',lambda m:evidence_labels[m[0].rstrip('.')]+('.' if m[0].endswith('.') else ''),text)
    title=str(payload.get('title') or profile.get('product') or '市场与代理可行性评估')[:180]
    customer=str(profile.get('customer') or '项目研究')[:180]
    created=str(payload.get('createdAt') or '')[:40]
    out=BytesIO();doc=SimpleDocTemplate(out,pagesize=A4,rightMargin=19*mm,leftMargin=19*mm,topMargin=23*mm,bottomMargin=21*mm,title=title,author='TechBridge · AI-assisted analysis',pageCompression=1)
    story=[Paragraph('TECHBRIDGE / PRIVATE RESEARCH',SMALL),Spacer(1,5*mm),Paragraph(inline(title),ParagraphStyle('Title',parent=BODY,fontSize=23,leading=31,spaceAfter=10)),Paragraph(inline(customer)+' · '+inline(created),SMALL),HRFlowable(width='100%',thickness=1.2,color=ACCENT,spaceBefore=8,spaceAfter=14),Paragraph('AI 辅助分析 · 待人工复核。客户拜访资料属于专有业务证据，不等同于经独立核验的公开事实。',QUOTE)]
    lines=text.splitlines();i=0
    def cells(line):return [s.strip() for s in line.strip().strip('|').split('|')]
    while i<len(lines):
        line=lines[i].strip();i+=1
        if not line:continue
        if line.startswith('```'):
            code=[]
            while i<len(lines) and not lines[i].strip().startswith('```'):code.append(lines[i]);i+=1
            i+=1
            story.append(Paragraph(html.escape('\n'.join(code)).replace('\n','<br/>'),SMALL));continue
        if '|' in line and i<len(lines) and re.match(r'^\s*\|?\s*:?-{3,}',lines[i]):
            rows=[cells(line)];i+=1
            while i<len(lines) and '|' in lines[i]:rows.append(cells(lines[i]));i+=1
            count=max(len(r) for r in rows)
            if count>12:raise ValueError("Table has more than 12 columns")
            data=[[Paragraph(inline(c),CELL) for c in row+['']*(count-len(row))] for row in rows]
            table=LongTable(data,colWidths=[doc.width/count]*count,repeatRows=1,splitInRow=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#EAF2F0')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.7,ACCENT),('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#DEE6E8')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
            story.extend([table,Spacer(1,8)]);continue
        heading=re.match(r'^(#{1,6})\s+(.+)',line)
        if heading:
            if len(heading[1])==1:continue
            story.append(Paragraph(inline(heading[2]),H2 if len(heading[1])==2 else H3));continue
        if line.startswith('>'):story.append(Paragraph(inline(line.lstrip('> ').strip()),QUOTE));continue
        if re.match(r'^[-*]\s+',line):line='• '+re.sub(r'^[-*]\s+','',line)
        story.append(Paragraph(inline(line),BODY))
    if evidence_ids:
        story.append(Paragraph('专有证据引用索引',H2))
        for i,value in enumerate(evidence_ids):story.append(Paragraph(f'{i+1:02d} · '+html.escape(value),SMALL))
    def chrome(canvas,doc):
        canvas.saveState();canvas.setStrokeColor(colors.HexColor('#D7E0E3'));canvas.setLineWidth(.4)
        canvas.line(19*mm,A4[1]-16*mm,A4[0]-19*mm,A4[1]-16*mm)
        canvas.setFont('Helvetica',8);canvas.setFillColor(MUTED);canvas.drawString(19*mm,A4[1]-12*mm,'TECHBRIDGE  /  MARKET & PARTNER ASSESSMENT')
        canvas.drawString(19*mm,12*mm,'PRIVATE · AI-ASSISTED · HUMAN REVIEW REQUIRED');canvas.drawRightString(A4[0]-19*mm,12*mm,str(doc.page));canvas.restoreState()
    doc.build(story,onFirstPage=chrome,onLaterPages=chrome)
    return out.getvalue()
