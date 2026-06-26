const today = new Date().toISOString().slice(0, 10);
const sharedKey = "opc-shared-crm";
const assistantKey = "opc-assistant-store";

const seed = {
  tasks: [
    { id: "task_demo_1", title: "整理德国客户拜访清单", date: today, customer: "Muster GmbH", channel: "visit", priority: "high", status: "open", duration: 90, notes: "确认决策人和技术联系人" },
    { id: "task_demo_2", title: "发送报价跟进", date: today, customer: "RheinWerk", channel: "email", priority: "medium", status: "open", duration: 45, notes: "附一页式报告" }
  ],
  contacts: [
    { id: "contact_demo_1", name: "Johannes Keller", company: "RheinWerk Automation", role: "VP Sales DACH", phone: "+49 ...", email: "j.keller@example.eu", whatsapp: "+49 ...", notes: "关注汽车零部件客户" }
  ],
  reports: [
    { id: "report_demo_1", name: "德国市场拜访评估报告", owner: "OPC", status: "ready", due: today, link: "../market-report/index.html", notes: "可用于初次沟通" }
  ],
  logs: [
    { id: "log_demo_1", customer: "RheinWerk", contact: "Johannes", note: "客户希望看到 SAP/OT 集成案例", nextStep: "准备案例摘要", createdAt: new Date().toISOString() }
  ],
  expenses: [
    { id: "exp_demo_1", date: today, category: "交通", amount: 18.4, currency: "EUR", customer: "RheinWerk", project: "客户拜访", reimbursable: "yes", note: "Karlsruhe-Mannheim train" }
  ],
  conversations: [
    { id: "conv_demo_1", date: today, customer: "RheinWerk", contact: "Johannes", channel: "visit", audioName: "", transcript: "客户希望看到 SAP/OT 集成案例，并确认两周内是否可以安排技术评审。", summary: "客户关注 SAP/OT 集成、德国汽车零部件案例和技术评审。", nextSteps: ["准备案例摘要", "约技术评审"], crmUpdates: ["企业需求：SAP/OT 集成案例", "下一步：两周内技术评审"], createdAt: new Date().toISOString() }
  ],
  drafts: [],
  schedule: []
};

let store = loadStore();
let activeTab = "brief";
let recorder = null;
let recordedChunks = [];
let recognition = null;

const formPanel = document.getElementById("formPanel");
const output = document.getElementById("assistantOutput");
const listTitle = document.getElementById("listTitle");

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((node) => node.classList.toggle("active", node === button));
    render();
  });
});

document.getElementById("downloadAssistant").addEventListener("click", () => download("opc-assistant-data.json", JSON.stringify(store, null, 2), "application/json;charset=utf-8"));
document.getElementById("syncCrm").addEventListener("click", () => {
  syncSharedCrm();
  toast("已同步到本地 CRM 数据池。");
});
document.getElementById("resetAssistant").addEventListener("click", () => {
  store = structuredClone(seed);
  saveStore();
  render();
});

function loadStore() {
  const raw = localStorage.getItem(assistantKey);
  const loaded = raw ? JSON.parse(raw) : structuredClone(seed);
  return { ...structuredClone(seed), ...loaded };
}

function saveStore() {
  localStorage.setItem(assistantKey, JSON.stringify(store));
  syncSharedCrm();
}

