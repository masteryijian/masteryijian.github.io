const posts = window.blogPosts || [];
const i18n = window.blogI18n || { ui: {}, categories: {}, posts: {} };
const grid = document.querySelector("#postGrid");
const search = document.querySelector("#search");
const clearSearch = document.querySelector("#clearSearch");
const shareBlog = document.querySelector("#shareBlog");
const filters = Array.from(document.querySelectorAll("[data-category]"));
const languageButtons = Array.from(document.querySelectorAll("[data-site-lang]"));
const supportedLanguages = new Set(["de", "zh", "en"]);

let activeCategory = "All";
let currentLanguage = initialLanguage();

function initialLanguage() {
  const requested = new URLSearchParams(window.location.search).get("lang");
  const saved = localStorage.getItem("opcArticleLanguage");
  if (supportedLanguages.has(requested)) return requested;
  if (supportedLanguages.has(saved)) return saved;
  return "de";
}

function setLanguage(language) {
  if (!supportedLanguages.has(language)) return;
  currentLanguage = language;
  localStorage.setItem("opcArticleLanguage", language);
  document.documentElement.lang = language === "zh" ? "zh-CN" : language;

  const url = new URL(window.location.href);
  if (language === "de") url.searchParams.delete("lang");
  else url.searchParams.set("lang", language);
  window.history.replaceState({}, "", url);

  languageButtons.forEach((button) => {
    const active = button.dataset.siteLang === language;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const text = i18n.ui[language] || i18n.ui.de;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = text[node.dataset.i18n];
    if (value) node.textContent = value;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    const value = text[node.dataset.i18nPlaceholder];
    if (value) node.placeholder = value;
  });
  filters.forEach((button) => {
    button.textContent = categoryLabel(button.dataset.category);
  });

  document.title = text.pageTitle;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = text.description;
  render();
  document.dispatchEvent(new CustomEvent("bloglanguagechange", { detail: { language } }));
}

function categoryLabel(category) {
  return i18n.categories[currentLanguage]?.[category] || category;
}

function postKey(post) {
  return post.href.replace(/^\.\//, "").replace(/^posts\//, "");
}

function localizedPost(post) {
  if (currentLanguage === "zh") return post;
  const translated = i18n.posts[postKey(post)]?.[currentLanguage];
  if (!translated) return post;
  return { ...post, title: translated[0], summary: translated[1] };
}

function localizedRead(read) {
  const bookMatch = read.match(/^全书 · (\d+) 章$/);
  if (!bookMatch || currentLanguage === "zh") return read;
  return currentLanguage === "de"
    ? `Gesamtwerk · ${bookMatch[1]} Kapitel`
    : `Full book · ${bookMatch[1]} chapters`;
}

function localizedHref(href) {
  if (currentLanguage === "de") return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}lang=${currentLanguage}`;
}

function render() {
  const query = search.value.trim().toLocaleLowerCase(currentLanguage === "zh" ? "zh-CN" : currentLanguage);
  const filtered = posts.filter((post) => {
    const localized = localizedPost(post);
    const text = `${localized.title} ${localized.summary} ${categoryLabel(post.category)} ${post.title} ${post.summary}`.toLocaleLowerCase();
    const categoryOk = activeCategory === "All" || post.category === activeCategory;
    return categoryOk && (!query || text.includes(query));
  });

  grid.innerHTML = filtered.length
    ? filtered.map(renderPost).join("")
    : `<p>${i18n.ui[currentLanguage].empty}</p>`;
}

function renderPost(post) {
  const localized = localizedPost(post);
  const href = localizedHref(post.href);
  return `
    <article class="post-card">
      <img src="${post.image}" alt="">
      <div class="post-body">
        <div class="meta">
          <span>${post.date}</span>
          <span class="tag">${categoryLabel(post.category)}</span>
          <span>${localizedRead(post.read)}</span>
        </div>
        <h2><a href="${href}">${localized.title}</a></h2>
        <p>${localized.summary}</p>
        <a href="${href}">${i18n.ui[currentLanguage].readMore}</a>
      </div>
    </article>
  `;
}

filters.forEach((button) => {
  button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    filters.forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

languageButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.siteLang));
});

search.addEventListener("input", render);

clearSearch.addEventListener("click", () => {
  search.value = "";
  activeCategory = "All";
  filters.forEach((item) => item.classList.toggle("active", item.dataset.category === "All"));
  render();
  search.focus();
});

shareBlog.addEventListener("click", async () => {
  const text = i18n.ui[currentLanguage];
  const shareData = {
    title: "Yijian Notes",
    text: text.shareText,
    url: window.location.href
  };
  if (navigator.share) {
    await navigator.share(shareData);
    return;
  }
  await navigator.clipboard.writeText(window.location.href);
  shareBlog.textContent = text.copied;
  setTimeout(() => {
    shareBlog.textContent = i18n.ui[currentLanguage].shareBlog;
  }, 1800);
});

setLanguage(currentLanguage);
