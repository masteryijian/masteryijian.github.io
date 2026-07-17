(function () {
  const switcher = document.querySelector("[data-article-lang-switch]");
  const content = document.querySelectorAll("[data-article-content]");
  if (!switcher || !content.length) return;

  const available = new Set(Array.from(content, (node) => node.dataset.articleContent));
  const requested = new URLSearchParams(window.location.search).get("lang");
  const saved = localStorage.getItem("opcArticleLanguage");
  const initial = available.has(requested) ? requested : available.has(saved) ? saved : "zh";
  const labels = {
    zh: { list: "文章列表", about: "关于博客", news: "行业动态", products: "产品页", back: "返回列表", copy: "复制链接", save: "稍后读", related: "继续阅读" },
    en: { list: "Articles", about: "About", news: "Market news", products: "Products", back: "Back to articles", copy: "Copy link", save: "Read later", related: "Continue reading" },
    de: { list: "Artikel", about: "Über den Blog", news: "Markttrends", products: "Produkte", back: "Zurück zu den Artikeln", copy: "Link kopieren", save: "Später lesen", related: "Weiterlesen" }
  };

    switcher.querySelectorAll("[data-article-lang]").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.articleLang));
    });

  document.querySelectorAll("[data-subscribe-lang]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.subscribeLang));
  });

  setLanguage(initial);

  function setLanguage(language) {
    if (!available.has(language)) return;
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    localStorage.setItem("opcArticleLanguage", language);
    const url = new URL(window.location.href);
    if (language === "zh") url.searchParams.delete("lang");
    else url.searchParams.set("lang", language);
    window.history.replaceState({}, "", url);

    content.forEach((node) => {
      node.hidden = node.dataset.articleContent !== language;
    });

    switcher.querySelectorAll("[data-article-lang]").forEach((button) => {
      const active = button.dataset.articleLang === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    document.querySelectorAll(".article-subscribe").forEach((panel) => {
      panel.dataset.lang = language;
      panel.querySelectorAll("[data-subscribe-lang]").forEach((button) => {
        const active = button.dataset.subscribeLang === language;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    });

    const title = document.querySelector(`[data-article-content="${language}"] h1`);
    if (title) document.title = title.textContent.trim();
    updateInterface(language);
  }

  function updateInterface(language) {
    const text = labels[language];
    document.querySelectorAll(".topbar nav a").forEach((link) => {
      if (link.getAttribute("href") === "../index.html") link.textContent = text.list;
      if (link.getAttribute("href") === "../about.html") link.textContent = text.about;
      if (link.getAttribute("href") === "../../news.html") link.textContent = text.news;
      if (link.getAttribute("href") === "../../lab-product.html") link.textContent = text.products;
    });
    const back = document.querySelector(".article-tools .tool-link");
    const copy = document.querySelector("[data-copy-current]");
    const save = document.querySelector("[data-save-read]");
    const related = document.querySelector(".related-section > h2");
    if (back) back.textContent = text.back;
    if (copy) copy.textContent = text.copy;
    if (save && !save.disabled) save.textContent = text.save;
    if (related) related.textContent = text.related;
    document.dispatchEvent(new CustomEvent("articlelanguagechange", { detail: { language } }));
  }
})();
