import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const booksDir = join(root, "blog", "books");
const files = (await readdir(booksDir)).filter((file) => file.endsWith(".html")).sort();
const cache = new Map();

for (const file of files) {
  const path = join(booksDir, file);
  let html = await readFile(path, "utf8");
  if (html.includes("data-book-lang-switch")) {
    html = polishGeneratedPage(html, file);
    await writeFile(path, html);
    console.log(`${file}: polished existing translation`);
    continue;
  }

  const isIndex = file === "index.html";
  const sourcePattern = isIndex
    ? /(<main>)([\s\S]*?)(<\/main>)/
    : /(<article>[\s\S]*?<\/article>\s*<nav class="book-nav"[\s\S]*?<\/nav>\s*<footer class="book-license">[\s\S]*?<\/footer>)/;
  const sourceMatch = html.match(sourcePattern);
  if (!sourceMatch) throw new Error(`${file}: book content structure not recognized`);
  const source = isIndex ? sourceMatch[2] : sourceMatch[1];

  const [english, german] = await Promise.all([
    translateFragment(source, "en"),
    translateFragment(source, "de")
  ]);
  const switcher = `\n      <div class="article-language-switch book-language-switch" data-book-lang-switch aria-label="Seitensprache / Site language / 页面语言">\n        <button type="button" class="active" data-book-lang="de" aria-pressed="true">DE</button>\n        <button type="button" data-book-lang="zh" aria-pressed="false">中文</button>\n        <button type="button" data-book-lang="en" aria-pressed="false">EN</button>\n      </div>`;
  const blocks = `\n      <div data-book-content="zh" hidden>${isIndex ? `<main>${source}</main>` : source}</div>\n      <div data-book-content="en" hidden>${isIndex ? `<main>${english}</main>` : english}</div>\n      <div data-book-content="de">${isIndex ? `<main>${german}</main>` : german}</div>`;

  html = html.replace(sourceMatch[0], blocks);
  html = html.replace(/(<\/header>)(\s*<div data-book-content="zh")/, `$1${switcher}$2`);
  html = html.replace('<html lang="zh-CN">', '<html lang="de">');
  html = html.replace('<a href="../index.html">博客首页</a>', '<a href="../index.html">Blog</a>');
  html = html.replace('<a href="./index.html">图书</a>', '<a href="./index.html">Buch</a>');
  html = html.replace('<a href="../about.html">关于博客</a>', '<a href="../about.html">Über den Blog</a>');
  html = html.replace('<a href="../../lab-product.html">产品页</a>', '<a href="../../lab-product.html">Produkte</a>');

  const germanTitle = extractText(german, "h1") || "Jeder kann Deutsch benutzen";
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(germanTitle)} | Jeder kann Deutsch benutzen</title>`);
  html = html.replace("</body>", '    <script src="./book-language.js"></script>\n  </body>');
  html = polishGeneratedPage(html, file);
  await writeFile(path, html);
  console.log(`${file}: zh/en/de generated`);
}

async function translateFragment(fragment, target) {
  const textPattern = />([^<>]+)</g;
  const texts = [];
  let match;
  while ((match = textPattern.exec(fragment))) {
    const value = match[1].trim();
    if (value && /[\u3400-\u9fff]/u.test(value)) texts.push(value);
  }
  const unique = [...new Set(texts)];
  const translated = new Map();
  let cursor = 0;

  async function worker() {
    while (cursor < unique.length) {
      const text = unique[cursor++];
      translated.set(text, await translateText(text, target));
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, worker));

  return fragment.replace(textPattern, (full, raw) => {
    const value = raw.trim();
    if (!translated.has(value)) return full;
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    return `>${leading}${escapeHtml(translated.get(value))}${trailing}<`;
  });
}

async function translateText(text, target) {
  const key = `${target}\u0000${text}`;
  if (cache.has(key)) return cache.get(key);
  const endpoint = new URL("https://translate.googleapis.com/translate_a/single");
  endpoint.search = new URLSearchParams({ client: "gtx", sl: "zh-CN", tl: target, dt: "t", q: text });
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(endpoint, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const result = payload[0]?.map((part) => part[0]).join("");
      if (!result) throw new Error("empty response");
      cache.set(key, result);
      return result;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Translation failed (${target}): ${text.slice(0, 60)} — ${lastError}`);
}

function extractText(fragment, tag) {
  const match = fragment.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match?.[1].replace(/<[^>]+>/g, "").trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
}

