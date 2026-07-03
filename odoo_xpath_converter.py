#!/usr/bin/env python3
"""
odoo_xpath_converter.py

Reads an Odoo Studio xpath-document and rewrites positional XPath expressions
to named predicates ([@name='...']) where possible, making them order-independent.

The script simulates Odoo's sequential xpath application:
each xpath is evaluated against the *live* tree (after all previous mutations),
the expr is rewritten to a named form, and then the mutation is applied before
processing the next xpath.

Usage (local base view):
    python odoo_xpath_converter.py \\
        --base-view res_partner_base.xml \\
        --input xpaths_input.xml \\
        --output xpaths_output.xml [--verbose]

Usage (fetch from Odoo):
    python odoo_xpath_converter.py \\
        --odoo-url https://myodoo.com \\
        --odoo-db mydb \\
        --odoo-user admin@example.com \\
        --odoo-password secret \\
        --model res.partner \\
        --input xpaths_input.xml \\
        --output xpaths_output.xml
"""

import argparse
import copy
import sys
from lxml import etree


# ── XML helpers ───────────────────────────────────────────────────────────────

def load_xml_file(path):
    parser = etree.XMLParser(remove_blank_text=False, remove_comments=False)
    return etree.parse(path, parser).getroot()


def load_xml_string(text):
    parser = etree.XMLParser(remove_blank_text=False, remove_comments=False)
    return etree.fromstring(text.encode() if isinstance(text, str) else text, parser)


# ── Odoo fetch ────────────────────────────────────────────────────────────────

def fetch_base_view(url, db, user, password, model, view_type='form'):
    """Fetch the root (non-inherited) view arch from Odoo via XML-RPC."""
    import xmlrpc.client
    common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
    uid = common.authenticate(db, user, password, {})
    if not uid:
        raise RuntimeError('Odoo authentication failed')
    obj = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
    domain = [['model', '=', model], ['type', '=', view_type], ['inherit_id', '=', False]]
    ids = obj.execute_kw(db, uid, password, 'ir.ui.view', 'search', [domain])
    if not ids:
        raise RuntimeError(f'No root {view_type} view found for model {model}')
    recs = obj.execute_kw(db, uid, password, 'ir.ui.view', 'read',
                          [ids[:1]], {'fields': ['arch_base']})
    return recs[0]['arch_base']


# ── XPath step builder ────────────────────────────────────────────────────────

def element_step(el):
    """
    Return (step_string, is_named) for a single XPath step.
    - is_named=True  → step uses [@name='...'], globally anchoring
    - is_named=False → step is positional or bare tag
    """
    tag = el.tag
    if not isinstance(tag, str):   # comment / PI
        return None, False
    name = el.get('name')
    if name:
        return f"{tag}[@name='{name}']", True
    parent = el.getparent()
    if parent is not None:
        same = [c for c in parent if c.tag == tag]
        if len(same) == 1:
            return tag, False
        return f"{tag}[{same.index(el) + 1}]", False
    return tag, False


def build_minimal_unique_xpath(element, tree_root):
    """
    Build the shortest XPath (anchored with //) that:
      1. Prefers [@name='...'] predicates
      2. Uniquely selects `element` in `tree_root`

    Strategy: walk root→target collecting steps; then try suffixes starting
    from each named element (rightmost first = closest to target). For each
    named anchor, extend leftward until the candidate is unique.
    """
    if not isinstance(element.tag, str):
        return None

    # Collect full root→target path
    ancestors: list[tuple[str, bool]] = []   # (step, is_named)
    cur = element
    while cur is not None and cur is not tree_root:
        step, is_named = element_step(cur)
        if step is not None:
            ancestors.insert(0, (step, is_named))
        cur = cur.getparent()

    if not ancestors:
        return None

    n = len(ancestors)
    named_positions = [i for i, (_, is_named) in enumerate(ancestors) if is_named]

    if not named_positions:
        # Fully positional — can't improve
        return '//' + '/'.join(s for s, _ in ancestors)

    # Try each named anchor (rightmost = index closest to n-1 = target)
    for start in reversed(named_positions):
        suffix_steps = [s for s, _ in ancestors[start:]]
        candidate = '//' + '/'.join(suffix_steps)
        try:
            results = tree_root.xpath(candidate)
        except etree.XPathEvalError:
            continue

        if len(results) == 1 and results[0] is element:
            return candidate

        # Not unique — extend leftward one step at a time
        for ext in range(start - 1, -1, -1):
            extended_steps = [s for s, _ in ancestors[ext:]]
            cand_ext = '//' + '/'.join(extended_steps)
            try:
                res_ext = tree_root.xpath(cand_ext)
                if len(res_ext) == 1 and res_ext[0] is element:
                    return cand_ext
            except etree.XPathEvalError:
                pass

    # Fallback: full path from root
    return '//' + '/'.join(s for s, _ in ancestors)


