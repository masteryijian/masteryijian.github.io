const state = {
  activeView: "match",
  query: "德国 工业自动化 汽车零部件 降本增效",
  filters: {
    industry: "全部",
    needType: "全部",
    urgency: "全部",
    confidence: "全部",
  },
  selectedCompanyId: "c1",
  pendingUpdates: [],
  lastMatchedAt: "",
};

const sharedCrmKey = "opc-shared-crm";

const sourceEvidence = [
  {
    id: "s1",
    type: "公开官网",
    source: "https://example.eu/rheinwerk/products",
    collectedAt: "2026-05-15",
    method: "公开网页采集",
    authorization: "公开可访问 / GDPR 合规记录",
    confidence: 0.86,
    summary: "产品页强调德国汽车零部件工厂的 OEE、设备联网、质量追溯和能源效率。",
  },
  {
    id: "s2",
    type: "招聘页",
    source: "https://example.eu/rheinwerk/careers",
    collectedAt: "2026-05-18",
    method: "公开网页采集",
    authorization: "公开可访问 / GDPR 合规记录",
    confidence: 0.78,
    summary: "正在慕尼黑和斯图加特招聘 OT 数据工程师、MES 顾问和 CSRD 能源数据顾问。",
  },
  {
    id: "s3",
    type: "用户拜访纪要",
    source: "2026-05-12 慕尼黑 CEO 拜访录音",
    collectedAt: "2026-05-12",
    method: "用户上传",
    authorization: "用户提供",
    confidence: 0.92,
    summary: "采购与运营负责人关注德国工厂能源成本、停机损失、SAP 集成和欧盟数据合规。",
  },
  {
    id: "s4",
    type: "公开企业信息",
    source: "EU 客户资料表 / 商会公开名录人工导入",
    collectedAt: "2026-05-10",
    method: "人工导入",
    authorization: "合法来源 / 已记录来源",
    confidence: 0.81,
    summary: "目标客户集中在 DACH 汽车零部件、工业设备、能源与中型制造企业。",
  },
];

const companies = [
  {
    id: "c1",
    name: "RheinWerk Automation GmbH",
    shortNames: ["RheinWerk", "莱茵工厂", "RWA"],
    industry: "德国智能制造",
    website: "https://example.eu/rheinwerk",
    scale: "250-400 人",
    targetCustomers: ["德国汽车零部件", "DACH 工业设备", "离散制造", "Tier-2 供应商"],
    strengths: ["熟悉德国中型制造企业", "MES、OEE 与设备数据采集一体化", "懂 SAP/OT 集成"],
    weaknesses: ["法国和西班牙覆盖较弱", "销售周期受德国 Betriebsrat 和 IT 安全评审影响"],
    orgStructure: ["Geschäftsführer", "VP Sales DACH", "Manufacturing Solutions", "OT Integration", "Customer Success"],
    publicUpdates: ["发布 OEE 能源效率模块", "招聘 OT 数据工程师", "新增 Stuttgart 汽车零部件案例"],
    evidenceIds: ["s1", "s2", "s4"],
    monitorFrequency: "每周",
  },
  {
    id: "c2",
    name: "NordData Compliance AG",
    shortNames: ["NordData", "北德数据", "NDC"],
    industry: "欧盟数据与合规",
    website: "https://example.eu/norddata",
    scale: "120-180 人",
    targetCustomers: ["德国制造集团", "瑞士医疗器械", "欧盟能源企业", "跨境 SaaS"],
    strengths: ["GDPR 和 EU Data Act 方案成熟", "数据治理模板适合多国集团", "BI 与合规报表上线快"],
    weaknesses: ["行业应用深度依赖客户内部数据团队", "法律和 IT 审批周期较长"],
    orgStructure: ["CEO", "Head of Solution Consulting", "Data Governance", "Privacy Office", "Partner Channel"],
    publicUpdates: ["发布 EU Data Act 准备度白皮书", "新增 CSRD 数据治理服务"],
    evidenceIds: ["s4"],
    monitorFrequency: "每两周",
  },
  {
    id: "c3",
    name: "Alpine MedTech Solutions GmbH",
    shortNames: ["Alpine MedTech", "AMS", "阿尔卑斯医疗"],
    industry: "欧盟医疗科技",
    website: "https://example.eu/alpine-medtech",
    scale: "90-140 人",
    targetCustomers: ["德国医院集团", "奥地利诊所", "瑞士医疗器械渠道", "EU MedTech"],
    strengths: ["熟悉 MDR 和医疗采购流程", "客户成功和售后数据沉淀强", "适合 DACH 医疗服务网络"],
    weaknesses: ["重工业客户经验不足", "医疗数据接入需要严格 DPA 和安全审查"],
    orgStructure: ["CEO", "Product Lead", "Clinical Success", "Implementation Consultant"],
    publicUpdates: ["上线医院客户健康度模型", "招聘 DACH 客户成功经理"],
    evidenceIds: ["s1"],
    monitorFrequency: "每月",
  },
];