function syncSharedCrm() {
  const shared = JSON.parse(localStorage.getItem(sharedKey) || "{}");
  const next = {
    ...shared,
    updatedAt: new Date().toISOString(),
    contacts: store.contacts,
    tasks: store.tasks,
    reports: store.reports,
    expenses: store.expenses,
    conversations: store.conversations,
    logs: store.logs
  };
  localStorage.setItem(sharedKey, JSON.stringify(next));
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function render() {
  if (activeTab === "brief") return renderBrief();
  if (activeTab === "schedule") return renderSchedule();
  if (activeTab === "tasks") return renderTasks();
  if (activeTab === "contacts") return renderContacts();
  if (activeTab === "reports") return renderReports();
  if (activeTab === "expenses") return renderExpenses();
  if (activeTab === "conversations") return renderConversations();
  return renderDrafts();
}

function renderBrief() {
  formPanel.innerHTML = `
    <h2>生成每日简报</h2>
    <label>日期<input id="briefDate" type="date" value="${today}"></label>
    <button id="briefBtn" type="button">生成简报</button>
    <p class="muted">简报会综合今日待办、报告、客户沟通、花销和未完成事项。</p>
  `;
  document.getElementById("briefBtn").addEventListener("click", () => writeBrief(document.getElementById("briefDate").value));
  writeBrief(today);
}

function writeBrief(date) {
  const tasks = store.tasks.filter((item) => item.date === date && item.status !== "done").sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const reports = store.reports.filter((item) => ["ready", "pending_review", "in_progress"].includes(item.status));
  const expenses = store.expenses.filter((item) => item.date === date);
  const conversations = store.conversations.filter((item) => item.date === date);
  const totalExpense = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  listTitle.textContent = `${date} 简报`;
  output.textContent = [
    `Daily brief for ${date}`,
    "",
    "1. 今天最重要的事",
    tasks.length ? tasks.slice(0, 5).map((item) => `- [${item.priority}] ${item.title} / ${item.customer || "无客户"} (${item.duration || 45} min)`).join("\n") : "- 今天没有开放待办。",
    "",
    "2. 建议日程",
    buildSchedule(date).map((item) => `- ${item.start}-${item.end} ${item.title}`).join("\n") || "- 暂无可排事项。",
    "",
    "3. 报告与交付",
    reports.length ? reports.map((item) => `- ${item.name} [${item.status}]${item.due ? `, due ${item.due}` : ""}`).join("\n") : "- 没有待处理报告。",
    "",
    "4. 客户沟通",
    conversations.length ? conversations.map((item) => `- ${item.customer}/${item.contact}: ${item.summary || "待分析"} Next: ${(item.nextSteps || []).join("；") || "待确认"}`).join("\n") : "- 今天没有客户沟通记录。",
    "",
    "5. 花销上报",
    expenses.length ? `- 今日共 ${totalExpense.toFixed(2)} EUR：${expenses.map((item) => `${item.category} ${item.amount}`).join("；")}` : "- 今天没有花销记录。"
  ].join("\n");
}

function renderSchedule() {
  listTitle.textContent = "自动日程建议";
  formPanel.innerHTML = `
    <h2>安排今天</h2>
    <div class="form-grid">
      <label>日期<input id="scheduleDate" type="date" value="${today}"></label>
      <label>开始时间<input id="scheduleStart" type="time" value="09:00"></label>
      <label>结束时间<input id="scheduleEnd" type="time" value="18:00"></label>
      <label>缓冲分钟<input id="scheduleBuffer" type="number" min="0" step="5" value="15"></label>
      <label class="wide">固定时间/备注<textarea id="scheduleNotes" rows="3" placeholder="例如：12:30 午饭；16:00 已有客户电话"></textarea></label>
    </div>
    <button id="planDay" type="button">生成日程</button>
  `;
  document.getElementById("planDay").addEventListener("click", () => {
    const date = value("scheduleDate");
    store.schedule = buildSchedule(date, value("scheduleStart"), value("scheduleEnd"), Number(value("scheduleBuffer") || 15));
    saveStore();
    renderScheduleOutput(date);
  });
  renderScheduleOutput(today);
}

function buildSchedule(date, start = "09:00", end = "18:00", buffer = 15) {
  const tasks = store.tasks.filter((item) => item.date === date && item.status !== "done").sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  let cursor = minutes(start);
  const endMinute = minutes(end);
  const blocks = [];
  for (const task of tasks) {
    const duration = Number(task.duration || 45);
    if (cursor + duration > endMinute) break;
    blocks.push({ id: task.id, start: clock(cursor), end: clock(cursor + duration), title: `${task.customer ? `${task.customer} - ` : ""}${task.title}`, priority: task.priority });
    cursor += duration + buffer;
  }
  return blocks;
}

function renderScheduleOutput(date) {
  const blocks = store.schedule.length ? store.schedule : buildSchedule(date);
  output.innerHTML = blocks.length
    ? blocks.map((item) => `<div class="row"><pre>${escapeHtml(`${item.start}-${item.end} [${item.priority}] ${item.title}`)}</pre></div>`).join("")
    : '<p class="muted">没有可安排事项。</p>';
}

function renderTasks() {
  listTitle.textContent = "待办列表";
  formPanel.innerHTML = `
    <h2>新增待办</h2>
    <div class="form-grid">
      <label>标题<input id="taskTitle" placeholder="拜访 Acme CFO"></label>
      <label>日期<input id="taskDate" type="date" value="${today}"></label>
      <label>客户<input id="taskCustomer" placeholder="Acme"></label>
      <label>渠道<select id="taskChannel"><option>visit</option><option>call</option><option>email</option><option>wechat</option><option>whatsapp</option><option>internal</option></select></label>
      <label>优先级<select id="taskPriority"><option>high</option><option selected>medium</option><option>low</option></select></label>
      <label>预计分钟<input id="taskDuration" type="number" min="5" step="5" value="45"></label>
      <label class="wide">备注<textarea id="taskNotes" rows="3"></textarea></label>
    </div>
    <button id="addTask" type="button">保存待办</button>
  `;
  document.getElementById("addTask").addEventListener("click", () => {
    store.tasks.push({ id: uid("task"), title: value("taskTitle"), date: value("taskDate"), customer: value("taskCustomer"), channel: value("taskChannel"), priority: value("taskPriority"), duration: Number(value("taskDuration") || 45), status: "open", notes: value("taskNotes") });
    saveStore();
    renderTasks();
  });
  output.innerHTML = renderRows(store.tasks, (item) => `${item.title}\n${item.date} · ${item.customer || "无客户"} · ${item.channel} · ${item.priority} · ${item.status} · ${item.duration || 45} min\n${item.notes || ""}`);
}

function renderContacts() {
  listTitle.textContent = "联系人";
  formPanel.innerHTML = `
    <h2>新增联系人</h2>
    <div class="form-grid">
      <label>姓名<input id="contactName"></label>
      <label>公司<input id="contactCompany"></label>
      <label>角色<input id="contactRole"></label>
      <label>邮箱<input id="contactEmail" type="email"></label>
      <label>电话<input id="contactPhone"></label>
      <label>WhatsApp<input id="contactWhatsapp"></label>
      <label class="wide">备注<textarea id="contactNotes" rows="3"></textarea></label>
    </div>
    <button id="addContact" type="button">保存联系人</button>
  `;
  document.getElementById("addContact").addEventListener("click", () => {
    store.contacts.push({ id: uid("contact"), name: value("contactName"), company: value("contactCompany"), role: value("contactRole"), email: value("contactEmail"), phone: value("contactPhone"), whatsapp: value("contactWhatsapp"), notes: value("contactNotes") });
    saveStore();
    renderContacts();
  });
  output.innerHTML = renderRows(store.contacts, (item) => `${item.name} / ${item.company}\n${item.role}\n${item.email} ${item.phone} ${item.whatsapp}\n${item.notes || ""}`);
}

function renderReports() {
  listTitle.textContent = "报告状态";
  formPanel.innerHTML = `
    <h2>新增报告</h2>
    <div class="form-grid">
      <label>报告名称<input id="reportName"></label>
      <label>负责人<input id="reportOwner"></label>
      <label>状态<select id="reportStatus"><option>not_started</option><option>in_progress</option><option selected>ready</option><option>pending_review</option><option>submitted</option></select></label>
      <label>截止日期<input id="reportDue" type="date"></label>
      <label class="wide">链接<input id="reportLink"></label>
      <label class="wide">备注<textarea id="reportNotes" rows="3"></textarea></label>
    </div>
    <button id="addReport" type="button">保存报告</button>
  `;
  document.getElementById("addReport").addEventListener("click", () => {
    store.reports.push({ id: uid("report"), name: value("reportName"), owner: value("reportOwner"), status: value("reportStatus"), due: value("reportDue"), link: value("reportLink"), notes: value("reportNotes") });
    saveStore();
    renderReports();
  });
  output.innerHTML = renderRows(store.reports, (item) => `${item.name} [${item.status}]\nOwner: ${item.owner || "未填"} · Due: ${item.due || "未填"}\n${item.link || ""}\n${item.notes || ""}`);
}

function renderExpenses() {
  listTitle.textContent = "花销记录";
  formPanel.innerHTML = `
    <h2>新增花销</h2>
    <div class="form-grid">
      <label>日期<input id="expenseDate" type="date" value="${today}"></label>
      <label>类别<select id="expenseCategory"><option>交通</option><option>餐饮</option><option>住宿</option><option>客户招待</option><option>软件订阅</option><option>办公</option><option>其他</option></select></label>
      <label>金额<input id="expenseAmount" type="number" min="0" step="0.01"></label>
      <label>币种<select id="expenseCurrency"><option>EUR</option><option>CNY</option><option>USD</option></select></label>
      <label>客户<input id="expenseCustomer"></label>
      <label>项目<input id="expenseProject"></label>
      <label>可报销<select id="expenseReimbursable"><option value="yes">yes</option><option value="no">no</option></select></label>
      <label class="wide">说明<textarea id="expenseNote" rows="3"></textarea></label>
    </div>
    <button id="addExpense" type="button">保存花销</button>
    <button id="downloadExpenses" class="secondary" type="button">下载 CSV</button>
  `;
  document.getElementById("addExpense").addEventListener("click", () => {
    store.expenses.unshift({ id: uid("exp"), date: value("expenseDate"), category: value("expenseCategory"), amount: Number(value("expenseAmount") || 0), currency: value("expenseCurrency"), customer: value("expenseCustomer"), project: value("expenseProject"), reimbursable: value("expenseReimbursable"), note: value("expenseNote") });
    saveStore();
    renderExpenses();
  });
  document.getElementById("downloadExpenses").addEventListener("click", () => {
    const csv = ["date,category,amount,currency,customer,project,reimbursable,note", ...store.expenses.map((item) => [item.date, item.category, item.amount, item.currency, item.customer, item.project, item.reimbursable, item.note].map(csvCell).join(","))].join("\n");
    download("opc-expenses.csv", csv, "text/csv;charset=utf-8");
  });
  const totals = store.expenses.reduce((map, item) => {
    const key = `${item.currency}-${item.category}`;
    map[key] = (map[key] || 0) + Number(item.amount || 0);
    return map;
  }, {});
  output.innerHTML = `<p><strong>分类汇总：</strong>${Object.entries(totals).map(([key, amount]) => `${key}: ${amount.toFixed(2)}`).join("；") || "暂无"}</p>` + renderRows(store.expenses, (item) => `${item.date} · ${item.category} · ${item.amount} ${item.currency}\n${item.customer || "无客户"} / ${item.project || "无项目"} / reimbursable: ${item.reimbursable}\n${item.note || ""}`);
}

function renderConversations() {
  listTitle.textContent = "客户沟通与录音分析";
  const speechSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  formPanel.innerHTML = `
    <h2>录音/音频/纪要</h2>
    <div class="form-grid">
      <label>日期<input id="convDate" type="date" value="${today}"></label>
      <label>客户<input id="convCustomer" placeholder="RheinWerk"></label>
      <label>联系人<input id="convContact" placeholder="Johannes"></label>
      <label>渠道<select id="convChannel"><option>visit</option><option>call</option><option>wechat</option><option>whatsapp</option><option>email</option></select></label>
      <label class="wide">上传录音<input id="convAudio" type="file" accept="audio/*,video/*"></label>
      <label class="wide">转写/纪要<textarea id="convTranscript" rows="7" placeholder="可以粘贴转写文本；如果浏览器支持语音识别，也可以点开始录音边录边转。"></textarea></label>
    </div>
    <div class="toolbar">
      <button id="startRecording" type="button">开始录音</button>
      <button id="stopRecording" class="secondary" type="button" disabled>停止录音</button>
      <button id="analyzeConversation" type="button">分析并同步 CRM</button>
    </div>
    <p class="muted">${speechSupported ? "当前浏览器支持实时语音识别，会尽量自动填入转写。" : "当前浏览器不支持实时语音识别；可以上传音频并粘贴转写文本。真正的音频自动转写需要后端 Whisper/OpenAI 接口。"}</p>
    <audio id="recordingPreview" controls style="width:100%; display:none;"></audio>
  `;
  document.getElementById("startRecording").addEventListener("click", startRecording);
  document.getElementById("stopRecording").addEventListener("click", stopRecording);
  document.getElementById("analyzeConversation").addEventListener("click", analyzeConversationFromForm);
  output.innerHTML = renderRows(store.conversations, (item) => `${item.date} · ${item.customer}/${item.contact} · ${item.channel}\n${item.audioName ? `Audio: ${item.audioName}\n` : ""}${item.summary || "待分析"}\nNext: ${(item.nextSteps || []).join("；")}\nCRM: ${(item.crmUpdates || []).join("；")}`);
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data.size) recordedChunks.push(event.data);
  };
  recorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    const preview = document.getElementById("recordingPreview");
    preview.src = URL.createObjectURL(blob);
    preview.style.display = "block";
  };
  recorder.start();
  startSpeechRecognition();
  document.getElementById("startRecording").disabled = true;
  document.getElementById("stopRecording").disabled = false;
}

