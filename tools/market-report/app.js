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
function invalidate() {
  state.report = ""; state.audit = null;
  syncWorkspaceBtn.disabled = copyCodexBtn.disabled = true;
  downloadReportBtn.disabled = downloadJsonBtn.disabled = true;
  reportPreview.textContent = "资料已变化，需要重新评估。";
}
async function runPipeline() {
  if (state.running) return;
  invalidate(); state.running = true; runBtn.disabled = true; fileInput.disabled = true;
  try {
    stage(0, "正在提取实际文件文本");
    state.profile = getProfile();
    await extractDocuments();
    if (!state.extractedText.trim()) throw new Error("没有可读文本，请上传文字版 PDF、DOCX、表格或文本。");
    syncWorkspaceBtn.disabled = copyCodexBtn.disabled = false;
    if (state.files.some(f => !f.text.trim())) throw new Error("部分文件未能读取；请补充 OCR 文本或移除这些文件后重试，避免遗漏资料。");
    const key = document.getElementById("apiKey").value.trim();
    if (!key) throw new Error("文本已提取，但尚未连接模型。请填写本次使用的 API 密钥，或下载分析资料包交给 Codex 研究。尚未生成报告。");
    if (!document.getElementById("consent").checked) throw new Error("请先确认资料发送授权。");
    const {generateReport} = await import("./engine.mjs?v=20261016-real1");
    const result = await generateReport({key, model: document.getElementById("modelName").value.trim(), profile: state.profile, documents: state.extractedText, onStage:stage});
    state.report = result.report; state.audit = result;
    reportPreview.replaceChildren();
    const {renderMarkdown} = await import("./render.mjs?v=20261016-real1");
    reportPreview.innerHTML = renderMarkdown(state.report);
    downloadReportBtn.disabled = downloadJsonBtn.disabled = false;
    stage(6, "报告已生成 · 待人工复核");
    setSystemStatus("报告已生成", "已执行模型与网络研究；商业判断仍需人工复核", "done");
  } catch (error) {
    overallPercent.textContent = "评估未完成";
    steps.forEach(step => step.classList.remove("running"));
    log(error.message); reportPreview.textContent = error.message;
    setSystemStatus("评估未完成", "不会生成模板报告或虚假报价", "idle");
  } finally { state.running = false; runBtn.disabled = false; fileInput.disabled = false; }
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
