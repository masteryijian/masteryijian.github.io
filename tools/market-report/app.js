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
const MAX_AI_TEXT_CHARS = 24000;

const pipeline = [
  {
    title: "资料接收与分类",
    detail: "识别文件类型、大小、上传批次和可读文本。"
  },
  {
    title: "文本抽取与信息建档",
    detail: "从资料和表单中整理客户、产品、用途、行业和信息缺口。"
  },
  {
    title: "德国市场数据验证",
    detail: "准备官方统计、行业协会、州级产业和采购信号的验证清单。"
  },
  {
    title: "合规与数据安全检查",
    detail: "按产品类别判断 CE、RoHS、REACH、WEEE、GPSR、GDPR、DPA、NDA 等要求。"
  },
  {
    title: "落地模式与成本估算",
    detail: "比较直销、代理、经销、仓储、售后维修和补货周期。"
  },
  {
    title: "报告与报价生成",
    detail: "生成专业简洁报告、项目 JSON 和报价建议。"
  }
];

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

function setProgress(percent, activeIndex) {
  progressFill.style.width = `${percent}%`;
  overallPercent.textContent = `${percent}%`;

  steps.forEach((step, index) => {
    step.classList.remove("running", "done");
    if (index < activeIndex) step.classList.add("done");
    if (index === activeIndex) step.classList.add("running");
    if (percent === 100) {
      step.classList.remove("running");
      step.classList.add("done");
    }
  });
}

