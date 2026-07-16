(function () {
  const forms = Array.from(document.querySelectorAll("[data-subscribe-form]"));
  if (!forms.length) return;

  const storageKey = "opc-newsletter-subscriptions";
  const fallbackEndpoint = "https://formsubmit.co/ajax/heyijianchina@gmail.com";

  forms.forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = nearestStatus(form);
      const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
      const consent = form.querySelector("[data-subscribe-consent]");
      const honeypot = String(new FormData(form).get("company") || "").trim();

      if (honeypot) return;
      if (!isEmail(email)) {
        show(status, message(form, "invalid"), true);
        return;
      }
      if (consent && !consent.checked) {
        show(status, message(form, "consent"), true);
        return;
      }

      const submitButton = form.querySelector("button[type='submit']:not([hidden])") || form.querySelector("button[type='submit']");
      if (submitButton) submitButton.disabled = true;
      show(status, message(form, "loading"));

      const payload = {
        email,
        source: window.location.href,
        language: currentLang(form),
        consent: "yes",
        submittedAt: new Date().toISOString()
      };

      try {
        await submitSubscription(form, payload);
        remember(payload);
        form.reset();
        show(status, message(form, "success"));
      } catch (error) {
        remember(payload);
        const mailto = `mailto:heyijianchina@gmail.com?subject=${encodeURIComponent("OPC News Subscription")}&body=${encodeURIComponent(`Please add this email to OPC updates: ${email}`)}`;
        show(status, message(form, "fallback", mailto), true);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-subscribe-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.closest(".subscribe-panel, .article-subscribe");
      if (!panel) return;
      const lang = button.dataset.subscribeLang || "zh";
      panel.dataset.lang = lang;
      panel.querySelectorAll("[data-subscribe-lang]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      const input = panel.querySelector("input[type='email']");
      if (input) input.placeholder = lang === "de" ? "name@firma.de" : "you@example.com";
      const status = panel.querySelector("[data-subscribe-status]");
      if (status) status.textContent = "";
    });
  });

  async function submitSubscription(form, payload) {
    const endpoints = [
      form.getAttribute("data-endpoint"),
      "/.netlify/functions/subscribe",
      fallbackEndpoint
    ].filter(Boolean);

    let lastError = new Error("No subscription endpoint configured.");
    for (const endpoint of endpoints) {
      try {
        const response = await post(endpoint, payload);
        if (response.ok) return;
        lastError = new Error(`Subscription endpoint returned ${response.status}.`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  function post(endpoint, payload) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const body = endpoint.includes("formsubmit.co")
      ? JSON.stringify({
          email: payload.email,
          source: payload.source,
          language: payload.language,
          consent: payload.consent,
          submittedAt: payload.submittedAt,
          _subject: "New OPC TechBridge subscriber",
          _template: "table",
          _captcha: "false"
        })
      : JSON.stringify(payload);

    return fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body,
      signal: controller.signal
    }).finally(() => window.clearTimeout(timeout));
  }

  function remember(payload) {
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const next = existing.filter((item) => item.email !== payload.email);
    next.unshift(payload);
    localStorage.setItem(storageKey, JSON.stringify(next.slice(0, 50)));
  }

  function nearestStatus(form) {
    const panel = form.closest(".subscribe-panel, .article-subscribe") || document;
    return panel.querySelector("[data-subscribe-status]");
  }

  function currentLang(form) {
    const panel = form.closest(".subscribe-panel, .article-subscribe");
    return panel?.dataset.lang || "zh";
  }

  function message(form, key, mailto) {
    const lang = currentLang(form);
    const texts = {
      invalid: {
        zh: "请输入有效邮箱。",
        en: "Please enter a valid email address.",
        de: "Bitte eine gültige E-Mail-Adresse eingeben."
      },
      consent: {
        zh: "请先勾选同意接收更新邮件。",
        en: "Please confirm that you agree to receive updates.",
        de: "Bitte bestätigen Sie zuerst den Erhalt von Updates."
      },
      loading: {
        zh: "正在提交订阅请求...",
        en: "Submitting your subscription...",
        de: "Anmeldung wird gesendet..."
      },
      success: {
        zh: "订阅请求已提交。下一次更新会优先通知这个邮箱。",
        en: "Subscription request sent. Future updates will go to this email first.",
        de: "Anmeldung gesendet. Neue Updates gehen künftig an diese E-Mail."
      },
      fallback: {
        zh: `静态页面暂时无法直接保存邮箱。已在本机记录；也可以 <a href="${mailto}">点这里发送订阅确认邮件</a>。`,
        en: `This static page cannot save the email directly yet. It was stored locally; you can also <a href="${mailto}">send a confirmation email</a>.`,
        de: `Diese statische Seite kann die E-Mail noch nicht direkt speichern. Sie wurde lokal gespeichert; alternativ <a href="${mailto}">Bestätigung per E-Mail senden</a>.`
      }
    };
    return texts[key][lang] || texts[key].zh;
  }

  function show(node, message, isWarning) {
    if (!node) return;
    node.innerHTML = message;
    node.style.color = isWarning ? "#8a2d00" : "#005a1f";
  }

  function isEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
})();