function stopRecording() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
  if (recognition) recognition.stop();
  document.getElementById("startRecording").disabled = false;
  document.getElementById("stopRecording").disabled = true;
}

function startSpeechRecognition() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return;
  recognition = new Speech();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    const text = Array.from(event.results).map((result) => result[0].transcript).join("\n");
    document.getElementById("convTranscript").value = text;
  };
  recognition.start();
}

function analyzeConversationFromForm() {
  const transcript = value("convTranscript");
  const audio = document.getElementById("convAudio").files[0];
  const analysis = analyzeConversationText(transcript);
  const item = {
    id: uid("conv"),
    date: value("convDate"),
    customer: value("convCustomer"),
    contact: value("convContact"),
    channel: value("convChannel"),
    audioName: audio ? audio.name : recordedChunks.length ? "browser-recording.webm" : "",
    transcript,
    ...analysis,
    createdAt: new Date().toISOString()
  };
  store.conversations.unshift(item);
  store.logs.push({ id: uid("log"), customer: item.customer, contact: item.contact, note: item.summary, nextStep: item.nextSteps.join("；"), createdAt: new Date().toISOString() });
  for (const step of item.nextSteps) {
    store.tasks.push({ id: uid("task"), title: step, date: today, customer: item.customer, channel: "internal", priority: "medium", duration: 45, status: "open", notes: `来自客户沟通：${item.contact}` });
  }
  saveStore();
  renderConversations();
}