function polishGeneratedPage(html, file) {
  const replacements = new Map([
    ["Everyone can speak German", "Everyone Can Use German"],
    ["Jeder kann Deutsch sprechen", "Jeder kann Deutsch benutzen"],
    ["Author's note: Why I wrote this book", "Author's Note: Why I Wrote This Book"],
    ["Anmerkung des Autors: Warum ich dieses Buch geschrieben habe", "Vorwort des Autors: Warum ich dieses Buch geschrieben habe"],
    ["Copyright and Licensing", "Copyright and License"],
    ["Urheberrecht und Lizenzierung", "Urheberrecht und Lizenz"],
    ["Preface: One word, \"use\"", "Preface: One Word—“Use”"],
    ["Vorwort: Ein Wort: „verwenden“", "Vorwort: Ein Wort – „benutzen“"],
    ["Chapter 1 Starting point", "Chapter 1: The Starting Point"],
    ["Kapitel 1 Ausgangspunkt", "Kapitel 1: Der Anfang"],
    ["Chapter 2 Spoken English: From “mute German” to interview German", "Chapter 2: Speaking—from “Silent German” to Interview German"],
    ["Kapitel 2 Gesprochenes Englisch: Vom „stummen Deutsch“ zum Interview-Deutsch", "Kapitel 2: Sprechen – Vom „stummen Deutsch“ zum Bewerbungsgespräch"],
    ["Chapter 3 Voice: The part spoken in three sentences", "Chapter 3: Pronunciation—the Part Explained in Three Sentences"],
    ["Kapitel 3 Stimme: Der in drei Sätzen gesprochene Teil", "Kapitel 3: Aussprache – Der Teil, der sich in drei Sätzen erklären lässt"],
    ["Chapter 4 Reading aloud: Read aloud, recite, and read aloud again", "Chapter 4: Reading Aloud—Read, Memorize, and Read Again"],
    ["Kapitel 4 Vorlesen: Vorlesen, rezitieren und noch einmal vorlesen", "Kapitel 4: Laut lesen – Lesen, auswendig lernen, noch einmal lesen"],
    ["Chapter 5 Dictionaries and Tools: Pick up a dictionary and go on the road alone", "Chapter 5: Dictionaries and Tools—Learning Independently with a Dictionary"],
    ["Kapitel 5 Wörterbücher und Tools: Schnappen Sie sich ein Wörterbuch und machen Sie sich alleine auf den Weg", "Kapitel 5: Wörterbücher und Werkzeuge – Mit dem Wörterbuch selbstständig weiterlernen"],
    ["Chapter 6 Grammar: The “grammar” of German must be taken head-on", "Chapter 6: Grammar—Facing German Grammar Head-on"],
    ["Kapitel 6 Grammatik: Die „Grammatik“ des Deutschen muss direkt bewältigt werden", "Kapitel 6: Grammatik – Der deutschen Grammatik direkt begegnen"],
    ["Chapter 7 Intensive reading: reading German books and reading the Bible", "Chapter 7: Intensive Reading—German Books and the Bible"],
    ["Kapitel 7 Intensives Lesen: Lesen deutscher Bücher und Lesen der Bibel", "Kapitel 7: Intensives Lesen – Deutsche Bücher und die Bibel lesen"],
    ["Chapter 8 Writing: Starting with Anschreiben", "Chapter 8: Writing—Starting with the Anschreiben"],
    ["Kapitel 8 Schreiben: Beginnend mit Anschreiben", "Kapitel 8: Schreiben – Mit dem Anschreiben beginnen"],
    ["Chapter 9: Advice: Six months is the starting point, long-termism is the end point", "Chapter 9: A Reminder—Six Months Is the Beginning; Long-Term Practice Is the Goal"],
    ["Kapitel 9: Rat: Sechs Monate sind der Ausgangspunkt, Langfristigkeit ist der Endpunkt", "Kapitel 9: Erinnerung – Sechs Monate sind der Anfang, langfristige Praxis ist das Ziel"],
    ["Postscript: Start living in German today", "Afterword: Start Living in German Today"],
    ["Nachwort: Beginnen Sie noch heute, auf Deutsch zu leben", "Nachwort: Ab heute auf Deutsch leben"],
    ["Chapter table of contents", "Contents"],
    ["Inhaltsverzeichnis des Kapitels", "Inhaltsverzeichnis"]
  ]);
  for (const [before, after] of replacements) html = html.replaceAll(before, after);

  if (file === "index.html") {
    const indexReplacements = new Map([
      ["A long-term practice that started in six months: written for newcomers to the DACH area, and also for \"old people\" who are no longer young but still want to learn German. Read chapters online and download the entire PDF for free.", "A long-term approach with a six-month starting phase—for newcomers to the DACH region and for anyone who is no longer young but still wants to learn German. Read it online chapter by chapter or download the complete PDF for free."],
      ["Eine Langzeitpraxis, die in sechs Monaten begann: geschrieben für Neulinge im DACH-Raum, aber auch für „alte Leute“, die nicht mehr jung sind, aber trotzdem Deutsch lernen wollen. Lesen Sie die Kapitel online und laden Sie das gesamte PDF kostenlos herunter.", "Ein langfristiger Praxisweg mit sechsmonatigem Einstieg – für Neuankömmlinge im DACH-Raum und für alle, die nicht mehr ganz jung sind, aber weiterhin Deutsch lernen möchten. Kapitelweise online lesen oder das vollständige PDF kostenlos herunterladen."],
      ["It’s not about learning German, it’s about living in German", "Do Not Just Learn German—Live in German"],
      ["Es geht nicht darum, Deutsch zu lernen, sondern darum, auf Deutsch zu leben", "Deutsch nicht nur lernen, sondern auf Deutsch leben"],
      ["Author: Yijian He · 2026-08-06 First draft v0.1", "Author: Yijian He · First draft v0.1 · 6 August 2026"],
      ["Autor: Yijian He · 2026-08-06 Erster Entwurf v0.1", "Autor: Yijian He · Erstfassung v0.1 · 6. August 2026"],
      ["This book refers to the methodology of Li Xiaolai's \"Everyone Can Use English\" and transfers the word \"use\" to German as a whole: daily tasks, communicating with people, reading German books and Bibles, and job interviews, all become German practices. The book has 63 pages, including information cocoon and breakthrough direction, daily task system and six-month three-stage route.", "Inspired by the methodology of Li Xiaolai’s Everyone Can Use English, this book transfers the central idea of “use” to German: daily tasks, conversations, reading German books and the Bible, and job interviews all become real German practice. The 63-page book also covers information bubbles, a daily task system, and a three-stage six-month path."],
      ["Dieses Buch bezieht sich auf die Methodik von Li Xiaolais „Jeder kann Englisch verwenden“ und überträgt das Wort „verwenden“ als Ganzes auf das Deutsche: Alltägliche Aufgaben, die Kommunikation mit Menschen, das Lesen deutscher Bücher und Bibeln sowie Vorstellungsgespräche werden zu deutschen Praktiken. Das Buch umfasst 63 Seiten, einschließlich Informationskokon und Durchbruchsrichtung, täglichem Aufgabensystem und sechsmonatiger dreistufiger Route.", "Inspiriert von der Methodik aus Li Xiaolais „Everyone Can Use English“ überträgt dieses Buch die Leitidee des „Benutzens“ auf das Deutsche: tägliche Aufgaben, Gespräche, deutsche Bücher und die Bibel sowie Bewerbungsgespräche werden zu echter Sprachpraxis. Die 63 Seiten behandeln außerdem Informationsblasen, ein tägliches Aufgabensystem und einen dreistufigen Sechsmonatsplan."],
      ["This work adopts CC BY-NC-ND 4.0: It can be reproduced for free with attribution, not for commercial use, and not for modification.", "This work is licensed under CC BY-NC-ND 4.0: sharing with attribution is permitted; commercial use and adaptations are not."],
      ["Dieses Werk übernimmt CC BY-NC-ND 4.0: Es kann kostenlos mit Quellenangabe reproduziert werden, nicht für kommerzielle Nutzung und nicht zur Änderung.", "Dieses Werk steht unter CC BY-NC-ND 4.0: Teilen mit Namensnennung ist erlaubt; kommerzielle Nutzung und Bearbeitung sind nicht gestattet."]
    ]);
    for (const [before, after] of indexReplacements) html = html.replaceAll(before, after);
  }

  const description = file === "index.html"
    ? "„Jeder kann Deutsch benutzen“: ein langfristiger Praxisweg mit sechsmonatigem Einstieg, kostenlos kapitelweise online und als PDF."
    : "Kostenlose Online-Lektüre aus „Jeder kann Deutsch benutzen“ – einem praxisorientierten Buch über Deutschlernen durch tägliche Anwendung.";
  return html.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`);
}