function resetProgressView() {
  progressFill.style.width = "0%";
  overallPercent.textContent = "0%";
  steps.forEach((step) => step.classList.remove("running", "done"));
  reportPreview.innerHTML = "<p>正在生成报告，完成后这里会显示报告预览。</p>";
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
  if (/\.(txt|md|csv)$/i.test(name)) return file.text();
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
    pages.push(content.items.map((item) => item.str).join(" "));
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

function estimate(profile) {
  const unitCost = Number(profile.unitCost || 0);
  const monthlyVolume = Number(profile.monthlyVolume || 0);
  const logistics = Math.max(unitCost * 0.12, 1.5);
  const complianceReserve = unitCost * 0.06;
  const afterSales = unitCost * 0.05;
  const channel = unitCost * 0.15;
  const landedCost = unitCost + logistics + complianceReserve + afterSales + channel;
  const suggestedLow = landedCost / 0.68;
  const suggestedHigh = landedCost / 0.58;
  const monthlyFixed = monthlyVolume > 0 ? 1800 + Math.min(monthlyVolume * 1.6, 5200) : 2500;

  return {
    landedCost,
    suggestedLow,
    suggestedHigh,
    monthlyFixed
  };
}

function complianceItems(category) {
  const common = ["包装法 VerpackG", "GPSR 通用产品安全", "NDA 保密协议", "销售与保修条款"];
  if (category === "电子电器") {
    return ["CE", "RoHS", "REACH", "WEEE", "电池法 BattG 如含电池", ...common];
  }
  if (category === "软件 / 数据产品") {
    return ["GDPR", "DPA 数据处理协议", "TOMs 技术和组织措施", "数据托管位置说明", "信息安全附件", ...common];
  }
  if (category === "医疗 / 健康") {
    return ["MDR 医疗器械法规判断", "CE", "临床或安全资料", "德语说明书", ...common];
  }
  if (category === "工业设备") {
    return ["CE", "机械指令/机械法规判断", "EMC 如含电子部件", "REACH", "德语安全说明", ...common];
  }
  return common;
}

function buildReport() {
  const profile = getProfile();
  const costs = estimate(profile);
  const files = state.files.map((item) => `- ${item.file.name} (${fileKind(item)}, ${formatBytes(item.file.size)})：${item.status || "等待抽取"}`).join("\n");
  const product = profile.product || "待填写产品";
  const customer = profile.customer || "待填写客户";
  const industry = profile.industry || "待确认行业";
  const focus = profile.focus || "市场潜力、合规、数据安全、仓储、售后、报价";
  const extractedPreview = state.extractedText
    ? state.extractedText.slice(0, 1600)
    : "当前没有识别到可读内容；如果资料是扫描件图片，请先补充 OCR 文本或在项目档案中粘贴关键纪要。";

  state.profile = {
    customer,
    product,
    category: profile.category,
    industry,
    focus,
    files: state.files.map((item) => ({
      name: item.file.name,
      size: item.file.size,
      type: item.file.type,
      kind: fileKind(item),
      status: item.status,
      extracted_chars: item.text ? item.text.length : 0,
      message: item.message || ""
    })),
    extracted_text_chars: state.extractedText.length,
    analysis: {
      executiveSummary: "AI 分析尚未完成。这里仅保存浏览器抽取到的资料包，不冒充市场判断。",
      marketScore: null,
      opportunities: [],
      risks: [],
      missing: [],
      nextSteps: ["配置 Netlify 环境变量 ANTHROPIC_AUTH_TOKEN 或 OPENAI_API_KEY 后重新评估", "或点击“复制给 Codex 分析”并粘贴回当前对话"]
    },
    cost_estimate_eur: {
      landed_cost_per_unit: Number(costs.landedCost.toFixed(2)),
      suggested_price_low: Number(costs.suggestedLow.toFixed(2)),
      suggested_price_high: Number(costs.suggestedHigh.toFixed(2)),
      estimated_monthly_fixed_cost: Number(costs.monthlyFixed.toFixed(2))
    },
    ai: {
      status: "not_completed"
    },
    generated_at: new Date().toISOString()
  };

  state.report = `# 待 AI 分析的拜访资料包

AI 分析尚未完成。以下内容只是浏览器端抽取出的资料包和可计算字段，不是市场判断，也不是最终拜访报告。

## 1. 项目档案

- 客户：${customer}
- 产品：${product}
- 产品类别：${profile.category}
- 目标行业：${industry}
- 重点关注：${focus}

## 2. 已上传资料

${files || "- 暂无文件"}

## 3. 浏览器可读资料预览

${extractedPreview}

## 4. 可计算成本字段

- 单件落地成本估算：EUR ${costs.landedCost.toFixed(2)}
- 建议报价低位：EUR ${costs.suggestedLow.toFixed(2)}
- 建议报价高位：EUR ${costs.suggestedHigh.toFixed(2)}
- 月度固定成本估算：EUR ${costs.monthlyFixed.toFixed(2)}

## 5. 下一步

- 如果要让网站自动生成报告：在 Netlify 环境变量中配置 ANTHROPIC_AUTH_TOKEN 或 OPENAI_API_KEY，然后重新部署。
- 如果要回到这里分析：点击“复制给 Codex 分析”，把内容粘贴回当前对话。
- 如果资料是图片或扫描件：先补充 OCR 文本或手动粘贴关键纪要。
`;

  return state.report;
}

function buildAnalysisPayload() {
  const profile = getProfile();
  return {
    profile,
    files: state.files.map((item) => ({
      name: item.file.name,
      size: item.file.size,
      type: item.file.type,
      kind: fileKind(item),
      status: item.status,
      message: item.message || "",
      extracted_chars: item.text ? item.text.length : 0
    })),
    extractedText: state.extractedText.slice(0, MAX_AI_TEXT_CHARS),
    extractedTextTruncated: state.extractedText.length > MAX_AI_TEXT_CHARS,
    generatedAt: new Date().toISOString()
  };
}

function buildCodexPrompt(payload = buildAnalysisPayload()) {
  return `请你作为 OPC TechBridge 的德国市场进入顾问，基于下面项目档案和文档抽取内容，生成一份真实的拜访评估报告。

要求：
1. 不要假装联网，不要编造来源；如果需要外部数据，请列出需要验证的来源清单。
2. 输出 Markdown，包含：项目摘要、文档关键信息、德国/欧盟市场机会、合规与数据安全风险、客户拜访问题清单、报价/落地模式建议、下一步任务。
3. 明确哪些判断来自资料，哪些只是推断。
4. 如果资料不足，请直接指出缺口。

项目与资料 JSON：

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`
`;
}

function renderReport() {
  reportPreview.innerHTML = `<pre>${escapeHtml(state.report)}</pre>`;
  downloadReportBtn.disabled = false;
  downloadJsonBtn.disabled = false;
  syncWorkspaceBtn.disabled = false;
  copyCodexBtn.disabled = false;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function profileFormData() {
  const data = new FormData();
  const profile = getProfile();
  Object.entries(profile).forEach(([key, value]) => data.append(key, value || ""));
  state.files.forEach((item) => data.append("files", item.file, item.file.name));
  return data;
}

async function analyzeWithAI(payload) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("AI 接口没有返回 JSON，请检查 Netlify Function。");
  }

  const result = await response.json();
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || "AI 分析失败");
    error.code = result.code || "AI_ANALYZE_FAILED";
    error.detail = result.detail || "";
    throw error;
  }
  return result;
}

async function runPipeline() {
  if (state.running) return;
  state.running = true;
  runBtn.disabled = true;
  runBtn.textContent = "评估中...";
  downloadReportBtn.disabled = true;
  downloadJsonBtn.disabled = true;
  syncWorkspaceBtn.disabled = true;
  copyCodexBtn.disabled = true;
  activityLog.innerHTML = "";
  resetProgressView();
  setSystemStatus("评估中", "正在生成进度和报告", "running");
  setProgress(0, 0);
  document.getElementById("progress").scrollIntoView({ behavior: "smooth", block: "start" });
  log("评估任务启动。");
  if (!state.files.length) {
    log("提示：当前没有上传文件，将根据表单内容生成基础报告。");
  }

  for (let index = 0; index < pipeline.length - 1; index += 1) {
    const percent = Math.round((index / pipeline.length) * 100);
    setProgress(percent, index);
    log(`${pipeline[index].title}：${pipeline[index].detail}`);
    await new Promise((resolve) => setTimeout(resolve, 720));
  }

  setProgress(84, pipeline.length - 1);
  log("报告与报价生成：正在读取上传文档。");
  await extractDocuments();
  log(`浏览器读取完成：共抽取 ${state.extractedText.length} 个字符。`);
  const analysisPayload = buildAnalysisPayload();
  log("正在调用 AI 接口 /api/analyze 生成真实拜访报告。");
  try {
    const aiResult = await analyzeWithAI(analysisPayload);
    state.report = aiResult.report;
    state.profile = aiResult.profile || {
      ...analysisPayload.profile,
      files: analysisPayload.files,
      extracted_text_chars: state.extractedText.length,
      generated_at: new Date().toISOString(),
      ai: aiResult.ai || {}
    };
    state.downloads = {};
    renderReport();
    setProgress(100, pipeline.length - 1);
    setSystemStatus("AI 分析完成", "报告由 OpenAI 生成，可下载或同步到 CRM / 助理", "done");
    log(`AI 分析完成：${aiResult.ai?.model || "OpenAI"}。`);
  } catch (error) {
    buildReport();
    renderReport();
    setProgress(100, pipeline.length - 1);
    setSystemStatus("AI 未完成", "已生成可复制给 Codex 的分析包", "done");
    log(`AI 分析未完成：${error.message}`);
    if (error.code === "AI_KEY_MISSING") {
      log("需要在 Netlify 环境变量中配置 ANTHROPIC_AUTH_TOKEN 或 OPENAI_API_KEY。");
    }
    log("已保留本地资料抽取结果。请点击“复制给 Codex 分析”，回到这里让我继续分析。");
  }
  document.getElementById("report").scrollIntoView({ behavior: "smooth", block: "start" });
  state.running = false;
  runBtn.disabled = false;
  runBtn.textContent = "重新评估";
}

function addFiles(files) {
  const wrapped = Array.from(files).map((file) => ({
    id: `file_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    file,
    text: "",
    status: "等待抽取",
    message: ""
  }));
  state.files = [...state.files, ...wrapped];
  renderFiles();
  setSystemStatus("资料已接收", `${state.files.length} 个文件等待评估`, "idle");
  log(`已加入 ${files.length} 个文件。`);
  reportPreview.innerHTML = "<p>资料已上传。点击“开始评估”后会生成报告预览和下载文件。</p>";
  downloadReportBtn.disabled = true;
  downloadJsonBtn.disabled = true;
  copyCodexBtn.disabled = true;
}

fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  addFiles(event.dataTransfer.files);
});

fileList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-file]");
  if (!button) return;
  state.files = state.files.filter((item) => item.id !== button.dataset.removeFile);
  state.extractedText = state.files.map((item) => item.text).filter(Boolean).join("\n\n");
  renderFiles();
  setSystemStatus("资料已更新", `${state.files.length} 个文件等待评估`, "idle");
  log("已删除一个上传文件。");
});

runBtn.addEventListener("click", runPipeline);

clearLogBtn.addEventListener("click", () => {
  activityLog.innerHTML = "<p>等待开始。</p>";
});

downloadReportBtn.addEventListener("click", () => {
  if (state.downloads.report) {
    window.location.href = state.downloads.report;
    return;
  }
  download("germany-market-report.md", state.report, "text/markdown;charset=utf-8");
});

downloadJsonBtn.addEventListener("click", () => {
  if (state.downloads.json) {
    window.location.href = state.downloads.json;
    return;
  }
  download("customer-product-profile.json", JSON.stringify(state.profile, null, 2), "application/json;charset=utf-8");
});

copyCodexBtn.addEventListener("click", async () => {
  const prompt = buildCodexPrompt();
  try {
    await navigator.clipboard.writeText(prompt);
    log("已复制 Codex 分析包。回到 Codex 对话粘贴即可继续分析。");
    setSystemStatus("已复制分析包", "可以回到 Codex 对话继续真实分析", "done");
  } catch {
    download("codex-market-analysis-prompt.md", prompt, "text/markdown;charset=utf-8");
    log("浏览器不允许写剪贴板，已下载 Codex 分析包 Markdown。");
  }
});

