import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDocumentation } from '../src/documentation/content.ts';

const target = new URL('../../docs/MasterSamples.html', import.meta.url);
const css = readFileSync(new URL('../src/documentation/documentation.css', import.meta.url), 'utf8');
const data = { PL: getDocumentation('PL'), EN: getDocumentation('EN') };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const text = {
    PL: { title: 'Instalacja i dokumentacja', sub: 'Otwórz plik. Poznaj system. Wdróż krok po kroku.', intro: 'Pełna instrukcja Master Samples, dostępna przed uruchomieniem aplikacji. Ten plik możesz skopiować i otworzyć dwuklikiem — wszystkie treści, style i wyszukiwanie są zapisane w środku.', guide: 'Przewodnik użytkownika', technical: 'Dla zespołu IT', note: 'Warto wiedzieć', toc: 'Spis rozdziałów', empty: 'Brak wyników. Spróbuj „loadcstpkgs”, „SQL” albo „BREQ”.', chapter: 'Rozdział', app: 'Widok w aplikacji:', sql: 'Pliki SQL nowej instalacji', offline: 'Działa bez serwera i internetu', quick: [['deployment', 'Nowa instalacja', 'Baza, frontend i adres aplikacji'], ['package-loading', 'Ładowanie bibliotek', 'Centralny loadcstpkgs'], ['mastercheck', 'Integracja stacji', 'BREQ / BCMP i odpowiedzi EI']] },
    EN: { title: 'Installation and documentation', sub: 'Open the file. Understand the system. Deploy step by step.', intro: 'The complete Master Samples guide, available before the application is running. Copy this file and double-click to open it — all content, styles and search are included.', guide: 'User guide', technical: 'For the IT team', note: 'Good to know', toc: 'Chapter index', empty: 'No results. Try “loadcstpkgs”, “SQL” or “BREQ”.', chapter: 'Chapter', app: 'Application view:', sql: 'Fresh installation SQL files', offline: 'Works without a server or internet', quick: [['deployment', 'Fresh installation', 'Database, frontend and application URL'], ['package-loading', 'Library loading', 'Central loadcstpkgs'], ['mastercheck', 'Station integration', 'BREQ / BCMP and EI replies']] },
};
function renderBlock(block, language) {
    if (block.kind === 'heading') return `<h3 class="doc-subheading">${escape(block.text)}</h3>`;
    if (block.kind === 'paragraph') return `<p class="doc-paragraph">${escape(block.text)}</p>`;
    if (block.kind === 'note') return `<aside class="doc-note"><div><strong>${text[language].note}</strong><p>${escape(block.text)}</p></div></aside>`;
    if (block.kind === 'code') return `<pre class="doc-code" tabindex="0"><code>${escape(block.text)}</code></pre>`;
    if (block.kind === 'steps') return `<ol class="doc-steps">${block.items.map((item, i) => `<li><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><p>${escape(item)}</p></li>`).join('')}</ol>`;
    if (block.kind === 'flow') return `<ol class="doc-flow">${block.items.map((item, i) => `<li><span class="doc-flow-index">${String(i + 1).padStart(2, '0')}</span><span>${escape(item)}</span></li>`).join('')}</ol>`;
    return `<div class="doc-table-scroll" role="region" aria-label="${escape(block.headers.join(' / '))}" tabindex="0"><table class="doc-table"><thead><tr>${block.headers.map(header => `<th scope="col">${escape(header)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${escape(cell)}</th>` : `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function renderLanguage(language) {
    const ui = text[language];
    return `<div class="offline-language" id="language-${language}" lang="${language.toLowerCase()}"${language === 'EN' ? ' hidden' : ''}>
      <section class="doc-hero"><div class="doc-hero-grid" aria-hidden="true"></div><div class="doc-hero-copy"><p class="doc-eyebrow">MASTER SAMPLES / DOCUMENTATION</p><h1>${ui.title}</h1><h2>${ui.sub}</h2><p class="doc-hero-description">${ui.intro}</p><div class="doc-meta"><span>${data[language].length} ${language === 'PL' ? 'rozdziałów' : 'chapters'} · PL / EN</span><span>${ui.offline}</span></div></div></section>
      <div class="doc-shortcuts">${ui.quick.map(([id, title, description]) => `<a class="doc-shortcut" href="#lang=${language}&amp;section=${id}" data-section="${id}"><span class="doc-shortcut-copy"><strong>${title}</strong><span>${description}</span></span><span aria-hidden="true">→</span></a>`).join('')}</div>
      <div class="doc-layout"><aside class="doc-desktop-toc"><div class="doc-toc-sticky"><details class="offline-toc" open><summary>${ui.toc}</summary><nav aria-label="${ui.toc}">${['technical', 'guide'].map(group => `<div class="doc-toc-group"><p>${group === 'guide' ? ui.guide : ui.technical}</p>${data[language].filter(section => section.group === group).map(section => `<a class="doc-toc-link" href="#lang=${language}&amp;section=${section.id}" data-section="${section.id}"><span class="doc-toc-dot"></span>${escape(section.title)}</a>`).join('')}</div>`).join('')}</nav></details></div></aside>
      <div class="doc-content"><p class="offline-result-count" role="status" aria-live="polite"></p><p class="offline-empty" hidden>${ui.empty}</p>${data[language].map((section, i) => `<article class="doc-article" id="${language}-${section.id}" data-chapter="${section.id}" tabindex="-1" aria-labelledby="${language}-${section.id}-title"><header class="doc-article-header"><p class="doc-eyebrow">${section.group === 'guide' ? ui.guide : ui.technical}<span class="doc-chapter-number">${ui.chapter} ${String(i + 1).padStart(2, '0')} / ${data[language].length}</span></p><h2 id="${language}-${section.id}-title">${escape(section.title)}</h2><p>${escape(section.description)}</p></header><div class="doc-article-body">${section.blocks.map(block => renderBlock(block, language)).join('')}</div>${section.id === 'deployment' ? `<footer class="doc-article-action"><strong>${ui.sql}</strong><ul>${['001_initial_schema.sql', '002_station_blocking_rules.sql', '003_verify_installation.sql'].map(file => `<li><a href="../backend/migrations/${file}">${file}</a></li>`).join('')}</ul></footer>` : section.link ? `<footer class="doc-article-action"><p>${ui.app} ${escape(section.link.label)} <code>${escape(section.link.to)}</code></p></footer>` : ''}</article>`).join('')}</div></div>
    </div>`;
}

const html = `<!DOCTYPE html>
<!-- Generated from frontend/src/documentation/content.ts. Run npm run docs:build. -->
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>Master Samples — instalacja i dokumentacja / installation and documentation</title><style>
:root { --font-sans: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; --font-mono: 'JetBrains Mono', Consolas, monospace; }
* { box-sizing: border-box; } body { margin: 0; background: #090d16; color: #f9fafb; font-family: var(--font-sans); } button, input { font: inherit; } button { background: none; border: 0; color: inherit; } a { color: inherit; text-decoration: none; } p,h1,h2,h3,h4,ol,ul,pre { margin: 0; } [hidden] { display: none !important; }
${css}
.documentation { padding: 28px; } .offline-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 25px; } .offline-brand { font: 600 13px var(--font-mono); letter-spacing: .12em; color: #a5b4fc; margin-right: auto; } .offline-toolbar button { padding: 10px 13px; border: 1px solid #344360; border-radius: 7px; } .offline-toolbar button[aria-pressed="true"] { background: #6366f1; } .offline-toolbar input { min-width: 0; width: min(360px,100%); padding: 12px; border: 1px solid #344360; border-radius: 7px; background: #111827; color: #fff; }
.doc-hero h1 { font-size: clamp(28px,4vw,44px); line-height: 1.25; letter-spacing: -.04em; margin-top: 18px; } .doc-hero h2 { font-size: 15px; line-height: 1.7; color: #a5b5d0; letter-spacing: 0; margin-top: 15px; } .doc-hero-copy { max-width: 900px; } .doc-article { margin-bottom: 24px; } .doc-article-header h2 { font-size: 28px; font-weight: 600; margin-top: 15px; line-height: 1.35; } .doc-article-action ul { padding-left: 18px; margin-top: 12px; } .doc-article-action li { margin: 8px 0; } .doc-article-action code { font-family: var(--font-mono); overflow-wrap: anywhere; } .doc-article-action p { flex-wrap: wrap; } .offline-result-count:not(:empty) { color: #a5b5d0; font-size: 13px; margin-bottom: 22px; } .offline-empty { padding: 40px 25px; background: #111827; border-radius: 9px; color: #bcc9e0; } .offline-toc summary { cursor: pointer; font-size: 12px; color: #dbe4f3; padding: 10px 12px 20px; } .offline-noscript { padding: 15px; background: #172238; font-size: 13px; margin-bottom: 20px; } .offline-footer { margin-top: 35px; padding: 20px 0; border-top: 1px solid #263348; color: #8395b1; font-size: 11px; line-height: 1.8; }
@media(max-width:767px) { .documentation { padding: 16px; } .offline-toolbar input { width: 100%; } .doc-desktop-toc { display: block; margin-bottom: 20px; } .doc-toc-sticky { position: static; } .offline-toc { border: 1px solid #263348; background: #111827; border-radius: 9px; padding: 5px; } .doc-article-header h2 { font-size: 23px; } }
@media print { body { background: #fff; color: #111; } .documentation { padding: 0; } .offline-toolbar, .doc-hero, .doc-shortcuts, .doc-desktop-toc, .offline-result-count, .offline-empty, .offline-footer { display:none !important; } .doc-layout { display: block; } .offline-language:not([hidden]) .doc-article[hidden] { display:block !important; } .doc-article, .doc-code, .doc-note, .doc-flow li, .doc-table thead { background:#fff; border-color:#ccc; } .doc-article-header, .doc-article-action, .doc-table :is(td,th) { border-color:#ccc; } .doc-article :is(p,h2,strong,span,code,th,td,a) { color:#111; } .doc-article { break-before: page; } .doc-code { white-space: pre-wrap; overflow-wrap: anywhere; } .doc-table-scroll { overflow:visible; } }
</style></head><body><main class="documentation">
<header class="offline-toolbar"><span class="offline-brand">MASTER SAMPLES / DOCS</span><button type="button" id="lang-PL" aria-pressed="true">PL</button><button type="button" id="lang-EN" aria-pressed="false">EN</button><label class="offline-search-label" for="offline-search">Szukaj / Search</label><input type="search" id="offline-search" placeholder="Szukaj instrukcji, operacji, endpointu…" autocomplete="off"><button type="button" id="offline-clear">Wyczyść / Clear</button></header>
<noscript><p class="offline-noscript">Bez JavaScript możesz czytać wszystkie rozdziały po polsku. Włącz JavaScript, aby zmieniać język i wyszukiwać. / Without JavaScript, all Polish chapters remain readable.</p></noscript>
${renderLanguage('PL')}${renderLanguage('EN')}
<footer class="offline-footer">Master Samples · PL / EN · Samodzielna dokumentacja / Standalone documentation<br>Źródło treści / Content source: frontend/src/documentation/content.ts</footer>
</main><script id="offline-content" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script><script>
(() => {
  const content = JSON.parse(document.getElementById('offline-content').textContent);
  const input = document.getElementById('offline-search');
  let language = 'PL'; let selected = 'deployment';
  const normalize = value => value.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase().trim();
  const texts = section => [section.title, section.description, ...section.blocks.flatMap(block => block.items || (block.rows ? [...block.headers, ...block.rows.flat()] : [block.text]))].join(' ');
  function render() {
    document.documentElement.lang = language.toLowerCase();
    const words = normalize(input.value).split(/\\s+/).filter(Boolean);
    const matches = content[language].filter(section => words.every(word => normalize(texts(section)).includes(word))).map(section => section.id);
    for (const lang of ['PL','EN']) {
      const panel = document.getElementById('language-' + lang); panel.hidden = lang !== language;
      document.getElementById('lang-' + lang).setAttribute('aria-pressed', String(lang === language));
      for (const article of panel.querySelectorAll('[data-chapter]')) article.hidden = words.length ? !matches.includes(article.dataset.chapter) : article.dataset.chapter !== selected;
      for (const link of panel.querySelectorAll('.doc-toc-link')) { link.hidden = words.length > 0 && !matches.includes(link.dataset.section); link.classList.toggle('is-active', !words.length && link.dataset.section === selected); if (!words.length && link.dataset.section === selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); }
      panel.querySelector('.offline-result-count').textContent = words.length ? (language === 'PL' ? 'Znalezione rozdziały: ' : 'Matching chapters: ') + matches.length : '';
      panel.querySelector('.offline-empty').hidden = !words.length || matches.length > 0;
    }
    input.placeholder = language === 'PL' ? 'Szukaj instrukcji, operacji, endpointu…' : 'Search guides, operations, endpoints…';
    document.getElementById('offline-clear').textContent = language === 'PL' ? 'Wyczyść' : 'Clear';
  }
  function readAddress() { const params = new URLSearchParams(location.hash.slice(1)); language = params.get('lang') === 'EN' ? 'EN' : 'PL'; const section = params.get('section'); selected = content[language].some(item => item.id === section) ? section : 'deployment'; render(); }
  function address() { location.hash = new URLSearchParams({lang:language,section:selected}).toString(); }
  for (const lang of ['PL','EN']) document.getElementById('lang-' + lang).addEventListener('click', () => { language = lang; render(); address(); });
  document.querySelectorAll('[data-section]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); selected = link.dataset.section; input.value = ''; render(); address(); const article = document.getElementById(language + '-' + selected); article.focus({preventScroll:true}); article.scrollIntoView({block:'start',behavior:'instant'}); if (matchMedia('(max-width:767px)').matches) document.getElementById('language-' + language).querySelector('details').open = false; }));
  input.addEventListener('input', render);
  document.getElementById('offline-clear').addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  addEventListener('hashchange', readAddress);
  readAddress();
  if (matchMedia('(max-width:767px)').matches) document.querySelectorAll('.offline-toc').forEach(toc => { toc.open = false; });
})();
</script></body></html>
`;

if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== html) throw new Error('Offline documentation is outdated. Run npm run docs:build.');
    console.log('Offline documentation is up to date.');
} else {
    mkdirSync(new URL('../../docs/', import.meta.url), { recursive: true });
    writeFileSync(target, html, 'utf8');
    console.log(`Generated ${fileURLToPath(target)}`);
}
