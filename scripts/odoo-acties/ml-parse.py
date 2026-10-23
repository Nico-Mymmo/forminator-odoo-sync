# Een kleine JSON-lezer: in een rekenveld is de module json niet beschikbaar, en
# geneste functies mogen er niet (Odoo weigert closures). Leest enkel de vorm die
# hier bestaat: een lijst van objecten met tekstwaarden. Een andere waarde wordt None.
def ml_parse(s):
    s = s or ''
    n = len(s)
    i = 0
    res = []
    obj = None
    key = None
    while i < n:
        c = s[i]
        if c == '{':
            obj = {}
            key = None
            i += 1
            continue
        if c == '}':
            if obj is not None:
                res.append(obj)
            obj = None
            key = None
            i += 1
            continue
        if c == '"':
            out = []
            i += 1
            while i < n and s[i] != '"':
                if s[i] == chr(92) and i + 1 < n:
                    e = s[i + 1]
                    if e == 'u' and i + 5 < n:
                        hx = s[i + 2:i + 6]
                        hexok = len(hx) == 4
                        for ch in hx:
                            if ch not in '0123456789abcdefABCDEF':
                                hexok = False
                        if hexok:
                            out.append(chr(int(hx, 16)))
                        i += 6
                        continue
                    out.append({'n': ' ', 't': ' ', 'r': '', 'b': '', 'f': ''}.get(e, e))
                    i += 2
                    continue
                out.append(s[i])
                i += 1
            i += 1
            txt = ''.join(out)
            if obj is not None:
                if key is None:
                    key = txt
                else:
                    obj[key] = txt
                    key = None
            continue
        if obj is not None and key is not None and c not in (' ', chr(9), chr(10), chr(13), ':', ',', '[', ']'):
            while i < n and s[i] not in ',}]':
                i += 1
            obj[key] = None
            key = None
            continue
        i += 1
    return res
