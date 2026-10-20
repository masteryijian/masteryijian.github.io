import sys,unittest,hashlib,tempfile,importlib.util,threading,urllib.request,urllib.error
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from research_sources import public_target,SourceError,source_plan
from report_harness import chapter_checks,assemble,scenario_table,clean_pdf,redact,quote_registry,normalize_chapter_markdown,reference_sources

def answers(ip):return lambda *args,**kwargs:[(2,1,6,'',(ip,443))]
class ResearchTests(unittest.TestCase):
 def test_public_fetch_cannot_be_used_for_loopback_or_credentials(self):
  for url in ['http://example.com/','https://localhost/a','https://user:pass@example.com/','https://example.com/?token=secret']:
   with self.assertRaises(SourceError):public_target(url,answers('8.8.8.8'))
  for ip in ['127.0.0.1','192.168.0.1','169.254.169.254','::1']:
   with self.assertRaises(SourceError):public_target('https://example.com/',answers(ip))
  self.assertEqual(public_target('https://example.com/a',answers('8.8.8.8')),('example.com','8.8.8.8','/a'))
 def test_mixed_public_private_dns_is_rejected(self):
  resolver=lambda *a,**k:[(2,1,6,'',('8.8.8.8',443)),(2,1,6,'',('127.0.0.1',443))]
  with self.assertRaises(SourceError):public_target('https://example.com/',resolver)
 def test_private_records_do_not_enter_public_source_plan(self):
  plan=source_plan('www.example.com robotics',{'privateEvidence':{'visit':{'transcript':'www.private-contact.example'}}})
  self.assertFalse(any('private-contact' in url for url,_,_ in plan))
 def test_bracketed_source_ids_are_equivalent_but_made_up_quotes_fail(self):
  sources=[{'id':'DOC:01','excerpt':'原始测试资料显示接口为CAN和RS485，需要确认版本。'}]
  body='具有具体商业含义与边界的分析。'*60+'\n| 项目 | 证据 |\n| --- | --- |\n| 接口 | 待核实 |'
  good={'body':body,'citations':[{'id':'[DOC:01]','quote':'原始测试资料显示接口为CAN和RS485'}],'open_questions':[]}
  problems,verified=chapter_checks(good,sources);self.assertEqual(problems,[]);self.assertEqual(verified[0]['id'],'DOC:01')
  bad={**good,'citations':[{'id':'DOC:01','quote':'厂家承诺全部符合认证并已接受采购订单'}]}
  self.assertTrue(chapter_checks(bad,sources)[0])
 def test_assembly_preserves_every_chapter_byte_and_does_not_rewrite(self):
  chapters=[{'id':'technical','title':'技术矩阵','body':'固定技术正文012345','citations':[],'open_questions':[]},{'id':'decision','title':'执行摘要','body':'固定决策ABC','citations':[],'open_questions':[]}]
  job={'profile':{'product':'测试'},'createdAt':'2026-10-19','chapters':chapters,'sources':[],'documentsSources':[],'privateSources':[]}
  report=assemble(job)
  for c in chapters:self.assertIn(c['body'],report)
  self.assertLess(report.index('固定决策ABC'),report.index('固定技术正文012345'))
 def test_scenario_arithmetic_is_deterministic_and_always_marked_assumed(self):
  text,rows=scenario_table({})
  self.assertIn('演示假设',text)
  for row in rows:
   revenue=row['unitPrice']*row['units']+row['servicePrice']*row['projects']
   contribution=(row['unitPrice']-row['landedCost'])*row['units']+(row['servicePrice']-row['serviceDeliveryCost'])*row['projects']
   self.assertEqual(row['revenue'],revenue);self.assertEqual(row['contribution'],contribution);self.assertEqual(row['balance'],contribution-row['fixedCost']);self.assertTrue(row['assumption'])
 def test_quote_registry_uses_exact_source_and_model_only_selects_an_id(self):
  sources=[{'id':'DOC:01','excerpt':'这是一段足够长的原始证据，参数必须按同一型号逐一核对，不得拼接。'}]
  registry=quote_registry(sources);self.assertTrue(registry)
  result={'body':'具体论证、下一步与边界。'*90+'\n| A | B |\n| --- | --- |\n| 任务 | 证据 |','citations':[{'quote_id':registry[0]['quote_id']}]}
  problems,verified=chapter_checks(result,sources,True,registry);self.assertEqual(problems,[]);self.assertIn(verified[0]['quote'],sources[0]['excerpt'])
 def test_broken_soft_wrapped_table_is_repaired_without_modifying_values(self):
  body='## 技术\n| 型号 | 参数 | 边界 |\n| --- | --- | --- |\n| O6 | CAN\n与RS485 | 待核实 |\n\n正文'
  result=normalize_chapter_markdown(body)
  self.assertIn('### 技术',result);self.assertIn('| O6 | CAN<br>与RS485 | 待核实 |',result)
 def test_unavailable_reference_or_wrong_company_never_imports_other_company_facts(self):
  with self.assertRaises(ValueError):reference_sources('not-in-user-catalog','其他企业产品',{})
 def test_slow_reference_loading_does_not_lock_status_reads(self):
  import report_harness as harness
  from unittest.mock import patch
  entered=threading.Event();release=threading.Event()
  def slow(*args):entered.set();release.wait(3);raise ValueError('unavailable_reference')
  def submit():
   try:harness.start_job({'documents':'synthetic evidence','profile':{'referenceId':'test'}})
   except ValueError:pass
  with patch.object(harness,'reference_sources',side_effect=slow):
   thread=threading.Thread(target=submit);thread.start();self.assertTrue(entered.wait(1))
   acquired=harness.STATE_LOCK.acquire(timeout=.2)
   if acquired:harness.STATE_LOCK.release()
   release.set();thread.join(2);self.assertTrue(acquired)
 def test_resume_retains_accepted_chapters_and_uses_existing_input(self):
  import report_harness as harness
  from unittest.mock import patch
  ident='a'*32;job={'id':ident,'status':'failed','createdAt':'2026-10-19','profile':{},'chapters':[{'id':'company','title':'公司','body':'accepted original','citations':[],'sha256':'stable'}]}
  seen=[]
  def run(saved):seen.append(saved['chapters'][0]['body'])
  with tempfile.TemporaryDirectory() as directory,patch.object(harness,'ROOT',Path(directory)),patch.dict(harness.JOBS,{ident:job}),patch.object(harness,'run_job',side_effect=run):
   result=harness.resume_job(ident);harness.THREADS[ident].join(1)
   self.assertEqual(result['completedChapters'],1);self.assertEqual(seen,['accepted original']);self.assertEqual(job['chapters'][0]['sha256'],'stable')
   harness.THREADS.pop(ident,None)
 def test_parameter_adapter_scopes_exact_values_and_exposes_conflicts(self):
  from product_evidence import technical_matrix
  source={'id':'WEB:01','kind':'manufacturer','text':'Linker Hand O6\n自由度：6+5\n传动方式：连杆\n重量：360g\n最大负载：50kg\n五指最大抓握力：70N\n控制接口：CAN/RS485\nLinker Hand L20\n自由度：16+5\n传动方式：连杆\n重量：1200g\n最大负载：20kg\n五指最大抓握力：100N\n控制接口：CAN'}
  text,rows=technical_matrix([source],[{'id':'DOC:01','text':'Linker Hand O6\n重量仅 370g'}])
  self.assertEqual(rows[0]['fields']['重量'],'360g');self.assertEqual(rows[1]['fields']['五指最大抓握力'],'100N')
  self.assertIn('370g [DOC:01]',text);self.assertIn('360g [WEB:01]',text);self.assertNotIn('V1.2',text)
 def test_article_excerpt_keeps_actual_evidence_after_large_site_navigation(self):
  from report_harness import source_excerpt
  article='The industrial trial reports autonomous logistics tasks at a named electronics factory and describes the robot as a test, not a purchase commitment.'
  source={'id':'WEB:01','title':'Factory pilot','text':'Search\nContact\n'+('[{"url_str":"'+('navigation'*900)+'"}]\n')+article}
  excerpt=source_excerpt(source);self.assertIn(article,excerpt);self.assertNotIn('url_str',excerpt)
 def test_analysis_gate_rejects_new_kpi_and_cross_sku_version_assertions(self):
  body='具体论证和边界。'*100+'\n| 项目 | 条件 |\n| --- | --- |\n| 抓取成功率 | 95% |'
  sources=[{'id':'WEB:01','excerpt':'This is the exact public evidence used for the trial.'}]
  result={'body':body,'citations':[{'id':'WEB:01','quote':sources[0]['excerpt']}]}
  self.assertTrue(chapter_checks(result,sources,analysis_only=True)[0])
 def test_internal_quote_ids_are_resolved_without_inventing_unknown_references(self):
  from report_harness import resolve_quote_markers
  registry=[{'quote_id':'Q001','id':'WEB:02'}]
  result=resolve_quote_markers('依据Q001，未知Q999。\n### 引用\n- Q001',registry)
  self.assertEqual(result,'依据[WEB:02]，未知Q999。')
 def test_markdown_optional_trailing_pipes_are_not_misread_as_incomplete_rows(self):
  body='| 项目 | 证据 | 判断 |\n| --- | --- | --- |\n| 版本 | 原始文档 | 待对版\n| 客户 | 没有选入 | 不推断意向'
  result=normalize_chapter_markdown(body);self.assertEqual(result,body);self.assertNotIn('<br>|',result)
 def test_new_table_rows_never_get_merged_to_fill_a_missing_cell(self):
  body='| A | B | C |\n| --- | --- | --- |\n| first | incomplete\n| second | complete | row |'
  result=normalize_chapter_markdown(body);self.assertIn('\n| second',result);self.assertNotIn('<br>| second',result)
 def test_source_glyph_cleaning_and_credential_filtering(self):
  self.assertEqual(clean_pdf('灵⼼心巧⼿手（北北京）'),'灵心巧手（北京）')
  self.assertNotIn('demo_test_password',redact('password=demo_test_password'))
class BridgeTests(unittest.TestCase):
 def test_research_routes_do_not_break_static_assets_or_origin_boundary(self):
  path=Path(__file__).resolve().parents[1]/'scripts/local-model-bridge.py'
  spec=importlib.util.spec_from_file_location('research_test_bridge',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  server=module.ThreadingHTTPServer(('127.0.0.1',0),module.Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base='http://127.0.0.1:'+str(server.server_port)
  try:
   for route in ['/api/research/jobs','/tools/market-report/index.html','/tools/market-report/research-client.mjs']:
    with urllib.request.urlopen(base+route,timeout=5) as response:self.assertEqual(response.status,200)
   with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(urllib.request.Request(base+'/api/research/jobs',headers={'Origin':'https://untrusted.example'}),timeout=5)
   self.assertEqual(error.exception.code,403);error.exception.close()
  finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