const products = [
  {
    id: "p1",
    companyId: "c1",
    name: "DACH Smart Factory OEE Platform",
    aliases: ["MES", "OEE", "工业4.0", "Industrie 4.0", "设备数据采集", "质量追溯", "能源效率"],
    category: "德国智能制造",
    scenarios: ["德国工厂透明化", "设备稼动率提升", "质量追溯", "能源效率监控", "SAP/OT 集成"],
    solves: ["数据孤岛", "停机损失", "人工报工不准", "能源成本高", "质量问题追责慢"],
    differentiators: ["熟悉德国中小制造企业流程", "支持 SAP 与 OT 数据集成", "能把 OEE 和能源成本放在同一看板"],
  },
  {
    id: "p2",
    companyId: "c2",
    name: "EU Compliance Data Hub",
    aliases: ["数据中台", "BI", "GDPR", "EU Data Act", "CSRD", "数据治理", "合规报表"],
    category: "欧盟数据与合规",
    scenarios: ["GDPR 数据台账", "CSRD 报表数据准备", "集团报表统一", "多国数据治理"],
    solves: ["数据来源不清", "合规审计准备慢", "多国报表口径不一", "系统割裂"],
    differentiators: ["GDPR 与 EU Data Act 证据链清晰", "适合 DACH 多国集团", "合规报表和经营 BI 可一起落地"],
  },
  {
    id: "p3",
    companyId: "c3",
    name: "DACH MedTech Customer Health Engine",
    aliases: ["客户成功", "客户体验", "医疗客户", "MedTech", "MDR", "客户健康度"],
    category: "欧盟医疗科技",
    scenarios: ["医院集团客户维护", "医疗器械渠道流失预警", "售后服务 SLA", "客户旅程分析"],
    solves: ["医疗客户流失发现晚", "服务数据分散", "续约风险不可见", "DPA 审批慢"],
    differentiators: ["理解 DACH 医疗采购与 MDR 场景", "适合 CEO 直接看关键医院客户风险"],
  },
];

const people = [
  {
    id: "u1",
    companyId: "c1",
    name: "Johannes Keller",
    title: "VP Sales DACH",
    titleAliases: ["销售负责人", "商务负责人", "Head of Sales", "VP Sales"],
    employmentStatus: "在职，2026-05-12 慕尼黑拜访录音确认",
    contacts: ["j.keller@example.eu", "+49 89 **** 0621"],
    socialAccounts: ["LinkedIn: /in/johannes-keller-dach"],
    relationshipSource: "慕尼黑工业展介绍",
    warmth: 84,
    personalNeeds: ["希望拓展德国汽车零部件标杆客户", "关注 DACH CEO 圈层资源互换"],
    lastInteraction: "2026-05-12 慕尼黑拜访",
    confidence: 0.91,
    evidenceIds: ["s3"],
  },
  {
    id: "u2",
    companyId: "c1",
    name: "Anna Schneider",
    title: "Director Manufacturing Solutions",
    titleAliases: ["售前总监", "解决方案负责人", "Solution Director", "Manufacturing Lead"],
    employmentStatus: "在职，官网团队页公开",
    contacts: ["anna.schneider@example.eu"],
    socialAccounts: ["LinkedIn: /in/anna-schneider-manufacturing"],
    relationshipSource: "Hannover Messe 交换名片",
    warmth: 68,
    personalNeeds: ["需要更精准的 DACH 汽车零部件案例素材"],
    lastInteraction: "2026-04-26 Teams 电话沟通",
    confidence: 0.84,
    evidenceIds: ["s1"],
  },
  {
    id: "u3",
    companyId: "c2",
    name: "Lukas Weber",
    title: "Head of Solution Consulting",
    titleAliases: ["售前负责人", "数据治理专家", "Solution Consulting", "Data Governance"],
    employmentStatus: "在职，人工资料导入",
    contacts: ["lukas.weber@example.eu"],
    socialAccounts: ["LinkedIn: /in/lukas-weber-data"],
    relationshipSource: "柏林 SaaS 社群引荐",
    warmth: 73,
    personalNeeds: ["寻找德国制造集团的 GDPR/CSRD 数据治理试点"],
    lastInteraction: "2026-05-03 柏林晚餐交流",
    confidence: 0.8,
    evidenceIds: ["s4"],
  },
  {
    id: "u4",
    companyId: "c3",
    name: "Sophie Martin",
    title: "CEO",
    titleAliases: ["创始人", "总经理", "Managing Director", "Founder"],
    employmentStatus: "在职，官网公开",
    contacts: ["sophie.martin@example.eu"],
    socialAccounts: ["LinkedIn: /in/sophie-martin-medtech"],
    relationshipSource: "苏黎世投资人介绍",
    warmth: 76,
    personalNeeds: ["希望进入 DACH 医院集团和医疗器械渠道"],
    lastInteraction: "2026-05-01 Signal 沟通",
    confidence: 0.87,
    evidenceIds: ["s1"],
  },
];

const needs = [
  {
    id: "n1",
    type: "企业需求",
    companyId: "c1",
    personId: "u1",
    content: "寻找能进入德国汽车零部件和 Tier-2 供应商客户的生态伙伴，强调 DACH 可落地案例。",
    urgency: "高",
    budgetSignal: "已有联合售前预算",
    updatedAt: "2026-05-12",
    sourceId: "s3",
    keywords: ["德国", "DACH", "汽车零部件", "Tier-2", "生态伙伴", "智能制造"],
  },
  {
    id: "n2",
    type: "个人需求",
    companyId: "c1",
    personId: "u1",
    content: "Johannes 本人希望扩大 DACH CEO 圈层资源，提高 VP Sales 在德国区的内部影响力。",
    urgency: "中",
    budgetSignal: "个人关系投入",
    updatedAt: "2026-05-12",
    sourceId: "s3",
    keywords: ["CEO", "DACH", "德国", "圈层", "资源互换", "个人影响力"],
  },
  {
    id: "n3",
    type: "企业需求",
    companyId: "c2",
    personId: "u3",
    content: "需要德国制造集团 GDPR、CSRD 和 EU Data Act 数据治理试点，最好能快速证明合规和经营驾驶舱价值。",
    urgency: "中",
    budgetSignal: "试点项目预算待确认",
    updatedAt: "2026-05-03",
    sourceId: "s4",
    keywords: ["德国", "欧盟", "GDPR", "CSRD", "EU Data Act", "制造集团", "数据治理", "经营驾驶舱", "BI"],
  },
  {
    id: "n4",
    type: "企业需求",
    companyId: "c3",
    personId: "u4",
    content: "寻找 DACH 医疗服务和医疗器械渠道的关键客户健康度、续约和流失预警场景。",
    urgency: "中",
    budgetSignal: "合作分成优先",
    updatedAt: "2026-05-01",
    sourceId: "s1",
    keywords: ["德国", "欧盟", "DACH", "医疗服务", "医疗器械", "客户健康度", "流失预警", "客户体验"],
  },
];

