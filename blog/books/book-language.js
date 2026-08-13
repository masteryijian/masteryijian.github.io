(function () {
  const switcher = document.querySelector("[data-book-lang-switch]");
  const content = document.querySelectorAll("[data-book-content]");
  if (!switcher || !content.length) return;

  const available = new Set(Array.from(content, (node) => node.dataset.bookContent));
  const requested = new URLSearchParams(window.location.search).get("lang");
  const saved = localStorage.getItem("opcPreferredLanguage");
  const initial = available.has(requested) ? requested : available.has(saved) ? saved : "de";
  const labels = {
    de: { home: "Blog", book: "Buch", about: "Über den Blog", products: "Produkte" },
    zh: { home: "博客首页", book: "图书", about: "关于博客", products: "产品页" },
    en: { home: "Blog", book: "Book", about: "About", products: "Products" }
  };

  switcher.querySelectorAll("[data-book-lang]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.bookLang));
  });

  setLanguage(initial);

  function setLanguage(language) {
    if (!available.has(language)) return;
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    localStorage.setItem("opcPreferredLanguage", language);

    const url = new URL(window.location.href);
    if (language === "de") url.searchParams.delete("lang");
    else url.searchParams.set("lang", language);
    window.history.replaceState({}, "", url);

    content.forEach((node) => {
      node.hidden = node.dataset.bookContent !== language;
    });
    switcher.querySelectorAll("[data-book-lang]").forEach((button) => {
      const active = button.dataset.bookLang === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const text = labels[language];
    document.querySelectorAll(".topbar nav a").forEach((link) => {
      const href = link.getAttribute("href");
      if (href === "../index.html") link.textContent = text.home;
      if (href === "./index.html") link.textContent = text.book;
      if (href === "../about.html") link.textContent = text.about;
      if (href === "../../lab-product.html") link.textContent = text.products;
    });

    const activeContent = Array.from(content).find((node) => node.dataset.bookContent === language);
    const title = activeContent?.querySelector("h1")?.textContent.trim();
    const bookTitle = language === "zh" ? "人人都能用德语" : language === "en" ? "Everyone Can Use German" : "Jeder kann Deutsch benutzen";
    const onlineLabel = language === "zh" ? "免费在线阅读" : language === "en" ? "Read Free Online" : "Kostenlos online lesen";
    if (title) document.title = title === bookTitle ? `${title} | ${onlineLabel}` : `${title} | ${bookTitle}`;
  }
})();
