import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entrypoints = [
  "lab-product.html",
  "index.html",
  "about.html",
  "news.html",
  "tools/index.html",
  "tools/market-report/index.html",
  "tools/crm/index.html",
  "tools/ausbildung/index.html",
  "tools/assistant/index.html",
  "tools/newsletter/index.html",
  "tools/markdown/index.html",
  "blog/index.html",
  "blog/about.html",
  "blog/books/index.html",
  "blog/books/author.html",
  "blog/books/copyright.html",
  "blog/books/preface.html",
  "blog/books/chapter-01-start.html",
  "blog/books/chapter-02-speaking.html",
  "blog/books/chapter-03-pronunciation.html",
  "blog/books/chapter-04-reading-aloud.html",
  "blog/books/chapter-05-dictionary.html",
  "blog/books/chapter-06-grammar.html",
  "blog/books/chapter-07-intensive-reading.html",
  "blog/books/chapter-08-writing.html",
  "blog/books/chapter-09-reminders.html",
  "blog/books/afterword.html",
  "blog/posts/hwk-elektro-gruendung-direkteintragung.html",
  "blog/posts/daily-command-center-local-first-retrospective.html",
  "blog/posts/fde-interview-preparation-roadmap.html",
  "blog/posts/voice-collector-local-first-architecture.html",
  "blog/posts/lili-glucose-app-design-retrospective.html",
  "blog/posts/if-i-die-spouse-protection-guide.html",
  "blog/posts/asmax-europe-market-entry-2026.html",
  "blog/posts/geburt-stadtklinikum-karlsruhe-eltern-guide.html",
  "blog/posts/hwk-karlsruhe-gruendung-elektrotechnik.html",
  "blog/posts/aen-karlsruhe-ai-mittelstand-2026.html",
  "blog/posts/eu-foreign-investment-screening-2026.html",
  "blog/posts/eu-cra-industrial-products.html",
  "blog/posts/guangxi-enterprises-global-asean.html",
  "blog/posts/tesla-fsd-europe-spacex-ipo.html",
  "blog/posts/opc-delivery-boundary.html",
  "blog/posts/germany-visit-materials.html",
  "blog/posts/automation-to-business.html",
  "blog/posts/china-supply-chain-germany.html",
];

const failures = [];
const seen = new Set();

for (const file of entrypoints) {
  validateHtml(file);
}

for (const rel of collectFiles(root, [".js"])) {
  try {
    new Function(readFileSync(join(root, rel), "utf8"));
  } catch (error) {
    failures.push(`${rel}: JavaScript parse failed: ${error.message}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Validated ${entrypoints.length} entry pages and ${seen.size} local assets.`);

function validateHtml(rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    failures.push(`${rel}: missing entrypoint`);
    return;
  }
  const html = readFileSync(abs, "utf8");
  if (!/<meta\s+name="viewport"/i.test(html)) failures.push(`${rel}: missing viewport meta`);
  if (!/<title>[^<]+<\/title>/i.test(html)) failures.push(`${rel}: missing title`);
  if (rel.startsWith("blog/books/") && extname(rel) === ".html") {
    if (!/<html\s+lang="de">/i.test(html)) failures.push(`${rel}: German must be the initial language`);
    if (!html.includes("data-book-lang-switch")) failures.push(`${rel}: missing book language switch`);
    if (!html.includes('src="./book-language.js"')) failures.push(`${rel}: missing book language script`);
    for (const language of ["zh", "en", "de"]) {
      const count = (html.match(new RegExp(`data-book-content=["']${language}["']`, "g")) || []).length;
      if (count !== 1) failures.push(`${rel}: expected one content block for ${language}, found ${count}`);
    }
    if (!/data-book-content="de">/.test(html)) failures.push(`${rel}: German content must be initially visible`);
    if (!/data-book-content="zh" hidden>/.test(html)) failures.push(`${rel}: Chinese content must be initially hidden`);
    if (!/data-book-content="en" hidden>/.test(html)) failures.push(`${rel}: English content must be initially hidden`);
  }

  const attrPattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrPattern.exec(html))) {
    const target = match[1];
    if (target.startsWith("http") || target.startsWith("mailto:") || target.startsWith("tel:") || target.startsWith("#")) continue;
    if (target.startsWith("data:") || target.startsWith("javascript:")) continue;
    const withoutHash = target.split("#")[0].split("?")[0];
    if (!withoutHash) continue;
    const resolved = normalize(join(root, dirname(rel), withoutHash));
    if (!resolved.startsWith(root)) {
      failures.push(`${rel}: link escapes root: ${target}`);
      continue;
    }
    if (!existsSync(resolved)) {
      failures.push(`${rel}: missing asset/link ${target}`);
      continue;
    }
    seen.add(resolved);
    if (statSync(resolved).isDirectory() && !existsSync(join(resolved, "index.html"))) {
      failures.push(`${rel}: directory link has no index.html: ${target}`);
    }
  }
}

function collectFiles(dir, exts, base = dir) {
  const names = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      names.push(...collectFiles(abs, exts, base));
      continue;
    }
    if (exts.includes(extname(entry.name))) {
      names.push(normalize(abs.slice(base.length + 1)));
    }
  }
  return names;
}