const monitoringItems = [
  {
    id: "m1",
    companyId: "c1",
    source: "官网产品页",
    detectedAt: "2026-05-20",
    change: "新增“OEE 能源效率模块”和 Stuttgart 汽车零部件案例入口。",
    impact: "可增强与德国汽车零部件、能源成本优化客户的匹配理由。",
    status: "待确认",
  },
  {
    id: "m2",
    companyId: "c2",
    source: "招聘页",
    detectedAt: "2026-05-18",
    change: "新增 GDPR/CSRD 数据治理交付经理岗位。",
    impact: "暗示欧盟合规交付能力扩张，适合推荐给 DACH 制造集团和能源企业。",
    status: "待确认",
  },
];

const interactions = [
  {
    id: "i1",
    type: "拜访录音",
    companyId: "c1",
    personId: "u1",
    date: "2026-05-12",
    summary: "讨论德国汽车零部件客户联合拓展，客户关心 SAP 集成、能源成本、停机损失、数据合规和 CEO 层背书。",
    nextAction: "准备 2 个 DACH 汽车零部件案例，约 Johannes 和 Anna 做联合方案评审。",
  },
];

const synonyms = {
  德国: ["DACH", "Germany", "German", "Deutschland", "慕尼黑", "柏林", "斯图加特"],
  欧盟: ["EU", "Europe", "European", "GDPR", "CSRD", "EU Data Act"],
  降本增效: ["成本", "效率", "经营", "停机损失", "稼动率", "OEE", "能源成本"],
  工厂: ["制造", "产线", "车间", "MES", "设备", "OT", "Industrie 4.0"],
  老板: ["CEO", "创始人", "总经理", "Geschäftsführer", "Managing Director"],
  客户维护: ["客户成功", "客户体验", "健康度", "流失", "续约", "SLA"],
  报表: ["BI", "指标", "经营驾驶舱", "数据中台", "CSRD", "合规报表"],
  汽车零部件: ["Tier-1", "Tier-2", "automotive", "Stuttgart", "供应商"],
};

const app = document.querySelector("#app");

function normalize(text) {
  return String(text || "").toLowerCase();
}

