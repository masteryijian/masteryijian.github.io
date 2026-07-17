(function () {
  const toast = document.querySelector("[data-toast]");

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function currentLanguage() {
    return document.documentElement.lang.startsWith("de") ? "de" : document.documentElement.lang.startsWith("en") ? "en" : "zh";
  }

  const uiMessages = {
    zh: { copied: "已复制", copyPrompt: "复制当前链接", saved: "已保存", savedToast: "已保存到本机稍后读" },
    en: { copied: "Copied", copyPrompt: "Copy this link", saved: "Saved", savedToast: "Saved to your local reading list" },
    de: { copied: "Kopiert", copyPrompt: "Diesen Link kopieren", saved: "Gespeichert", savedToast: "In der lokalen Leseliste gespeichert" }
  };

  async function copyText(text, fallbackMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(uiMessages[currentLanguage()].copied);
    } catch {
      window.prompt(fallbackMessage, text);
    }
  }

  document.querySelectorAll("[data-copy-current]").forEach((button) => {
    button.addEventListener("click", () => {
      copyText(window.location.href, uiMessages[currentLanguage()].copyPrompt);
    });
  });

  document.querySelectorAll("[data-save-read]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = button.closest("[data-current-post]")?.dataset.currentPost;
      if (!current) return;
      const saved = new Set(JSON.parse(localStorage.getItem("savedPosts") || "[]"));
      saved.add(current);
      localStorage.setItem("savedPosts", JSON.stringify(Array.from(saved)));
      button.textContent = uiMessages[currentLanguage()].saved;
      button.disabled = true;
      showToast(uiMessages[currentLanguage()].savedToast);
    });
  });

  const related = document.querySelector("[data-related-posts]");
  if (related && Array.isArray(window.blogPosts)) {
    const current = document.querySelector("[data-current-post]")?.dataset.currentPost;
    const posts = window.blogPosts;
    const currentIndex = posts.findIndex((post) => post.href.includes(current));
    const neighbors = [
      currentIndex > 0 ? posts[currentIndex - 1] : null,
      currentIndex >= 0 && currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null
    ].filter(Boolean);

    related.innerHTML = neighbors.length
      ? neighbors.map((post) => renderRelatedPost(post)).join("")
      : '<p class="empty-state">已经是当前列表里唯一的文章。</p>';
  }

  function renderRelatedPost(post) {
    const href = post.href.replace("./", "../");
    return `
      <a class="related-card" href="${href}">
        <span>${post.category} · ${post.read}</span>
        <strong>${post.title}</strong>
      </a>
    `;
  }

  const topicForm = document.querySelector("[data-topic-form]");
  const topicList = document.querySelector("[data-topic-list]");
  if (topicForm && topicList) {
    const input = topicForm.querySelector("textarea");
    const topics = JSON.parse(localStorage.getItem("blogTopicIdeas") || "[]");
    renderTopics(topics);

    topicForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      topics.unshift({ text: value, createdAt: new Date().toISOString() });
      localStorage.setItem("blogTopicIdeas", JSON.stringify(topics.slice(0, 10)));
      input.value = "";
      renderTopics(topics);
      showToast("选题已保存到本机");
    });
  }

  function renderTopics(topics) {
    topicList.innerHTML = topics.length
      ? topics.map((topic) => `<li>${escapeHtml(topic.text)}</li>`).join("")
      : "<li>还没有保存的选题。</li>";
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char];
    });
  }
})();
