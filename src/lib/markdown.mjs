// Small, safe Markdown → HTML for consent text, context packs and reports.
// Everything is escaped first; only a fixed set of constructs is rendered.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|#[a-z0-9-]+)\)/g, '<a href="$2">$1</a>');
}

export function mdToHtml(md) {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  let table = [];
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|[\s|:-]+\|$/.test(r)).map((r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    const [head, ...rest] = rows;
    out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    table = [];
  };
  for (const raw of String(md ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (/^<!--.*-->$/.test(line.trim())) continue;
    let m;
    if (/^\|.*\|$/.test(line.trim())) { flushPara(); flushList(); table.push(line.trim()); continue; }
    flushTable();
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); flushList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flushPara(); flushList();
      const idm = m[2].match(/\{#([a-z0-9-]+)\}\s*$/);
      const text = m[2].replace(/\s*\{#[a-z0-9-]+\}\s*$/, '');
      out.push(`<h${m[1].length}${idm ? ` id="${idm[1]}"` : ''}>${inline(text)}</h${m[1].length}>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      flushPara();
      const kind = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
      if (list !== kind) { flushList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (!line.trim()) { flushPara(); flushList(); } else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList(); flushTable();
  return out.join('\n');
}
