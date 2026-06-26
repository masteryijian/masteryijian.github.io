(function () {
  const storageKey = "opc-markdown-editor-v1";
  const sample = `# OPC 项目笔记

## 今日重点

- 整理客户需求
- 输出一版德国市场行动清单
- 把邮件草稿写成可发送版本

> 先写清楚问题，再写解决路径。

### 表格示例

| 项目 | 状态 |
| --- | --- |
| 市场资料 | 进行中 |
| 客户邮件 | 待复核 |

\`\`\`
下一步：把这份 Markdown 下载为 .md 文件。
\`\`\`
`;

  const titleInput = document.querySelector("#titleInput");
  const markdownInput = document.querySelector("#markdownInput");
  const preview = document.querySelector("#preview");
  const saveState = document.querySelector("#saveState");
  const stats = document.querySelector("#stats");
  const copyHtml = document.querySelector("#copyHtml");
  const downloadMd = document.querySelector("#downloadMd");
  const clearDraft = document.querySelector("#clearDraft");

  function escapeHtml(value) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderInline(value) {
    let html = escapeHtml(value);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return html;
  }

  function renderTable(lines, startIndex) {
    const header = splitTableRow(lines[startIndex]);
    const divider = splitTableRow(lines[startIndex + 1]);
    if (header.length < 2 || divider.some((cell) => !/^:?-{3,}:?$/.test(cell.trim()))) {
      return null;
    }

    const body = [];
    let cursor = startIndex + 2;
    while (cursor < lines.length && /^\s*\|.+\|\s*$/.test(lines[cursor])) {
      body.push(splitTableRow(lines[cursor]));
      cursor += 1;
    }

    const headHtml = header.map((cell) => `<th>${renderInline(cell.trim())}</th>`).join("");
    const bodyHtml = body
      .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell.trim())}</td>`).join("")}</tr>`)
      .join("");

    return {
      html: `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
      nextIndex: cursor
    };
  }

  function splitTableRow(row) {
    return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  }

  function renderMarkdown(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let list = null;
    let quote = [];
    let inCode = false;
    let codeLines = [];

    function closeParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!list) return;
      html.push(`<${list.type}>${list.items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</${list.type}>`);
      list = null;
    }

    function closeQuote() {
      if (!quote.length) return;
      html.push(`<blockquote>${quote.map((line) => `<p>${renderInline(line)}</p>`).join("")}</blockquote>`);
      quote = [];
    }

    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const line = raw.trim();

      if (line.startsWith("```")) {
        closeParagraph();
        closeList();
        closeQuote();
        if (inCode) {
          html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
          codeLines = [];
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeLines.push(raw);
        continue;
      }

      if (!line) {
        closeParagraph();
        closeList();
        closeQuote();
        continue;
      }

      const table = i + 1 < lines.length ? renderTable(lines, i) : null;
      if (table) {
        closeParagraph();
        closeList();
        closeQuote();
        html.push(table.html);
        i = table.nextIndex - 1;
        continue;
      }

      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
        closeParagraph();
        closeList();
        closeQuote();
        const level = heading[1].length;
        html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        continue;
      }

      if (/^---+$/.test(line)) {
        closeParagraph();
        closeList();
        closeQuote();
        html.push("<hr>");
        continue;
      }

      const bullet = /^[-*]\s+(.+)$/.exec(line);
      const ordered = /^\d+\.\s+(.+)$/.exec(line);
      if (bullet || ordered) {
        closeParagraph();
        closeQuote();
        const type = bullet ? "ul" : "ol";
        if (!list || list.type !== type) closeList();
        if (!list) list = { type, items: [] };
        list.items.push((bullet || ordered)[1]);
        continue;
      }

      if (line.startsWith(">")) {
        closeParagraph();
        closeList();
        quote.push(line.replace(/^>\s?/, ""));
        continue;
      }

      closeList();
      closeQuote();
      paragraph.push(line);
    }

    closeParagraph();
    closeList();
    closeQuote();
    if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);

    return html.join("\n") || "<p class=\"muted\">开始输入 Markdown 后，这里会显示预览。</p>";
  }

  function updateStats(markdown) {
    const chineseChars = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
    const words = (markdown.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9_'-]+/g) || []).length;
    stats.textContent = `${chineseChars} 字 | ${words} 词`;
  }

  function saveDraft() {
    localStorage.setItem(storageKey, JSON.stringify({
      title: titleInput.value,
      markdown: markdownInput.value
    }));
    saveState.textContent = "已保存";
  }

  function render() {
    preview.innerHTML = renderMarkdown(markdownInput.value);
    updateStats(markdownInput.value);
    saveState.textContent = "保存中...";
    window.clearTimeout(render.saveTimer);
    render.saveTimer = window.setTimeout(saveDraft, 250);
  }

  function insertText(before, after, placeholder) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selected = markdownInput.value.slice(start, end) || placeholder;
    const next = `${before}${selected}${after}`;
    markdownInput.setRangeText(next, start, end, "select");
    markdownInput.focus();
    render();
  }

  function sanitizeFilename(name) {
    return (name || "opc-notes").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "opc-notes";
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      if (action === "heading") insertText("# ", "", "标题");
      if (action === "bold") insertText("**", "**", "重点文字");
      if (action === "italic") insertText("*", "*", "斜体文字");
      if (action === "link") insertText("[", "](https://example.com)", "链接文字");
      if (action === "list") insertText("- ", "", "列表项");
      if (action === "quote") insertText("> ", "", "引用内容");
      if (action === "code") insertText("```\n", "\n```", "代码或命令");
    });
  });

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value);
    }
    const helper = document.createElement("textarea");
    helper.value = value;
    helper.setAttribute("readonly", "");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
    return Promise.resolve();
  }

  copyHtml.addEventListener("click", async () => {
    await copyText(preview.innerHTML);
    copyHtml.textContent = "已复制";
    window.setTimeout(() => {
      copyHtml.textContent = "复制 HTML";
    }, 1200);
  });

  downloadMd.addEventListener("click", () => {
    const blob = new Blob([markdownInput.value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${sanitizeFilename(titleInput.value)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  });

  clearDraft.addEventListener("click", () => {
    const shouldClear = window.confirm("确定清空当前 Markdown 草稿吗？");
    if (!shouldClear) return;
    titleInput.value = "opc-notes";
    markdownInput.value = "";
    render();
  });

  titleInput.addEventListener("input", saveDraft);
  markdownInput.addEventListener("input", render);

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    titleInput.value = saved && saved.title ? saved.title : "opc-notes";
    markdownInput.value = saved && saved.markdown ? saved.markdown : sample;
  } catch (error) {
    markdownInput.value = sample;
  }

  render();
})();
