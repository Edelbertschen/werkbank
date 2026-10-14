# Seiten zusammenstellen, ohne dass etwas verloren geht (wird in Werkbank per Pyodide ausgeführt)
import pymupdf
def _named_to_goto(d):
    """Links auf benannte Ziele in direkte Seitenlinks umwandeln (überleben so das Einfügen)"""
    for p in d:
        for l in p.get_links():
            if l.get('nameddest') and l.get('page', -1) >= 0 and l['kind'] != pymupdf.LINK_GOTO:
                nl = {'kind': pymupdf.LINK_GOTO, 'from': l['from'], 'page': l['page'], 'to': l.get('to') or pymupdf.Point(0, 0)}
                p.delete_link(l)
                p.insert_link(nl)
def _fix_ocgs(d):
    """Ebenen (OCGs) der eingefügten Seiten im Katalog bekannt machen"""
    cat = d.pdf_catalog()
    known = set(d.get_ocgs().keys())
    found = []
    for x in range(1, d.xref_length()):
        try:
            if d.xref_get_key(x, 'Type') == ('name', '/OCG') and x not in known:
                found.append(x)
        except Exception:
            pass
    if not found:
        return
    allx = sorted(known) + found
    refs = ' '.join('%d 0 R' % x for x in allx)
    on = [x for x in allx if d.get_ocgs().get(x, {}).get('on', True)] if known else allx
    d.xref_set_key(cat, 'OCProperties', '<</OCGs[%s]/D<</ON[%s]/OFF[]/Order[%s]>>>>' % (refs, ' '.join('%d 0 R' % x for x in on), refs))
def _attachments(src, dst):
    have = set(dst.embfile_names())
    for n in src.embfile_names():
        if n in have:
            continue
        info = src.embfile_info(n)
        dst.embfile_add(n, src.embfile_get(n), filename=info.get('filename') or n, desc=info.get('desc') or '')
        have.add(n)
def open_part(path, pages=None, password=''):
    d = pymupdf.open(path)
    if d.needs_pass:
        d.authenticate(password)
    if pages is not None and list(pages) != list(range(d.page_count)):
        d.select(list(pages))
    return d
def assemble(parts, toc_mode='keep', at=None, password=''):
    """parts: [{'path','pages'(oder None),'title'}]; at: Einfügestelle in den ersten Teil (insert-file)"""
    first = parts[0]
    out = open_part(first['path'], first.get('pages'), password)
    _attachments(open_part(first['path'], None, password), out)
    toc = out.get_toc(simple=False) if toc_mode in ('keep', 'insert') else [e[:3] for e in out.get_toc(simple=True)] if toc_mode == 'concat' else []
    if toc_mode == 'files':
        toc = [[1, first.get('title') or 'Teil 1', 1]] + [[e[0] + 1, e[1], e[2]] + e[3:] for e in out.get_toc(simple=False)]
    pos = out.page_count if at is None else at
    for k, part in enumerate(parts[1:], 2):
        src = open_part(part['path'], part.get('pages'), password)
        orig = open_part(part['path'], None, password)
        _named_to_goto(src)
        start = pos
        n = src.page_count
        out.insert_pdf(src, links=True, annots=True, widgets=True, start_at=pos if at is not None else -1)
        stoc = src.get_toc(simple=True)
        if toc_mode == 'files':
            toc.append([1, part.get('title') or 'Teil %d' % k, start + 1])
            toc += [[lv + 1, t, pg + start] for lv, t, pg in stoc]
        elif toc_mode == 'concat':
            toc += [[lv, t, pg + start] for lv, t, pg in stoc]
        elif toc_mode == 'insert':
            # Lesezeichen danach verschieben, eingefügte dazu
            toc = [[e[0], e[1], e[2] + n if e[2] > start else e[2]] + e[3:4] for e in toc]
            head = [e for e in toc if e[2] <= start]
            tail = [e for e in toc if e[2] > start]
            toc = head + [[lv, t, pg + start] for lv, t, pg in stoc] + tail
        _attachments(orig, out)
        pos += n
    _fix_ocgs(out)
    try:
        out.set_toc([e[:3] for e in toc] if toc_mode != 'keep' else toc)
    except Exception:
        pass
    return out
