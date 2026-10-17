let contextCatalog, selectedContext;
const privateContextReady=import("./private-context.mjs?v=20261017-personal1").then(api=>{contextCatalog=api.contextCatalog;selectedContext=api.selectedContext;});
const state = {
  files: [],
  extractedText: "",
  report: "",
  profile: {},
  downloads: {},
  running: false
};

const pdfWorkerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const fileList = document.getElementById("fileList");
const runBtn = document.getElementById("runBtn");
const progressFill = document.getElementById("progressFill");
const overallPercent = document.getElementById("overallPercent");
const steps = Array.from(document.querySelectorAll("#steps li"));
const activityLog = document.getElementById("activityLog");
const clearLogBtn = document.getElementById("clearLogBtn");
const reportPreview = document.getElementById("reportPreview");
const downloadReportBtn = document.getElementById("downloadReportBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const syncWorkspaceBtn = document.getElementById("syncWorkspaceBtn");
const copyCodexBtn = document.getElementById("copyCodexBtn");
const profileForm = document.getElementById("profileForm");
const systemDot = document.getElementById("systemDot");
const systemStatus = document.getElementById("systemStatus");
const systemHint = document.getElementById("systemHint");


function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fileKind(file) {
  const raw = file.file || file;
  const name = raw.name.toLowerCase();
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "Word";
  if (/\.(png|jpg|jpeg|webp)$/.test(name)) return "图片";
  if (/\.(xlsx|xls|csv)$/.test(name)) return "表格";
  if (/\.(txt|md)$/.test(name)) return "文本";
  return "文件";
}

function renderFiles() {
  if (!state.files.length) {
    fileList.innerHTML = '<p class="empty-state">还没有上传资料。</p>';
    return;
  }

  fileList.innerHTML = state.files
    .map(
      (item) => {
        const file = item.file || item;
        return `
        <div class="file-row" data-file-id="${item.id}">
          <div>
            <strong>${escapeHtml(file.name)}</strong>
            <small>${formatBytes(file.size)} · ${fileKind(item)} · ${escapeHtml(item.status || "等待抽取")}</small>
            ${item.message ? `<small>${escapeHtml(item.message)}</small>` : ""}
          </div>
          <div class="file-actions">
            <span class="file-badge">${item.text ? `${item.text.length} 字` : fileKind(item)}</span>
            <button class="text-action" type="button" data-remove-file="${item.id}">删除</button>
          </div>
        </div>
      `;
      }
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function log(message) {
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  if (activityLog.textContent.trim() === "等待开始。") activityLog.innerHTML = "";
  activityLog.insertAdjacentHTML("beforeend", `<p>[${time}] ${escapeHtml(message)}</p>`);
  activityLog.scrollTop = activityLog.scrollHeight;
}

function setSystemStatus(status, hint, mode = "idle") {
  systemStatus.textContent = status;
  systemHint.textContent = hint;
  systemDot.className = `status-dot ${mode === "idle" ? "" : mode}`;
}

async function extractDocuments() {
  const chunks = [];
  for (const item of state.files) {
    item.status = "抽取中";
    item.message = "正在读取文件内容。";
    renderFiles();
    try {
      item.text = await extractOneDocument(item.file);
      item.status = item.text ? "已抽取" : "无可读文本";
      item.message = item.text ? `已抽取 ${item.text.length} 个字符。` : "没有识别到可读文本。";
      if (item.text) chunks.push(`\n\n--- ${item.file.name} ---\n${item.text}`);
      log(`${item.file.name}：${item.message}`);
    } catch (error) {
      item.text = "";
      item.status = "抽取失败";
      item.message = error.message;
      log(`${item.file.name}：抽取失败，${error.message}`);
    }
  }
  renderFiles();
  state.extractedText = chunks.join("\n");
  return state.extractedText;
}

async function extractOneDocument(file) {
  const name = file.name.toLowerCase();
  if (/\.(txt|md|csv)$/i.test(name)) return (await file.text()).split("\n").map((line, i) => `[行 ${i + 1}] ${line}`).join("\n");
  if (/\.(xlsx|xls)$/i.test(name)) return extractSpreadsheet(file);
  if (/\.docx$/i.test(name)) return extractDocx(file);
  if (/\.pdf$/i.test(name)) return extractPdf(file);
  if (/\.(png|jpg|jpeg|webp)$/i.test(name)) {
    throw new Error("图片 OCR 需要后台或 Tesseract 模块，当前先记录文件名。");
  }
  if (/\.doc$/i.test(name)) {
    throw new Error("旧版 .doc 需要后台转换，请另存为 .docx 后上传。");
  }
  return "";
}

async function extractPdf(file) {
  const pdfjs = window.pdfjsLib || globalThis.pdfjsLib;
  if (!pdfjs) throw new Error("PDF 解析库未加载，请刷新后重试。");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(`[第 ${pageNumber} 页]\n` + content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n\n");
}

async function extractDocx(file) {
  if (!window.mammoth) throw new Error("Word 解析库未加载，请刷新后重试。");
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || "";
}

async function extractSpreadsheet(file) {
  if (!window.XLSX) throw new Error("Excel 解析库未加载，请刷新后重试。");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
  return workbook.SheetNames.map((sheetName) => {
    const csv = window.XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
    return `# ${sheetName}\n${csv}`;
  }).join("\n\n");
}

function getProfile() {
  const formData = new FormData(profileForm);
  return Object.fromEntries(formData.entries());
}


function download(name, content, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stage(index, title) {
  overallPercent.textContent = title;
  progressFill.style.width = "0%";
  steps.forEach((step, i) => { step.classList.toggle("done", i < index); step.classList.toggle("running", i === index); });
  log(title);
}
function packet() { return `# 拜访评估输入资料（尚未评估）\n${JSON.stringify(state.profile, null, 2)}\n${state.extractedText}`; }
function invalidate(clearCheckpoint=true) {
  if(clearCheckpoint)state.checkpoint={};
  state.report = ""; state.audit = null;
  syncWorkspaceBtn.disabled = copyCodexBtn.disabled = true;
  downloadReportBtn.disabled = downloadJsonBtn.disabled = true;
  document.getElementById("downloadPdfBtn").disabled=document.getElementById("printReportBtn").disabled=true;
  reportPreview.textContent = "资料已变化，需要重新评估。";
}
async function runPipeline() {
  if (state.running) return;
  state.profile = getProfile();
  invalidate(false); state.running = true; runBtn.disabled = true; fileInput.disabled = true;
  const controls=[document.getElementById('loadReport'),...document.querySelectorAll('#profile input,#profile select,#profile textarea,#privateContext input,#privateContext select,#privateContext button,#connection input,#connection select,#connection textarea,#connection button')];
  const previousDisabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);
  try {
    stage(0, "正在提取实际文件文本");
    const privateEvidence=await collectPrivateContext();
    state.profile.privateEvidence=privateEvidence;
    await extractDocuments();
    if(!state.files.length && (privateEvidence.customer || privateEvidence.products.length || privateEvidence.visit || privateEvidence.communications.length)) state.extractedText="未上传新增文件。本次以项目档案中明确选择的专有客户、产品与拜访资料为分析依据，不将此说明当作业务证据。";
    if (!state.extractedText.trim()) throw new Error("没有可读文本，请上传文字版 PDF、DOCX、表格或文本。");
    syncWorkspaceBtn.disabled = copyCodexBtn.disabled = false;
    if (state.files.some(f => !f.text.trim())) throw new Error("部分文件未能读取；请补充 OCR 文本或移除这些文件后重试，避免遗漏资料。");
    const local = document.getElementById("provider").value === "local";
    const key = document.getElementById("apiKey").value.trim();
    if (!local && !key) throw new Error("云端模式需要 API 密钥；本地模式不需要。");
    let result;
    if(local) {
      const {generateLocalReport} = await import("./local-engine.mjs?v=20261017-personal1");
      result = await generateLocalReport({endpoint:document.getElementById("localEndpoint").value, model:document.getElementById("modelName").value.trim(), profile:state.profile, documents:state.extractedText, evidence:document.getElementById("researchEvidence").value, onStage:stage,checkpoint:state.checkpoint ||= {}});
    } else {
      const {generateReport} = await import("./engine.mjs?v=20261017-personal1");
      result = await generateReport({key, model: document.getElementById("modelName").value.trim(), profile: state.profile, documents: state.extractedText, onStage:stage});
    }
    result.report += privateEvidenceIndex(privateEvidence);
    state.report = result.report; state.audit = result;
    reportPreview.replaceChildren();
    const {renderMarkdown} = await import("./render.mjs?v=20261017-personal1");
    reportPreview.innerHTML = renderMarkdown(state.report);
    downloadReportBtn.disabled = downloadJsonBtn.disabled = false;
    document.getElementById("downloadPdfBtn").disabled=document.getElementById("printReportBtn").disabled=false;
    stage(6, local ? "本地评估草稿已生成 · 外部证据待核实" : "报告已生成 · 待人工复核");
    setSystemStatus(local ? "本地草稿已生成" : "报告已生成", local ? "真实本地模型分析；未执行自动网络研究" : "已执行模型与网络研究；商业判断仍需人工复核", "done");
  } catch (error) {
    overallPercent.textContent = "评估未完成";
    steps.forEach(step => step.classList.remove("running"));
    if(error.audit){state.audit=error.audit;downloadJsonBtn.disabled=false;}
    log(error.message); reportPreview.textContent = error.message+" 已完成阶段保留在本页；不改资料点击生成可重试，刷新或关闭页面会清除。可下载研究证据查看失败记录。";
    setSystemStatus("评估未完成", "不会生成模板报告或虚假报价", "idle");
  } finally { state.running = false; runBtn.disabled = false; fileInput.disabled = false; controls.forEach((c,i)=>c.disabled=previousDisabled[i]); }
}
function addFiles(files) {
  if(state.running) return;
  invalidate();
  for (const file of files) state.files.push({id:crypto.randomUUID(), file, text:"", status:"等待抽取"});
  renderFiles();
}
fileInput.addEventListener("change", e => addFiles(e.target.files));
for (const name of ["dragover", "drop"]) dropzone.addEventListener(name, e => { e.preventDefault(); if(name === "drop") addFiles(e.dataTransfer.files); });
fileList.addEventListener("click", e => {const b=e.target.closest("[data-remove-file]"); if(b && !state.running) { state.files=state.files.filter(f=>f.id!==b.dataset.removeFile); invalidate(); renderFiles(); }});
profileForm.addEventListener("input", invalidate);
runBtn.addEventListener("click", runPipeline);
clearLogBtn.addEventListener("click", () => activityLog.textContent = "等待开始。");
downloadReportBtn.addEventListener("click", () => {if(state.report) download("市场与代理可行性评估.md",state.report);});
downloadJsonBtn.addEventListener("click", () => {if(state.audit) download("研究证据.json",JSON.stringify(state.audit,null,2),"application/json");});
syncWorkspaceBtn.addEventListener("click", () => download("待评估资料包.md",packet()));
copyCodexBtn.addEventListener("click", async () => {try {await navigator.clipboard.writeText("请按灵心巧手欧洲市场与代理报告的论证思路重新研究，区分资料事实、公开证据与判断，不虚构数据。\n"+packet()); log("已复制待评估资料包，尚未生成报告。");} catch {download("待评估资料包.md",packet());}});
renderFiles();

document.getElementById("provider").addEventListener("change", () => {
  const local=document.getElementById("provider").value === "local";
  document.getElementById("keyLabel").hidden=local;
  document.getElementById("modelName").value=local?"openai/gpt-oss-20b":"gpt-4.1";
  invalidate();
});


const localServiceBase="http://localhost:4183";
let catalog={customers:[],products:[],communications:[]}, localVisits=[];
function readBrowser(key,validator){const raw=localStorage.getItem(key);return raw?validator(JSON.parse(raw)):null;}
async function reloadCRM() {
  await privateContextReady;
  if(state.running)return;
  const status=document.getElementById("crmStatus");
  let messages=[];
  try {catalog=contextCatalog(readBrowser("opc-techbridge-crm-v2",OPCCRM.normalize),readBrowser("opc-workbench-v2",OPCWorkbench.normalize));}
  catch(error){catalog=contextCatalog(null,null);messages.push("浏览器资料读取失败："+error.message);}
  localVisits=[];
  try {
    const response=await fetch(localServiceBase+"/api/context",{signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const local=await response.json();
    catalog.customers.push(...contextCatalog({customers:local.customers},null).customers);
    localVisits=local.visits || [];
    messages.push("Mac本地资料已连接");
  } catch {messages.push("Mac本地资料服务未连接；可在本地评估页读取拜访，或导入备份");}
  if(state.running)return;
  fillContextChoices();
  status.textContent=`可选客户 ${catalog.customers.length} · 产品 ${catalog.products.length} · 沟通 ${catalog.communications.length} · 现场拜访 ${localVisits.length}。`+messages.join("；");
}
function fillContextChoices(){
  const option=(id,label)=>{const o=document.createElement("option");o.value=id;o.textContent=label;return o;};
  const customers=document.getElementById("crmCustomer");customers.replaceChildren(option("","不使用客户档案"));catalog.customers.forEach(c=>customers.append(option(c.id,c.company)));
  const products=document.getElementById("crmProducts");products.replaceChildren();catalog.products.forEach(p=>products.append(option(p.id,p.title)));
  const visits=document.getElementById("crmVisit");visits.replaceChildren(option("","不使用现场拜访"));localVisits.forEach(v=>visits.append(option(v.id,`${v.customer} · ${(v.created_at||"").slice(0,10)} · ${v.clip_count}段`)));
  invalidate();contextSelectionChanged();
}
function contextSelectionChanged(){
  if(state.running)return;
  const id=document.getElementById("crmCustomer").value, customer=catalog.customers.find(c=>c.id===id);
  const products=[...document.getElementById("crmProducts").selectedOptions].map(o=>o.value);
  const product=catalog.products.find(p=>p.id===products[0]);
  if(customer){profileForm.elements.customer.value=customer.company;if(!profileForm.elements.industry.value)profileForm.elements.industry.value=customer.sector;}
  if(product)profileForm.elements.product.value=product.title;
  const communications=id?catalog.communications.filter(c=>c.customerId===id).length:0;
  const selectedVisit=localVisits.find(v=>v.id===document.getElementById("crmVisit").value);
  if(!customer && selectedVisit)profileForm.elements.customer.value=selectedVisit.customer;
  const crossWarning=customer && selectedVisit && customer.company.trim()!==selectedVisit.customer.trim()?" 注意：拜访原客户与所选档案不同，将按跨客户参考处理。":"";
  document.getElementById("contextSummary").textContent=`本次选用：${customer?customer.company:"未选客户"} · ${products.length}个产品 · ${communications}条关联纪要 · ${document.getElementById("crmVisit").value?"已选现场拜访（转写待复核）":"未选现场拜访"}。`+crossWarning;
  invalidate();
}
async function collectPrivateContext(){
  await privateContextReady;
  const visitId=document.getElementById("crmVisit").value;let visit=null;
  if(visitId){const response=await fetch(localServiceBase+"/api/visit-evidence?id="+encodeURIComponent(visitId),{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error("未取得选中拜访资料，已阻止遗漏证据的评估。");visit=await response.json();}
  return selectedContext(catalog,{customerId:document.getElementById("crmCustomer").value,productIds:[...document.getElementById("crmProducts").selectedOptions].map(o=>o.value),visit});
}
function privateEvidenceIndex(e){
  const rows=[];const clean=s=>String(s||"").replaceAll("|","／").replaceAll("\n"," ");
  if(e.customer)rows.push([e.customer.evidenceId,e.customer.company,e.customer.updatedAt,"客户档案；按原记录的来源核实"]);
  e.products.forEach(p=>rows.push([p.evidenceId,p.title,p.updatedAt,"专有产品资料"]));
  e.communications.forEach(c=>rows.push([c.evidenceId,c.title,c.date,c.state==="confirmed"?"用户已确认纪要":"待确认纪要"]));
  if(e.visit)e.visit.clips.forEach(c=>rows.push([c.evidenceId,e.visit.customer,c.date,"ASR转写，未逐字人工复核"]));
  if(!rows.length)return "\n\n## 专有业务证据使用说明\n本次未选择 CRM、产品或现场拜访资料；不得声称已结合用户独有客户情报。\n";
  return "\n\n## 本次专有业务证据索引\n以下资料由用户明确选择，仅用于本次私有评估。证据的独有性不等于真实性已经独立核实。\n\n| 证据 ID | 客户／资料 | 日期 | 证据边界 |\n| --- | --- | --- | --- |\n"+rows.map(row=>"| "+row.map(clean).join(" | ")+" |").join("\n");
}
document.getElementById("reloadCRM").addEventListener("click",reloadCRM);
for(const id of ["crmCustomer","crmProducts","crmVisit"])document.getElementById(id).addEventListener("change",contextSelectionChanged);
document.getElementById("contextImport").addEventListener("change",async event=>{
  if(state.running)return;
  try {
    const file=event.target.files[0];if(!file)return;if(file.size>5000000)throw new Error("备份超过5MB，请拆分资料");
    const data=JSON.parse(await file.text());
    const incoming=data.version===2?contextCatalog(OPCCRM.normalize(data),null):contextCatalog(null,OPCWorkbench.normalize(data));
    for(const key of ["customers","products","communications"]){for(const record of incoming[key]){const old=catalog[key].find(c=>c.id===record.id);if(old&&JSON.stringify(old)!==JSON.stringify(record))throw new Error("存在同ID不同版本资料，请先核对，不会覆盖。");}}
    for(const key of ["customers","products","communications"])catalog[key]=[...new Map([...catalog[key],...incoming[key]].map(r=>[r.id,r])).values()];
    fillContextChoices();document.getElementById("crmStatus").textContent=`备份已读取：客户 ${catalog.customers.length}，产品 ${catalog.products.length}，纪要 ${catalog.communications.length}。未写回CRM。`;
  } catch(error){document.getElementById("crmStatus").textContent=error.message;}
});
document.getElementById("downloadPdfBtn").addEventListener("click",async()=>{
  if(!state.report)return;const button=document.getElementById("downloadPdfBtn");button.disabled=true;button.textContent="正在排版PDF…";
  try {
    const response=await fetch(localServiceBase+"/api/report/pdf",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({report:state.report,profile:{customer:state.profile.customer,product:state.profile.product},createdAt:state.audit.createdAt}),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error("本地PDF服务 HTTP "+response.status);
    const blob=await response.blob();if(blob.type!=="application/pdf")throw new Error("返回的文件不是PDF");
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(state.profile.product||"市场与代理可行性评估")+".pdf";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);log("PDF已生成并下载，资料仅在本机排版。");
  } catch(error){log(error.message+"。请打开本地评估页重试，或点击‘打印 / 另存 PDF’。");}
  finally {button.disabled=false;button.textContent="下载 PDF";}
});
document.getElementById("printReportBtn").addEventListener("click",()=>{if(state.report)window.print();});
reloadCRM();

document.getElementById("loadReport").addEventListener("change",async event=>{
  if(state.running)return;
  try {
    const file=event.target.files[0];if(!file)return;if(file.size>2000000)throw new Error("报告文件超过2MB");
    const raw=await file.text();let report=raw,profile={},original={};
    if(file.name.toLowerCase().endsWith(".json")){original=JSON.parse(raw);report=original.report;profile=original.profile||{};}
    if(typeof report!=="string" || !report.trim() || report.length>180000)throw new Error("未找到有效报告正文，或正文超过180000字符");
    state.report=report;state.profile=profile;state.audit={...original,report,profile,status:"imported_unverified",sourceStatus:original.status||"unknown",createdAt:original.createdAt||"日期未提供",importedAt:new Date().toISOString()};
    const {renderMarkdown}=await import("./render.mjs?v=20261017-personal1");reportPreview.innerHTML=renderMarkdown(report);
    downloadReportBtn.disabled=downloadJsonBtn.disabled=false;
    document.getElementById("downloadPdfBtn").disabled=document.getElementById("printReportBtn").disabled=false;
    overallPercent.textContent="历史报告已载入 · 未重新研究";setSystemStatus("历史报告已载入","可导出PDF；没有执行新的模型分析或事实核验");log("已载入历史报告，仅排版导出，未重新研究。");
  } catch(error){log(error.message);}
});
