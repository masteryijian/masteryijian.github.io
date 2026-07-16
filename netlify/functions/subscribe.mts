type SubscribePayload = {
  email?: string;
  source?: string;
  language?: string;
  consent?: string;
  submittedAt?: string;
};

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: SubscribePayload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = String(payload.email || "").trim().toLowerCase();
  if (!emailPattern.test(email)) {
    return json({ error: "Invalid email" }, 400);
  }
  if (payload.consent !== "yes") {
    return json({ error: "Missing consent" }, 400);
  }

  const webhookUrl = Netlify.env.get("SUBSCRIBE_WEBHOOK_URL");
  if (!webhookUrl) {
    return json({ error: "Subscription webhook is not configured" }, 503);
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      source: payload.source || "",
      language: payload.language || "zh",
      consent: payload.consent,
      submittedAt: payload.submittedAt || new Date().toISOString()
    })
  });

  if (!response.ok) {
    return json({ error: "Subscription provider failed" }, 502);
  }

  return json({ ok: true });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