# ── Live-tree mutation ────────────────────────────────────────────────────────

def apply_xpath(tree_root, xpath_el):
    """
    Apply a single <xpath expr="..." position="..."> mutation to tree_root.
    Mirrors Odoo's own view inheritance logic.
    """
    expr = xpath_el.get('expr')
    position = xpath_el.get('position', 'inside')

    try:
        results = tree_root.xpath(expr)
    except etree.XPathEvalError as e:
        print(f"  [WARN] XPath eval error applying {expr!r}: {e}", file=sys.stderr)
        return

    if not results:
        print(f"  [WARN] No match when applying: {expr!r}", file=sys.stderr)
        return

    target = results[0]
    parent = target.getparent()

    if position == 'replace':
        if parent is None:
            return
        idx = list(parent).index(target)
        parent.remove(target)
        for i, child in enumerate(xpath_el):
            parent.insert(idx + i, copy.deepcopy(child))

    elif position == 'inside':
        for child in xpath_el:
            target.append(copy.deepcopy(child))

    elif position == 'after':
        if parent is None:
            return
        idx = list(parent).index(target)
        for i, child in enumerate(xpath_el):
            parent.insert(idx + 1 + i, copy.deepcopy(child))

    elif position == 'before':
        if parent is None:
            return
        idx = list(parent).index(target)
        for i, child in enumerate(xpath_el):
            parent.insert(idx + i, copy.deepcopy(child))

    elif position == 'attributes':
        for attr_el in xpath_el:
            if not isinstance(attr_el.tag, str):
                continue
            if attr_el.tag == 'attribute':
                aname = attr_el.get('name')
                val = attr_el.text
                if val:
                    target.set(aname, val)
                elif aname in target.attrib:
                    del target.attrib[aname]

    elif position == 'move':
        # Complex; log and skip
        print(f"  [INFO] 'move' not implemented: {expr!r}", file=sys.stderr)

    else:
        print(f"  [WARN] Unknown position {position!r} for {expr!r}", file=sys.stderr)


# ── Expression rewriter ───────────────────────────────────────────────────────

def rewrite_expr(expr, tree_root, verbose=False):
    """
    Evaluate expr against tree_root, build a named equivalent, verify it
    selects the same element, and return the best expression.
    """
    try:
        results = tree_root.xpath(expr)
    except etree.XPathEvalError as e:
        print(f"  [WARN] XPath eval error for {expr!r}: {e}", file=sys.stderr)
        return expr

    if not results or not isinstance(results[0], etree._Element):
        if verbose:
            print(f"  [SKIP] No element match: {expr!r}")
        return expr

    target = results[0]
    candidate = build_minimal_unique_xpath(target, tree_root)

    if candidate is None or candidate == expr:
        return expr

    # Verify candidate selects exactly the same element
    try:
        check = tree_root.xpath(candidate)
        if len(check) == 1 and check[0] is target:
            if verbose:
                if candidate != expr:
                    print(f"  ✓  {expr!r}")
                    print(f"     → {candidate!r}")
                else:
                    print(f"  =  {expr!r}  (unchanged)")
            return candidate
    except etree.XPathEvalError:
        pass

    if verbose:
        print(f"  ✗  Could not simplify: {expr!r}")
    return expr


# ── Main conversion ───────────────────────────────────────────────────────────