syncWorkspaceBtn.addEventListener("click", () => {
  if (!state.profile || !Object.keys(state.profile).length) return;
  const sharedKey = "opc-shared-crm";
  const assistantKey = "opc-assistant-store";
  const shared = readJson(sharedKey, {});
  const assistant = readJson(assistantKey, {});
  const customer = state.profile.customer || "待填写客户";
  const reportId = `market_report_${Date.now()}`;
  const taskId = `market_task_${Date.now()}`;
  const logId = `market_log_${Date.now()}`;
  const reportItem = {
    id: reportId,
    name: `${customer} - 德国市场拜访评估报告`,
    owner: "OPC",
    status: "ready",
    due: new Date().toISOString().slice(0, 10),
    link: "../market-report/index.html",
    notes: state.profile.analysis?.executiveSummary || "市场评估已生成"
  };
  const taskItem = {
    id: taskId,
    title: `跟进 ${customer} 市场评估报告`,
    date: new Date().toISOString().slice(0, 10),
    customer,
    channel: "internal",
    priority: "high",
    status: "open",
    duration: 45,
    notes: (state.profile.analysis?.nextSteps || []).join("；")
  };
  const logItem = {
    id: logId,
    customer,
    contact: "",
    note: `市场评估已生成，评分 ${state.profile.analysis?.marketScore || "-"} / 100。`,
    nextStep: taskItem.notes,
    createdAt: new Date().toISOString()
  };
  const nextShared = {
    ...shared,
    updatedAt: new Date().toISOString(),
    marketReports: [...(shared.marketReports || []), state.profile],
    reports: [reportItem, ...(shared.reports || [])],
    tasks: [taskItem, ...(shared.tasks || [])],
    logs: [logItem, ...(shared.logs || [])]
  };
  const nextAssistant = {
    ...assistant,
    reports: [reportItem, ...(assistant.reports || [])],
    tasks: [taskItem, ...(assistant.tasks || [])],
    logs: [logItem, ...(assistant.logs || [])]
  };
  localStorage.setItem(sharedKey, JSON.stringify(nextShared));
  localStorage.setItem(assistantKey, JSON.stringify(nextAssistant));
  log("已同步到本地 CRM / 助理共享数据池。");
  setSystemStatus("已同步", "CRM 和助理可读取该报告、任务与日志", "done");
});

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

renderFiles();
