const MAX_INPUT_CHARS = 28000;

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

export default async (req: Request) => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const anthropicBaseUrl = Netlify.env.get("ANTHROPIC_BASE_URL");
  const openaiApiKey = Netlify.env.get("OPENAI_API_KEY");
  const anthropicToken =
    Netlify.env.get("ANTHROPIC_AUTH_TOKEN") ||
    Netlify.env.get("ANTHROPIC_API_KEY") ||
    (anthropicBaseUrl ? openaiApiKey : undefined);
  const preferAnthropic = Boolean(anthropicBaseUrl || anthropicToken);
  if (preferAnthropic && !anthropicToken) {
    return json(
      {
        ok: false,
        code: "ANTHROPIC_AUTH_TOKEN_MISSING",
        error: "已配置 ANTHROPIC_BASE_URL，但 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY 没有进入 Functions 运行时。请检查该变量的 Functions scope。"
      },
      503
    );
  }
  if (!anthropicToken && !openaiApiKey) {
    return json(
      {
        ok: false,
        code: "AI_KEY_MISSING",
        error: "AI 未配置：请设置 ANTHROPIC_AUTH_TOKEN 或 OPENAI_API_KEY，或复制给 Codex 分析。"
      },
      503
    );
  }

  let payload: AnalysisPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "请求 JSON 无法解析。" }, 400);
  }

  const profile = payload.profile || {};
  const extractedText = String(payload.extractedText || "").slice(0, MAX_INPUT_CHARS);
  const provider = preferAnthropic ? "anthropic" : "openai";
  const model =
    provider === "anthropic"
      ? Netlify.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-20250514"
      : Netlify.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

  const prompt = [
    "你是 OPC TechBridge 的德国市场进入顾问。请基于用户上传资料和项目档案生成真实拜访评估报告。",
    "",
    "硬性要求：",
    "- 不要假装联网，不要编造不存在的来源。",
    "- 明确区分：资料中直接出现的信息、你做出的推断、仍需外部验证的点。",
    "- 输出 Markdown，语言为中文。",
    "- 结构必须包含：项目摘要、资料关键信息、德国/欧盟市场机会、合规与数据安全风险、客户拜访问题清单、报价/落地模式建议、下一步任务、缺失资料。",
    "- 如果资料不足，要直接说明不足，不要用空泛话术填充。",
    "",
    "项目档案：",
    JSON.stringify(profile, null, 2),
    "",
    "文件清单：",
    JSON.stringify(payload.files || [], null, 2),
    "",
    payload.extractedTextTruncated
      ? `文档抽取内容（已截断到 ${MAX_INPUT_CHARS} 字符）：`
      : "文档抽取内容：",
    extractedText || "没有可读文本。请只基于项目档案做有限分析，并列出需要补充的资料。"
  ].join("\n");

  try {
    const aiResult =
      provider === "anthropic"
        ? await callAnthropic({
            baseUrl: anthropicBaseUrl || "https://api.anthropic.com",
            token: anthropicToken as string,
            model,
            prompt
          })
        : await callOpenAI({
            apiKey: openaiApiKey as string,
            model,
            prompt
          });

    return json({
      ok: true,
      report: aiResult.report,
      profile: {
        ...profile,
        files: payload.files || [],
        extracted_text_chars: String(payload.extractedText || "").length,
        generated_at: new Date().toISOString(),
        ai: {
          provider,
          model,
          input_truncated: Boolean(payload.extractedTextTruncated)
        }
      },
      ai: {
        provider,
        model
      }
    });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          detail: error.detail
        },
        error.status
      );
    }
    return json(
      {
        ok: false,
        code: "AI_NETWORK_ERROR",
        error: error instanceof Error ? error.message : "AI 网络调用失败。"
      },
      502
    );
  }
};

export const config = {
  path: "/api/analyze"
};

async function callAnthropic({
  baseUrl,
  token,
  model,
  prompt
}: {
  baseUrl: string;
  token: string;
  model: string;
  prompt: string;
}) {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/messages`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "anthropic-version": "2023-06-01"
  };
  if (baseUrl.includes("anthropic.com")) {
    headers["x-api-key"] = token;
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 3200,
      system: "You produce practical, evidence-aware market-entry visit reports for Chinese companies entering Germany/EU markets.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new AiProviderError(data?.error?.message || data?.message || "Anthropic-compatible API 调用失败。", "ANTHROPIC_API_ERROR", data, response.status);
  }
  const report = extractAnthropicText(data);
  if (!report) {
    throw new AiProviderError("Anthropic-compatible API 没有返回可用文本。", "ANTHROPIC_EMPTY_OUTPUT", data, 502);
  }
  return { report };
}

async function callOpenAI({ apiKey, model, prompt }: { apiKey: string; model: string; prompt: string }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: "You produce practical, evidence-aware market-entry visit reports for Chinese companies entering Germany/EU markets.",
      input: prompt
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new AiProviderError(data?.error?.message || "OpenAI API 调用失败。", "OPENAI_API_ERROR", data?.error || data, response.status);
  }

  const report = extractOpenAIText(data);
  if (!report) {
    throw new AiProviderError("OpenAI 没有返回可用文本。", "OPENAI_EMPTY_OUTPUT", data, 502);
  }
  return { report };
}

function extractAnthropicText(data: AnthropicResponse): string {
  return (data.content || [])
    .map((item) => (item.type === "text" && typeof item.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractOpenAIText(data: OpenAIResponse): string {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks: string[] = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

class AiProviderError extends Error {
  code: string;
  detail: unknown;
  status: number;

  constructor(message: string, code: string, detail: unknown, status: number) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

type AnalysisPayload = {
  profile?: Record<string, unknown>;
  files?: Array<Record<string, unknown>>;
  extractedText?: string;
  extractedTextTruncated?: boolean;
  generatedAt?: string;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
};

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};