def convert_xpaths(base_root, xpath_doc_root, verbose=False):
    """
    Process all <xpath expr="..."> elements sequentially.
    For each: (1) rewrite expr on the *current* live tree,
              (2) apply the mutation so the next xpath sees the updated DOM.
    Returns the rewritten xpath document root.
    """
    live_tree = copy.deepcopy(base_root)
    output_doc = copy.deepcopy(xpath_doc_root)

    # Zip input and output node lists — same order guaranteed by deepcopy
    out_xpaths = output_doc.xpath('//xpath[@expr]')
    in_xpaths  = xpath_doc_root.xpath('//xpath[@expr]')

    changed = 0
    for i, (out_el, in_el) in enumerate(zip(out_xpaths, in_xpaths)):
        original_expr = in_el.get('expr')
        position      = in_el.get('position', 'inside')

        if verbose:
            print(f"\n[{i+1}/{len(in_xpaths)}] position={position!r}")

        new_expr = rewrite_expr(original_expr, live_tree, verbose=verbose)
        if new_expr != original_expr:
            out_el.set('expr', new_expr)
            changed += 1

        # Apply mutation using the original (proven-working) expr
        apply_xpath(live_tree, in_el)

    print(f"\nDone — {changed}/{len(in_xpaths)} expressions rewritten.")
    return output_doc


# ── Verification ──────────────────────────────────────────────────────────────

def verify_output(base_root, original_doc, rewritten_doc, verbose=False):
    """
    Apply both documents to separate copies of the base view and compare
    the resulting DOM. Returns True if identical.
    """
    def apply_all(doc, root):
        for xpath_el in doc.xpath('//xpath[@expr]'):
            apply_xpath(root, xpath_el)

    tree_orig = copy.deepcopy(base_root)
    tree_new  = copy.deepcopy(base_root)

    apply_all(original_doc,  tree_orig)
    apply_all(rewritten_doc, tree_new)

    orig_str = etree.tostring(tree_orig, encoding='unicode')
    new_str  = etree.tostring(tree_new,  encoding='unicode')

    if orig_str == new_str:
        print("✅  Verification PASSED — output DOM is identical to input DOM.")
        return True
    else:
        print("❌  Verification FAILED — DOM mismatch!", file=sys.stderr)
        if verbose:
            import difflib
            diff = difflib.unified_diff(
                orig_str.splitlines(), new_str.splitlines(),
                fromfile='original', tofile='rewritten', lineterm=''
            )
            print('\n'.join(list(diff)[:60]), file=sys.stderr)
        return False


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument('--base-view', metavar='FILE',
                     help='Local XML file with the base view <form> arch')
    src.add_argument('--odoo-url', metavar='URL',
                     help='Odoo server URL to fetch base view from')

    p.add_argument('--odoo-db',       metavar='DB')
    p.add_argument('--odoo-user',     metavar='USER')
    p.add_argument('--odoo-password', metavar='PASS')
    p.add_argument('--model',         default='res.partner',
                   help='Odoo model (default: res.partner)')
    p.add_argument('--view-type',     default='form')

    p.add_argument('--input',   required=True, metavar='FILE',
                   help='Input xpath document to convert')
    p.add_argument('--output',  required=True, metavar='FILE',
                   help='Output path for rewritten xpath document')
    p.add_argument('--no-verify', action='store_true',
                   help='Skip DOM verification step')
    p.add_argument('--verbose', '-v', action='store_true')

    args = p.parse_args()

    # Load base view
    if args.base_view:
        print(f"Loading base view from {args.base_view} …")
        base_root = load_xml_file(args.base_view)
    else:
        print(f"Fetching base view for {args.model} from {args.odoo_url} …")
        arch = fetch_base_view(
            args.odoo_url, args.odoo_db, args.odoo_user,
            args.odoo_password, args.model, args.view_type
        )
        base_root = load_xml_string(arch)

    # Load input xpath doc
    print(f"Loading input xpaths from {args.input} …")
    xpath_doc = load_xml_file(args.input)

    # Convert
    print("Converting …")
    result = convert_xpaths(base_root, xpath_doc, verbose=args.verbose)

    # Verify
    if not args.no_verify:
        verify_output(base_root, xpath_doc, result, verbose=args.verbose)

    # Write output
    output_text = etree.tostring(result, pretty_print=True, encoding='unicode',
                                 xml_declaration=False)
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(output_text)
    print(f"Written → {args.output}")


if __name__ == '__main__':
    main()