function tokenize(input) {
  const raw = normalize(input)
    .split(/[,\s，。；;、/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const expanded = raw.flatMap((token) => [token, ...(synonyms[token] || [])]);
  return [...new Set(expanded)];
}

function includesAny(text, tokens) {
  const haystack = normalize(Array.isArray(text) ? text.join(" ") : text);
  return tokens.some((token) => haystack.includes(normalize(token)) || normalize(token).includes(haystack));
}

function getCompany(id) {
  return companies.find((company) => company.id === id);
}

function getPerson(id) {
  return people.find((person) => person.id === id);
}

function getEvidence(ids) {
  return ids.map((id) => sourceEvidence.find((item) => item.id === id)).filter(Boolean);
}

function scoreMatch(company, product, person, relatedNeeds, tokens) {
  let score = 0;
  const reasons = [];
  const risk = [];

  const checks = [
    [company.industry, 22, `行业匹配：${company.industry}`],
    [company.shortNames, 8, "公司简称可命中"],
    [company.targetCustomers, 12, "目标客户画像相关"],
    [company.strengths, 16, "公司优势贴合需求"],
    [company.publicUpdates, 8, "近期公开动态相关"],
    [product.aliases, 18, `产品别名/类别匹配：${product.category}`],
    [product.scenarios, 18, "产品适用场景匹配"],
    [product.solves, 18, "解决的问题与输入需求接近"],
    [person.titleAliases, 7, `联系人角色可能相关：${person.title}`],
    [person.personalNeeds, 7, "联系人个人诉求可切入"],
    [relatedNeeds.map((need) => need.content), 18, "已记录需求直接相关"],
    [relatedNeeds.flatMap((need) => need.keywords), 12, "需求关键词命中"],
  ];

  checks.forEach(([value, points, reason]) => {
    if (includesAny(value, tokens)) {
      score += points;
      reasons.push(reason);
    }
  });

  if (person.warmth > 80) {
    score += 8;
    reasons.push("关系温度高，适合 CEO 直接推进");
  }

  if (company.weaknesses.length) {
    risk.push(...company.weaknesses.slice(0, 2));
  }

  if (relatedNeeds.some((need) => need.urgency === "高")) {
    score += 8;
    reasons.push("存在高优先级企业需求");
  }

  return {
    score: Math.min(98, score),
    reasons: [...new Set(reasons)].slice(0, 5),
    risk,
  };
}

function buildMatches() {
  const tokens = tokenize(state.query || "");
  const matches = [];

  products.forEach((product) => {
    const company = getCompany(product.companyId);
    const companyPeople = people.filter((person) => person.companyId === company.id);
    const companyNeeds = needs.filter((need) => need.companyId === company.id);

    companyPeople.forEach((person) => {
      const personNeeds = companyNeeds.filter((need) => need.personId === person.id);
      const { score, reasons, risk } = scoreMatch(company, product, person, personNeeds, tokens);
      if (score > 0 || !tokens.length) {
        matches.push({ company, product, person, needs: personNeeds, score, reasons, risk });
      }
    });
  });

  return matches
    .filter((match) => {
      if (state.filters.industry !== "全部" && match.company.industry !== state.filters.industry) return false;
      if (state.filters.needType !== "全部" && !match.needs.some((need) => need.type === state.filters.needType)) return false;
      if (state.filters.urgency !== "全部" && !match.needs.some((need) => need.urgency === state.filters.urgency)) return false;
      if (state.filters.confidence === "高可信" && match.person.confidence < 0.85) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || b.person.warmth - a.person.warmth);
}

function setView(view) {
  state.activeView = view;
  render();
}

function collectMatchControls() {
  const queryInput = document.querySelector("#query");
  if (queryInput) state.query = queryInput.value;

  document.querySelectorAll("[data-filter]").forEach((element) => {
    state.filters[element.dataset.filter] = element.value;
  });

  state.lastMatchedAt = new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function showToast(message) {
  document.querySelectorAll(".toast").forEach((node) => node.remove());
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function readSharedCrm() {
  try {
    return JSON.parse(localStorage.getItem(sharedCrmKey) || "{}");
  } catch {
    return {};
  }
}

function writeSharedCrm(extra = {}) {
  localStorage.setItem(
    sharedCrmKey,
    JSON.stringify({
      ...readSharedCrm(),
      ...extra,
      crmExportedAt: new Date().toISOString(),
      crmCompanies: companies,
      crmPeople: people,
      crmNeeds: needs,
      crmSources: sourceEvidence,
    }),
  );
}

function importAssistantData() {
  const shared = readSharedCrm();
  const importedContacts = shared.contacts || [];
  const importedConversations = shared.conversations || [];
  let imported = 0;

  for (const contact of importedContacts) {
    const companyName = contact.company || "未归类客户";
    let company = companies.find((item) => item.name === companyName);
    if (!company) {
      company = {
        id: `assistant_company_${companies.length + 1}`,
        name: companyName,
        shortNames: [companyName],
        industry: "助理同步客户",
        website: "",
        scale: "待确认",
        targetCustomers: ["待确认"],
        strengths: ["来自私人业务助理同步"],
        weaknesses: ["资料仍需补齐"],
        orgStructure: ["待确认"],
        publicUpdates: [],
        evidenceIds: [],
        monitorFrequency: "手动",
      };
      companies.push(company);
      imported += 1;
    }
    if (!people.some((person) => person.name === contact.name && person.companyId === company.id)) {
      people.push({
        id: `assistant_person_${people.length + 1}`,
        companyId: company.id,
        name: contact.name || "未命名联系人",
        title: contact.role || "待确认",
        titleAliases: [contact.role || "联系人"],
        employmentStatus: "来自助理同步，待人工确认",
        contacts: [contact.email, contact.phone, contact.whatsapp].filter(Boolean),
        socialAccounts: [],
        relationshipSource: "私人业务助理",
        warmth: 60,
        personalNeeds: contact.notes ? [contact.notes] : [],
        lastInteraction: "助理同步",
        confidence: 0.66,
        evidenceIds: [],
      });
      imported += 1;
    }
  }

  for (const conversation of importedConversations) {
    const company = companies.find((item) => item.name === conversation.customer || item.shortNames.includes(conversation.customer));
    const person = people.find((item) => item.name === conversation.contact || item.companyId === company?.id);
    const sourceId = `assistant_source_${sourceEvidence.length + 1}`;
    sourceEvidence.push({
      id: sourceId,
      type: conversation.audioName ? "客户录音/纪要" : "客户沟通纪要",
      source: `${conversation.date || ""} ${conversation.customer || ""} ${conversation.channel || ""}`,
      collectedAt: conversation.date || new Date().toISOString().slice(0, 10),
      method: "私人业务助理同步",
      authorization: "用户提供",
      confidence: conversation.transcript ? 0.82 : 0.62,
      summary: conversation.summary || conversation.transcript || "待补充纪要",
    });
    if (company && person && !needs.some((need) => need.sourceId === sourceId)) {
      needs.push({
        id: `assistant_need_${needs.length + 1}`,
        type: "企业需求",
        companyId: company.id,
        personId: person.id,
        content: [conversation.summary, ...(conversation.crmUpdates || [])].filter(Boolean).join("；") || "来自助理同步的客户需求",
        urgency: "中",
        budgetSignal: (conversation.crmUpdates || []).some((item) => item.includes("预算") || item.includes("价格")) ? "出现预算/价格信号" : "待确认",
        updatedAt: conversation.date || new Date().toISOString().slice(0, 10),
        sourceId,
        keywords: tokenize(`${conversation.summary || ""} ${(conversation.crmUpdates || []).join(" ")}`),
      });
      imported += 1;
    }
  }

  writeSharedCrm({ lastImportAt: new Date().toISOString() });
  showToast(`已从助理同步 ${imported} 条 CRM 信息。`);
  render();
}

function addRecordingSuggestion() {
  const update = {
    id: `u-${Date.now()}`,
    title: "录音分析建议：RheinWerk Automation / Johannes Keller",
    createdAt: new Date().toISOString().slice(0, 10),
    source: "用户上传录音",
    confidence: 0.88,
    changes: [
      "企业需求：客户正在寻找德国汽车零部件和 Tier-2 供应商联合拓展案例，优先级建议设为高。",
      "个人需求：Johannes 希望获得 DACH CEO 圈层资源背书，应单独记录为个人诉求。",
      "下一步行动：准备 DACH 案例材料并邀请 Anna 参加联合方案评审。",
    ],
  };
  state.pendingUpdates.unshift(update);
  showToast("已生成结构化纪要和待确认更新建议，主库尚未被自动修改。");
  render();
}

function acceptUpdate(id) {
  const seedUpdate = {
    id: "seed",
    title: "示例建议：拜访纪要抽取",
    createdAt: "2026-05-12",
    source: "2026-05-12 慕尼黑 CEO 拜访录音",
    confidence: 0.92,
    changes: [
      "联系人状态：Johannes 仍在职，当前负责 DACH 汽车零部件业务。",
      "企业需求：需要能支撑德国汽车零部件联合获客的制造业案例。",
      "下一步行动：准备 DACH 联合方案评审。",
    ],
  };
  const update = state.pendingUpdates.find((item) => item.id === id) || (id === "seed" ? seedUpdate : null);
  if (!update) return;
  const companyId = "c1";
  const personId = "u1";
  const sourceId = `accepted_source_${sourceEvidence.length + 1}`;
  sourceEvidence.push({
    id: sourceId,
    type: "已确认客户沟通",
    source: update.source,
    collectedAt: update.createdAt,
    method: "CRM 用户确认写入",
    authorization: "用户确认",
    confidence: update.confidence,
    summary: update.changes.join("；"),
  });
  interactions.unshift({
    id: `accepted_interaction_${interactions.length + 1}`,
    type: "已确认纪要",
    companyId,
    personId,
    date: update.createdAt,
    summary: update.changes.join("；"),
    nextAction: update.changes.find((change) => change.includes("下一步")) || "整理跟进动作。",
  });
  if (!needs.some((need) => need.sourceId === sourceId)) {
    needs.push({
      id: `accepted_need_${needs.length + 1}`,
      type: "企业需求",
      companyId,
      personId,
      content: update.changes.find((change) => change.includes("企业需求")) || update.changes.join("；"),
      urgency: "高",
      budgetSignal: "待确认",
      updatedAt: update.createdAt,
      sourceId,
      keywords: tokenize(update.changes.join(" ")),
    });
  }
  state.pendingUpdates = state.pendingUpdates.filter((item) => item.id !== id);
  writeSharedCrm({
    acceptedUpdates: [...(readSharedCrm().acceptedUpdates || []), update],
    interactions,
  });
  state.selectedCompanyId = companyId;
  showToast("已写入来源证据、企业需求和互动记录，并同步回共享池。");
  render();
}

function dismissUpdate(id) {
  state.pendingUpdates = state.pendingUpdates.filter((item) => item.id !== id);
  showToast("已忽略该更新建议。");
  render();
}

function markMonitoringReviewed(id) {
  const item = monitoringItems.find((entry) => entry.id === id);
  if (item) item.status = "已确认";
  showToast("已标记为已确认，情报变化不会重复提醒。");
  render();
}

function renderShell(content) {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <strong>CEO Intel CRM</strong>
          <span>联系人情报、公司需求图谱与客户匹配工作台</span>
        </div>
        <nav class="nav">
          ${[
            ["match", "智能匹配"],
            ["graph", "需求图谱"],
            ["recording", "录音分析"],
            ["monitor", "情报监控"],
            ["sync", "助理同步"],
            ["sources", "合规来源"],
          ]
            .map(
              ([id, label]) =>
                `<button class="${state.activeView === id ? "active" : ""}" data-view="${id}">${label}</button>`,
            )
            .join("")}
        </nav>
        <div class="compliance">
          合规优先：公开来源、用户授权、人工导入均保留证据链；按 GDPR 思路记录来源、授权和更新时间。
        </div>
      </aside>
      <main class="main">${content}</main>
    </div>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
}

function renderMatch() {
  const matches = buildMatches();
  const activeFilters = [
    state.filters.industry !== "全部" ? `行业：${state.filters.industry}` : "",
    state.filters.needType !== "全部" ? `需求：${state.filters.needType}` : "",
    state.filters.urgency !== "全部" ? `紧急度：${state.filters.urgency}` : "",
    state.filters.confidence !== "全部" ? `可信度：${state.filters.confidence}` : "",
  ].filter(Boolean);
  const content = `
    <section class="topbar">
      <div>
        <h1>智能客户匹配</h1>
        <p>输入行业、客户问题或产品类别，系统反向匹配产品、公司、联系人与下一步建议。</p>
      </div>
      <div class="actions">
        <button class="btn secondary" id="sampleQuery">填入客户问题</button>
        <button class="btn" id="runSearch">重新匹配</button>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body">
        <div class="search-box">
          <textarea id="query" rows="3" placeholder="例如：德国、DACH、汽车零部件、OEE、GDPR、CSRD">${state.query}</textarea>
          <div class="filters">
            ${renderSelect("industry", ["全部", ...new Set(companies.map((company) => company.industry))], "行业")}
            ${renderSelect("needType", ["全部", "企业需求", "个人需求"], "需求类型")}
            ${renderSelect("urgency", ["全部", "高", "中", "低"], "紧急度")}
            ${renderSelect("confidence", ["全部", "高可信"], "可信度")}
          </div>
          <div class="meta">
            <span class="tag blue">当前关键词：${state.query || "未输入"}</span>
            <span class="tag">${activeFilters.length ? activeFilters.join(" / ") : "未设置额外筛选"}</span>
            <span class="tag amber">${state.lastMatchedAt ? `最近匹配：${state.lastMatchedAt}` : "等待首次手动匹配"}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>推荐结果</h2>
            <p>每条结果都包含匹配理由、证据来源和风险点。</p>
          </div>
          <span class="score">${matches.length} 条</span>
        </div>
        <div class="panel-body match-list">
          ${
            matches.length
              ? matches.map(renderMatchCard).join("")
              : `<div class="empty">没有匹配结果，换一个关键词试试。</div>`
          }
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div>
            <h2>CEO 下一步动作</h2>
            <p>基于当前最高分匹配生成。</p>
          </div>
        </div>
        <div class="panel-body">
          ${renderNextSteps(matches[0])}
        </div>
      </div>
    </section>
  `;

  renderShell(content);

  document.querySelector("#query").addEventListener("input", (event) => {
    state.query = event.target.value;
  });
  document.querySelector("#runSearch").addEventListener("click", () => {
    collectMatchControls();
    showToast(`已按当前条件重新匹配，找到 ${buildMatches().length} 条结果。`);
    render();
  });
  document.querySelector("#sampleQuery").addEventListener("click", () => {
    state.query = "德国汽车零部件工厂，想做 OEE、质量追溯、SAP/OT 集成和能源成本优化";
    state.lastMatchedAt = "";
    render();
  });
  document.querySelectorAll("[data-filter]").forEach((element) => {
    element.addEventListener("change", () => {
      state.filters[element.dataset.filter] = element.value;
      render();
    });
  });
}

function renderSelect(id, options, label) {
  return `
    <div class="field">
      <label>${label}</label>
      <select data-filter="${id}">
        ${options.map((option) => `<option ${state.filters[id] === option ? "selected" : ""}>${option}</option>`).join("")}
      </select>
    </div>
  `;
}

function renderMatchCard(match) {
  const evidence = getEvidence([...match.company.evidenceIds, ...match.person.evidenceIds]).slice(0, 2);
  return `
    <article class="card">
      <div class="card-head">
        <div>
          <h3>${match.company.name} · ${match.product.name}</h3>
          <p>${match.person.name} / ${match.person.title} / ${match.person.employmentStatus}</p>
        </div>
        <span class="score">${match.score}%</span>
      </div>
      <div class="meta">
        <span class="tag blue">${match.company.industry}</span>
        <span class="tag">关系温度 ${match.person.warmth}</span>
        <span class="tag">可信度 ${Math.round(match.person.confidence * 100)}%</span>
        ${match.needs.map((need) => `<span class="tag amber">${need.type} · ${need.urgency}</span>`).join("")}
      </div>
      <p><strong>匹配理由：</strong>${match.reasons.length ? match.reasons.join("；") : "输入较宽泛，按关系温度和行业资料排序"}。</p>
      <p><strong>风险点：</strong>${match.risk.join("；")}。</p>
      <div class="split">
        <div class="need-box">
          <strong>个人需求</strong>
          ${match.needs.filter((need) => need.type === "个人需求").map((need) => `<p>${need.content}</p>`).join("") || "<p>暂无明确个人诉求。</p>"}
        </div>
        <div class="need-box">
          <strong>企业需求</strong>
          ${match.needs.filter((need) => need.type === "企业需求").map((need) => `<p>${need.content}</p>`).join("") || "<p>暂无明确企业需求。</p>"}
        </div>
      </div>
      <div class="evidence">
        证据：${evidence.map((item) => `${item.type}（${item.collectedAt}，可信度 ${Math.round(item.confidence * 100)}%）`).join("；")}
      </div>
    </article>
  `;
}

function renderNextSteps(match) {
  if (!match) return `<div class="empty">暂无推荐动作。</div>`;
  return `
    <div class="stack">
      <div class="card">
        <h4>优先联系</h4>
        <p>${match.person.name}，${match.person.title}。建议以“${match.product.scenarios[0]}”作为切入点。</p>
      </div>
      <div class="card">
        <h4>准备材料</h4>
        <p>${match.product.differentiators.join("；")}。补充 1-2 个${match.company.targetCustomers[0]}案例。</p>
      </div>
      <div class="card">
        <h4>拜访问题</h4>
        <p>确认预算线索、项目时间线、最终决策人、使用部门和现有系统边界。</p>
      </div>
    </div>
  `;
}

function renderGraph() {
  const selected = getCompany(state.selectedCompanyId);
  const content = `
    <section class="topbar">
      <div>
        <h1>需求图谱</h1>
        <p>同一个联系人可以同时有个人诉求和企业采购/合作需求，系统分开记录。</p>
      </div>
      <div class="actions">
        <select id="companyPicker" class="btn secondary">
          ${companies.map((company) => `<option value="${company.id}" ${selected.id === company.id ? "selected" : ""}>${company.name}</option>`).join("")}
        </select>
      </div>
    </section>
    <section class="grid three">
      <div class="panel kpi"><strong>${people.filter((person) => person.companyId === selected.id).length}</strong><span>关键联系人</span></div>
      <div class="panel kpi"><strong>${needs.filter((need) => need.companyId === selected.id && need.type === "企业需求").length}</strong><span>企业需求</span></div>
      <div class="panel kpi"><strong>${needs.filter((need) => need.companyId === selected.id && need.type === "个人需求").length}</strong><span>个人需求</span></div>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-header"><div><h2>${selected.name}</h2><p>${selected.industry} / ${selected.scale} / ${selected.website}</p></div></div>
        <div class="panel-body stack">
          <div class="card"><h4>优势</h4><p>${selected.strengths.join("；")}</p></div>
          <div class="card"><h4>劣势</h4><p>${selected.weaknesses.join("；")}</p></div>
          <div class="card"><h4>组织结构</h4><p>${selected.orgStructure.join(" → ")}</p></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h2>需求分层</h2><p>避免把联系人个人诉求误写成企业需求。</p></div></div>
        <div class="panel-body stack">
          ${needs
            .filter((need) => need.companyId === selected.id)
            .map((need) => {
              const person = getPerson(need.personId);
              return `<div class="card">
                <div class="card-head"><h4>${need.type}</h4><span class="tag amber">${need.urgency}</span></div>
                <p>${need.content}</p>
                <div class="meta"><span class="tag">${person.name}</span><span class="tag">${need.budgetSignal}</span><span class="tag">${need.updatedAt}</span></div>
              </div>`;
            })
            .join("")}
        </div>
      </div>
    </section>
  `;
  renderShell(content);
  document.querySelector("#companyPicker").addEventListener("change", (event) => {
    state.selectedCompanyId = event.target.value;
    render();
  });
}

function renderRecording() {
  const allUpdates = [
    ...state.pendingUpdates,
    {
      id: "seed",
      title: "示例建议：拜访纪要抽取",
      createdAt: "2026-05-12",
      source: "2026-05-12 慕尼黑 CEO 拜访录音",
      confidence: 0.92,
      changes: [
        "联系人状态：Johannes 仍在职，当前负责 DACH 汽车零部件业务。",
        "企业需求：需要能支撑德国汽车零部件联合获客的制造业案例。",
        "下一步行动：准备 DACH 联合方案评审。",
      ],
    },
  ];
  const content = `
    <section class="topbar">
      <div>
        <h1>录音分析</h1>
        <p>上传录音或粘贴纪要后生成结构化更新建议；点击确认后写入来源证据、需求图谱和互动记录。</p>
      </div>
      <button class="btn" id="simulateRecording">模拟上传并分析</button>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-header"><div><h2>上传入口</h2><p>当前页面可记录音频文件名和补充纪要；自动录音与实时转写请在私人业务助理页面完成后同步到这里。</p></div></div>
        <div class="panel-body">
          <div class="field">
            <label>会议录音</label>
            <input type="file" accept="audio/*" />
          </div>
          <div class="field" style="margin-top: 12px;">
            <label>补充备注</label>
            <textarea rows="5" placeholder="例如：这次拜访主要讨论德国汽车零部件客户、SAP/OT 集成、预算、决策人和 GDPR 审批。"></textarea>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h2>已记录互动</h2><p>拜访、电话、邮件、录音都会沉淀为 Interaction。</p></div></div>
        <div class="panel-body stack">
          ${interactions.map((item) => `<div class="card"><h4>${item.date} · ${item.type}</h4><p>${item.summary}</p><p><strong>下一步：</strong>${item.nextAction}</p></div>`).join("")}
        </div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>待确认更新</h2><p>用户确认后才写入联系人、公司和需求图谱。</p></div></div>
      <div class="panel-body stack">
        ${allUpdates.map(renderUpdateCard).join("")}
      </div>
    </section>
  `;
  renderShell(content);
  document.querySelector("#simulateRecording").addEventListener("click", addRecordingSuggestion);
  bindUpdateButtons();
}

function renderUpdateCard(update) {
  return `
    <article class="card">
      <div class="card-head">
        <div><h3>${update.title}</h3><p>${update.source} / ${update.createdAt}</p></div>
        <span class="score">${Math.round(update.confidence * 100)}%</span>
      </div>
      <ul>
        ${update.changes.map((change) => `<li>${change}</li>`).join("")}
      </ul>
      <div class="actions">
        <button class="btn small" data-accept="${update.id}">确认写入</button>
        <button class="btn secondary small" data-dismiss="${update.id}">忽略</button>
      </div>
    </article>
  `;
}

function bindUpdateButtons() {
  document.querySelectorAll("[data-accept]").forEach((button) => {
    button.addEventListener("click", () => acceptUpdate(button.dataset.accept));
  });
  document.querySelectorAll("[data-dismiss]").forEach((button) => {
    button.addEventListener("click", () => dismissUpdate(button.dataset.dismiss));
  });
}

function renderMonitor() {
  const content = `
    <section class="topbar">
      <div>
        <h1>情报监控</h1>
        <p>官网、产品页、新闻页和招聘页的变化先进入更新队列，再由用户确认。</p>
      </div>
      <button class="btn secondary" id="scanNow">模拟巡检</button>
    </section>
    <section class="grid three">
      ${companies.map((company) => `<div class="panel kpi"><strong>${company.monitorFrequency}</strong><span>${company.name} 监控频率</span></div>`).join("")}
    </section>
    <section class="panel">
      <div class="panel-header"><div><h2>变化队列</h2><p>无明显变化时不产生重复提醒。</p></div></div>
      <div class="panel-body stack">
        ${monitoringItems
          .map((item) => {
            const company = getCompany(item.companyId);
            return `<div class="card">
              <div class="card-head"><div><h3>${company.name} · ${item.source}</h3><p>${item.detectedAt}</p></div><span class="tag ${item.status === "待确认" ? "amber" : "blue"}">${item.status}</span></div>
              <p><strong>变化：</strong>${item.change}</p>
              <p><strong>影响：</strong>${item.impact}</p>
              <button class="btn small ${item.status === "待确认" ? "" : "secondary"}" data-monitor="${item.id}">${item.status === "待确认" ? "确认变化" : "已确认"}</button>
            </div>`;
          })
          .join("")}
      </div>
    </section>
  `;
  renderShell(content);
  document.querySelector("#scanNow").addEventListener("click", () => showToast("巡检完成：未发现新的显著变化。"));
  document.querySelectorAll("[data-monitor]").forEach((button) => {
    button.addEventListener("click", () => markMonitoringReviewed(button.dataset.monitor));
  });
}

function renderSources() {
  const content = `
    <section class="topbar">
      <div>
        <h1>合规来源管理</h1>
        <p>每个字段都应能追溯来源、采集时间、授权状态和可信度。</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-body">
        <table class="table">
          <thead><tr><th>类型</th><th>来源</th><th>采集方式</th><th>授权状态</th><th>可信度</th><th>摘要</th></tr></thead>
          <tbody>
            ${sourceEvidence
              .map(
                (source) => `<tr>
                  <td>${source.type}<br><span class="tag">${source.collectedAt}</span></td>
                  <td>${source.source}</td>
                  <td>${source.method}</td>
                  <td>${source.authorization}</td>
                  <td>${Math.round(source.confidence * 100)}%</td>
                  <td>${source.summary}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
  renderShell(content);
}

function renderSync() {
  const shared = readSharedCrm();
  const contacts = shared.contacts || [];
  const conversations = shared.conversations || [];
  const tasks = shared.tasks || [];
  const expenses = shared.expenses || [];
  const content = `
    <section class="topbar">
      <div>
        <h1>助理 / CRM 同步</h1>
        <p>读取私人业务助理写入的本地共享数据池，把联系人、客户沟通和需求导入 CRM 图谱。</p>
      </div>
      <div class="actions">
        <button class="btn" id="importAssistant">从助理导入 CRM</button>
        <button class="btn secondary" id="exportCrm">导出 CRM 到共享池</button>
      </div>
    </section>
    <section class="grid three">
      <div class="panel kpi"><strong>${contacts.length}</strong><span>助理联系人</span></div>
      <div class="panel kpi"><strong>${conversations.length}</strong><span>沟通纪要</span></div>
      <div class="panel kpi"><strong>${tasks.length}</strong><span>待办事项</span></div>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-header"><div><h2>联系人</h2><p>来自私人业务助理。</p></div></div>
        <div class="panel-body stack">
          ${contacts.map((item) => `<div class="card"><h4>${item.name || "未命名"} / ${item.company || "未填公司"}</h4><p>${item.role || ""}</p><p>${[item.email, item.phone, item.whatsapp].filter(Boolean).join(" · ")}</p><p>${item.notes || ""}</p></div>`).join("") || "<div class='empty'>暂无同步联系人。</div>"}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h2>客户沟通</h2><p>录音、上传音频和手动纪要都会进入这里。</p></div></div>
        <div class="panel-body stack">
          ${conversations.map((item) => `<div class="card"><h4>${item.date || ""} · ${item.customer || ""} / ${item.contact || ""}</h4><p>${item.summary || "待分析"}</p><p><strong>下一步：</strong>${(item.nextSteps || []).join("；") || "待确认"}</p><p><strong>CRM 更新：</strong>${(item.crmUpdates || []).join("；") || "暂无"}</p></div>`).join("") || "<div class='empty'>暂无沟通纪要。</div>"}
        </div>
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-header"><div><h2>待办</h2><p>用于判断销售动作是否断档。</p></div></div>
        <div class="panel-body stack">
          ${tasks.slice(0, 12).map((item) => `<div class="card"><h4>${item.date || ""} · ${item.title || ""}</h4><p>${item.customer || ""} · ${item.priority || ""} · ${item.status || ""}</p></div>`).join("") || "<div class='empty'>暂无待办。</div>"}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header"><div><h2>花销</h2><p>客户拜访成本可以回流到客户 ROI 判断。</p></div></div>
        <div class="panel-body stack">
          ${expenses.slice(0, 12).map((item) => `<div class="card"><h4>${item.date || ""} · ${item.category || ""} · ${item.amount || 0} ${item.currency || ""}</h4><p>${item.customer || ""} / ${item.project || ""} / reimbursable: ${item.reimbursable || ""}</p></div>`).join("") || "<div class='empty'>暂无花销。</div>"}
        </div>
      </div>
    </section>
  `;
  renderShell(content);
  document.querySelector("#importAssistant").addEventListener("click", importAssistantData);
  document.querySelector("#exportCrm").addEventListener("click", () => {
    writeSharedCrm();
    showToast("已把 CRM 当前数据导出回共享池。");
  });
}

function render() {
  if (state.activeView === "match") renderMatch();
  if (state.activeView === "graph") renderGraph();
  if (state.activeView === "recording") renderRecording();
  if (state.activeView === "monitor") renderMonitor();
  if (state.activeView === "sync") renderSync();
  if (state.activeView === "sources") renderSources();
}

render();