function analyzeConversationText(text) {
  const lower = text.toLowerCase();
  const nextSteps = [];
  if (/(报价|price|quote|angebot)/i.test(text)) nextSteps.push("准备报价或报价澄清");
  if (/(样品|sample|test|试点|pilot)/i.test(text)) nextSteps.push("安排样品/试点测试");
  if (/(会议|评审|meeting|review|termin)/i.test(text)) nextSteps.push("预约下一次技术/商务评审");
  if (/(合同|nda|dpa|gdpr|保密)/i.test(text)) nextSteps.push("准备 NDA/DPA/合规文件");
  if (!nextSteps.length) nextSteps.push("整理纪要并确认下一步");
  const crmUpdates = [];
  if (/(预算|budget|成本|price|报价)/i.test(text)) crmUpdates.push("预算/价格信号已出现");
  if (/(决策人|ceo|采购|einkauf|buyer)/i.test(text)) crmUpdates.push("需要确认决策人与采购路径");
  if (/(sap|oee|mes|gdpr|ce|售后|备件)/i.test(text)) crmUpdates.push("识别到产品/合规/售后需求关键词");
  return {
    summary: text ? summarize(text) : "已记录音频，等待补充转写文本后分析。",
    nextSteps,
    crmUpdates
  };
}

function renderDrafts() {
  listTitle.textContent = "消息草稿";
  formPanel.innerHTML = `
    <h2>生成消息草稿</h2>
    <div class="form-grid">
      <label>收件人<input id="draftTo" placeholder="Johannes"></label>
      <label>渠道<select id="draftChannel"><option>email</option><option>wechat</option><option>whatsapp</option></select></label>
      <label class="wide">目的<textarea id="draftPurpose" rows="3" placeholder="确认明天下午拜访时间"></textarea></label>
    </div>
    <button id="addDraft" type="button">生成草稿</button>
  `;
  document.getElementById("addDraft").addEventListener("click", () => {
    const to = value("draftTo") || "there";
    const purpose = value("draftPurpose");
    store.drafts.unshift({ id: uid("draft"), to, channel: value("draftChannel"), purpose, status: "draft", body: `Hi ${to},\n\nI wanted to follow up regarding: ${purpose}.\nPlease let me know if this timing works for you.\n\nBest regards`, createdAt: new Date().toISOString() });
    saveStore();
    renderDrafts();
  });
  output.innerHTML = renderRows(store.drafts, (item) => `${item.channel.toUpperCase()} to ${item.to}\n${item.purpose}\n\n${item.body}`);
}

function renderRows(items, formatter) {
  return items.length ? items.map((item) => `<div class="row"><pre>${escapeHtml(formatter(item))}</pre></div>`).join("") : '<p class="muted">暂无数据。</p>';
}

function priorityRank(priority) {
  return { high: 0, medium: 1, low: 2 }[priority] ?? 1;
}

function minutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function clock(total) {
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function summarize(text) {
  return text.replace(/\s+/g, " ").slice(0, 220) + (text.length > 220 ? "..." : "");
}

function value(id) {
  const node = document.getElementById(id);
  return node ? node.value.trim() : "";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toast(message) {
  output.insertAdjacentHTML("afterbegin", `<p><strong>${escapeHtml(message)}</strong></p>`);
}

saveStore();
render();
