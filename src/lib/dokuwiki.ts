// Markdown (aus der Strukturerkennung von PyMuPDF) in DokuWiki-Syntax übersetzen.
// Abgedeckt: Überschriften, Hervorhebungen, Code, Links, Bilder, Listen, Tabellen, Zitate, Trennlinien.

/** Text im Fließtext übersetzen (ohne Codeblöcke) */
function inline(s: string): string {
  // Inline-Code zuerst herausnehmen, damit darin nichts übersetzt wird
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  // DokuWiki-Steuerzeichen schützen, die im Text nicht als Syntax gemeint sind
  s = s.replace(/\[\[|\]\]|\{\{|\}\}/g, m => `%%${m}%%`);
  // Bilder und Links
  const links: string[] = [];
  const keep = (x: string) => { links.push(x); return `\u0001${links.length - 1}\u0001`; };
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => keep(alt ? `{{${src}|${alt}}}` : `{{${src}}}`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, t, href) => keep(t === href ? `[[${href}]]` : `[[${href}|${t}]]`));
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, u) => keep(u));
  // Hervorhebungen (Reihenfolge: dreifach, fett, kursiv)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '**//$1//**');
  s = s.replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, '$1**$2**');
  s = s.replace(/(^|[^*])\*(?=[^\s*])([^*]+?)(?<=\S)\*(?!\*)/g, '$1//$2//');
  s = s.replace(/(^|[^\w])_(?=\S)([^_]+?)(?<=\S)_(?!\w)/g, '$1//$2//');
  s = s.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>');
  s = s.replace(/<br\s*\/?>/gi, ' \\\\ ');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => links[+i]);
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `''${codes[+i]}''`);
  return s;
}

const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim());

export function markdownToDokuwiki(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  // Einrückung der Listen: Markdown-Einzüge auf Ebenen abbilden
  let listIndents: number[] = [];
  while (i < lines.length) {
    const line = lines[i];
    // Codeblock
    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(`<code${fence[1] ? ' ' + fence[1] : ''}>`, ...body, '</code>');
      continue;
    }
    // Tabelle: Kopfzeile, Trennzeile, Datenzeilen
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      out.push('^ ' + cells(line).map(inline).join(' ^ ') + ' ^');
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        out.push('| ' + cells(lines[i]).map(c => (c ? inline(c) : '')).join(' | ') + ' |');
        i++;
      }
      continue;
    }
    // Überschrift
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const eq = '='.repeat(Math.max(2, 7 - h[1].length));
      const plain = h[2].replace(/\*\*\*|\*\*|__|`/g, '').replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1$2');
      out.push(`${eq} ${plain} ${eq}`);
      listIndents = []; i++; continue;
    }
    // Trennlinie (auch Seitenumbruch-Markierung)
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('----'); listIndents = []; i++; continue; }
    // Liste
    const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      const ind = li[1].replace(/\t/g, '    ').length;
      while (listIndents.length && ind < listIndents[listIndents.length - 1]) listIndents.pop();
      if (!listIndents.length || ind > listIndents[listIndents.length - 1]) listIndents.push(ind);
      const level = listIndents.length;
      const bullet = /\d/.test(li[2]) ? '-' : '*';
      out.push(`${'  '.repeat(level)}${bullet} ${inline(li[3])}`);
      i++; continue;
    }
    if (!line.trim()) listIndents = [];
    // Zitat
    const q = line.match(/^(\s*>+)\s?(.*)$/);
    if (q) { out.push(`${q[1].trim()} ${inline(q[2])}`); i++; continue; }
    // Absatz; zwei Leerzeichen am Ende = harter Zeilenumbruch
    const hard = / {2,}$/.test(line) && i + 1 < lines.length && lines[i + 1].trim() !== '';
    out.push(inline(line.replace(/\s+$/, '')) + (hard ? ' \\\\' : ''));
    i++;
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s*\n|\n\s*$/g, '');
}
