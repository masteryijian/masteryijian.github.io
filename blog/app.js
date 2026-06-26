const posts = window.blogPosts || [];
const grid = document.querySelector("#postGrid");
const search = document.querySelector("#search");
const clearSearch = document.querySelector("#clearSearch");
const shareBlog = document.querySelector("#shareBlog");
const filters = Array.from(document.querySelectorAll("[data-category]"));

let activeCategory = "All";

function render() {
  const query = search.value.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    const text = `${post.title} ${post.summary} ${post.category}`.toLowerCase();
    const categoryOk = activeCategory === "All" || post.category === activeCategory;
    return categoryOk && (!query || text.includes(query));
  });

  grid.innerHTML = filtered.length
    ? filtered.map(renderPost).join("")
    : '<p>没有找到匹配文章。换一个关键词试试。</p>';
}

function renderPost(post) {
  return `
    <article class="post-card">
      <img src="${post.image}" alt="">
      <div class="post-body">
        <div class="meta">
          <span>${post.date}</span>
          <span class="tag">${post.category}</span>
          <span>${post.read}</span>
        </div>
        <h2><a href="${post.href}">${post.title}</a></h2>
        <p>${post.summary}</p>
        <a href="${post.href}">阅读全文</a>
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

search.addEventListener("input", render);

clearSearch.addEventListener("click", () => {
  search.value = "";
  activeCategory = "All";
  filters.forEach((item) => item.classList.toggle("active", item.dataset.category === "All"));
  render();
  search.focus();
});

shareBlog.addEventListener("click", async () => {
  const shareData = {
    title: "Yijian Notes",
    text: "中德技术落地、OPC 一人公司和业务自动化实践笔记。",
    url: window.location.href
  };
  if (navigator.share) {
    await navigator.share(shareData);
    return;
  }
  await navigator.clipboard.writeText(window.location.href);
  shareBlog.textContent = "已复制链接";
  setTimeout(() => {
    shareBlog.textContent = "分享博客";
  }, 1800);
});

render();
