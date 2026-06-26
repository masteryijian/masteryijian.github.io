const seedSignals = [
  {
    id: "sig_demo_1",
    title: "德国中小制造企业继续推进 OEE 和能源数据透明化",
    sector: "工业配件",
    url: "https://example.eu/oee-energy",
    publisher: "Industry desk",
    excerpt: "客户反复提到停机损失、能源成本、SAP/OT 集成和质量追溯，适合匹配设备联网、传感器和轻量 MES 方案。",
    createdAt: new Date().toISOString()
  },
  {
    id: "sig_demo_2",
    title: "旧楼翻新推动暖通和现场服务交付压力",
    sector: "热泵暖通",
    url: "https://example.eu/heatpump",
    publisher: "Market notes",
    excerpt: "建筑改造、热泵安装、维护和备件响应成为客户关注点。机会在于可验证的供应链、安装培训和售后网络。",
    createdAt: new Date().toISOString()
  }
];

let signals = JSON.parse(localStorage.getItem("opc-newsletter-signals") || "null") || seedSignals;

document.getElementById("addSignal").addEventListener("click", () => {
  signals.unshift({
    id: `sig_${Math.random().toString(16).slice(2, 10)}`,
    title: value("signalTitle"),
    sector: value("signalSector"),
    url: value("signalUrl"),
    publisher: value("signalPublisher"),
    excerpt: value("signalExcerpt"),
    createdAt: new Date().toISOString()
  });
  save();
  clearForm();
  render();
});

document.getElementById("downloadNewsletter").addEventListener("click", () => download("germany-market-signals.json", JSON.stringify({ signals, opportunities: signals.map(analyze) }, null, 2)));
document.getElementById("resetNewsletter").addEventListener("click", () => {
  signals = structuredClone(seedSignals);
  save();
  render();
});

function analyze(signal) {
  const text = `${signal.title} ${signal.excerpt}`.toLowerCase();
  let score = 42;
  ["缺口", "压力", "增长", "成本", "交付", "合规", "能源", "停机", "备件", "售后"].forEach((word) => {
    if (text.includes(word.toLowerCase())) score += 5;
  });
  if (signal.url) score += 5;
  score = Math.min(score, 96);
  const risk = text.includes("医疗") || text.includes("数据") || text.includes("电池") ? "需要合规预审" : "中等合规风险";
  return {
    ...signal,
    score,
    risk,
    product: guessProduct(signal),
    action: "先做 1 页机会卡：目标客户、采购触发点、德国合规要求、样品/试点报价。"
  };
}

function guessProduct(signal) {
  const text = `${signal.title} ${signal.excerpt}`;
  if (text.includes("热泵") || text.includes("暖通")) return "暖通备件、安装工具、售后服务包";
  if (text.includes("能源") || text.includes("OEE") || text.includes("MES")) return "工业传感器、设备联网、OEE/MES 轻量方案";
  if (text.includes("养老")) return "养老辅助设备和护理场景用品";
  if (text.includes("光伏") || text.includes("储能")) return "储能光伏部件和运维工具";
  return "中国成熟供应链机会包";
}

function render() {
  const opportunities = signals.map(analyze).sort((a, b) => b.score - a.score);
  document.getElementById("opportunityGrid").innerHTML = opportunities
    .map((item) => `
      <article class="card">
        <span class="tag">${item.sector} · ${item.score}/100</span>
        <h3>${escapeHtml(item.product)}</h3>
        <p><strong>${escapeHtml(item.title)}</strong></p>
        <p>${escapeHtml(item.excerpt)}</p>
        <p><strong>风险：</strong>${escapeHtml(item.risk)}</p>
        <p><strong>动作：</strong>${escapeHtml(item.action)}</p>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">来源</a>` : ""}
      </article>
    `)
    .join("");

  document.getElementById("weeklyOutput").textContent = [
    "Subject: Germany Market Signals - 本周机会清单",
    "",
    ...opportunities.slice(0, 5).map((item, index) => `${index + 1}. ${item.product} (${item.score}/100)\n来源：${item.publisher || "待补"}\n信号：${item.title}\n建议：${item.action}\n`)
  ].join("\n");
}

function save() {
  localStorage.setItem("opc-newsletter-signals", JSON.stringify(signals));
}

function clearForm() {
  ["signalTitle", "signalUrl", "signalPublisher", "signalExcerpt"].forEach((id) => (document.getElementById(id).value = ""));
}

function value(id) {
  return document.getElementById(id).value.trim();
}

function escapeHtml(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

render();
