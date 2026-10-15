"""Black-style splitting of one logical line (without indentation) that is too long."""

import io
import keyword
import tokenize
import unicodedata
from typing import NamedTuple, Optional

INDENT = 4
MAX_WIDTH = 88

OPEN = "([{"
CLOSE = ")]}"
_KEYWORDS = set(keyword.kwlist) - {"True", "False", "None"}
_FSTRING_START = getattr(tokenize, "FSTRING_START", None)
_FSTRING_END = getattr(tokenize, "FSTRING_END", None)
_SKIP = {
    tokenize.NEWLINE,
    tokenize.NL,
    tokenize.ENDMARKER,
    tokenize.COMMENT,
    tokenize.INDENT,
    tokenize.DEDENT,
}

# Delimiter priorities, as in Black: the highest one present is the one the line is split at.
COMPREHENSION = 20
COMMA = 18
TERNARY = 16
LOGIC = 14
STRING = 12
COMPARATOR = 10
_MATH = {
    "|": 9,
    "^": 8,
    "&": 7,
    "<<": 6,
    ">>": 6,
    "+": 5,
    "-": 5,
    "*": 4,
    "/": 4,
    "//": 4,
    "%": 4,
    "@": 4,
    "**": 3,
}
_COMPARE_OPS = {"==", "!=", "<", ">", "<=", ">="}
_ASSIGN_OPS = {"=", "+=", "-=", "*=", "/=", "//=", "%=", "@=", "&=", "|=", "^=", ">>=", "<<=", "**="}


class Tok(NamedTuple):
    type: int
    string: str
    start: int
    end: int


def text_width(text: str) -> int:
    """Display width, counting East Asian wide characters as two columns."""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in text)


def lex(text: str) -> Optional[list[Tok]]:
    """Tokens of a single-line `text`; an f-string becomes one STRING token. `None` if it cannot be tokenized."""
    toks: list[Tok] = []
    depth = 0
    begin = 0
    try:
        for t in tokenize.generate_tokens(io.StringIO(text).readline):
            if t.type in _SKIP:
                continue
            if _FSTRING_START is not None and t.type == _FSTRING_START:
                if depth == 0:
                    begin = t.start[1]
                depth += 1
            elif _FSTRING_END is not None and t.type == _FSTRING_END:
                depth -= 1
                if depth == 0:
                    toks.append(Tok(tokenize.STRING, text[begin : t.end[1]], begin, t.end[1]))
            elif depth == 0:
                toks.append(Tok(t.type, t.string, t.start[1], t.end[1]))
    except (tokenize.TokenError, SyntaxError):
        return None
    return toks


def _is_open(t: Tok) -> bool:
    return t.type == tokenize.OP and t.string in OPEN


def _is_close(t: Tok) -> bool:
    return t.type == tokenize.OP and t.string in CLOSE


def top_pairs(toks: list[Tok]) -> list[tuple[int, int]]:
    """Index pairs of the outermost brackets whose contents are not empty."""
    stack: list[int] = []
    pairs: list[tuple[int, int]] = []
    for i, t in enumerate(toks):
        if _is_open(t):
            stack.append(i)
        elif _is_close(t) and stack:
            o = stack.pop()
            if not stack and i > o + 1:
                pairs.append((o, i))
    return pairs


def _is_operand_end(t: Tok) -> bool:
    if t.type == tokenize.NAME:
        return t.string not in _KEYWORDS
    return t.type in (tokenize.NUMBER, tokenize.STRING) or _is_close(t)


def delimiters(toks: list[Tok]) -> tuple[int, list[int]]:
    """Highest delimiter priority at bracket depth 0 and the token indexes where a new piece starts.

    A piece starts after a comma and at an operator, so commas stay at the end of a line and operators lead it.
    """
    found: list[tuple[int, int]] = []
    depth = 0
    has_for = any(t.type == tokenize.NAME and t.string == "for" for t in toks) and _depth0_has(toks, "for")
    skip = -1
    for i, t in enumerate(toks):
        if _is_open(t):
            depth += 1
        elif _is_close(t):
            depth -= 1
        if depth != 0 or i == skip or _is_open(t):
            continue
        prev = toks[i - 1] if i else None
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        if t.type == tokenize.NAME and t.string == "lambda":
            return 0, []
        if t.type == tokenize.OP and t.string == ",":
            found.append((COMMA, i + 1))
        elif t.type == tokenize.NAME:
            s = t.string
            if has_for and s in ("for", "if"):
                found.append((COMPREHENSION, i))
            elif has_for and s == "async" and nxt is not None and nxt.string == "for":
                found.append((COMPREHENSION, i))
                skip = i + 1
            elif not has_for and s in ("if", "else") and prev is not None:
                found.append((TERNARY, i))
            elif s in ("and", "or"):
                found.append((LOGIC, i))
            elif s == "not" and nxt is not None and nxt.string == "in":
                found.append((COMPARATOR, i))
                skip = i + 1
            elif s == "is":
                found.append((COMPARATOR, i))
                if nxt is not None and nxt.string == "not":
                    skip = i + 1
            elif s == "in" and prev is not None and not (prev.type == tokenize.NAME and prev.string == "not"):
                found.append((COMPARATOR, i))
        elif t.type == tokenize.STRING and nxt is not None and nxt.type == tokenize.STRING:
            found.append((STRING, i + 1))
        elif t.type == tokenize.OP and prev is not None and _is_operand_end(prev):
            if t.string in _COMPARE_OPS:
                found.append((COMPARATOR, i))
            elif t.string in _MATH:
                found.append((_MATH[t.string], i))
    if not found:
        return 0, []
    top = max(p for p, _ in found)
    return top, [i for p, i in found if p == top]


def _depth0_has(toks: list[Tok], name: str) -> bool:
    depth = 0
    for t in toks:
        if _is_open(t):
            depth += 1
        elif _is_close(t):
            depth -= 1
        elif depth == 0 and t.type == tokenize.NAME and t.string == name:
            return True
    return False


def find_wrap(toks: list[Tok]) -> Optional[tuple[int, int]]:
    """Token range of the part Black may wrap in invisible parentheses (`return X`, `if X:`, `target = X`)."""
    if not toks:
        return None
    first = toks[0]
    lo = hi = -1
    if first.type == tokenize.NAME and first.string in ("return", "if", "elif", "while"):
        lo, hi = 1, len(toks)
        if first.string != "return":
            if toks[-1].string != ":":
                return None
            hi -= 1
    else:
        depth = 0
        for i, t in enumerate(toks):
            if _is_open(t):
                depth += 1
            elif _is_close(t):
                depth -= 1
            elif depth == 0 and t.type == tokenize.OP and t.string in _ASSIGN_OPS:
                lo, hi = i + 1, len(toks)
    if lo < 0 or lo >= hi:
        return None
    pairs = top_pairs(toks[lo:hi])
    if pairs and pairs[0] == (0, hi - lo - 1):
        return None
    return lo, hi


def _is_atom_bracket(toks: list[Tok], o: int) -> bool:
    """True when the bracket at `o` starts a literal or parenthesized expression, not a call or subscript."""
    if o == 0:
        return True
    prev = toks[o - 1]
    return not _is_operand_end(prev)


def _pieces(text: str, toks: list[Tok], cuts: list[int]) -> list[str]:
    bounds = [0] + [toks[i].start for i in cuts if i < len(toks)] + [len(text)]
    pieces = [text[a:b].strip() for a, b in zip(bounds, bounds[1:])]
    return [p for p in pieces if p]


def _body_lines(body: str, indent: int, width: int, force: bool) -> list[str]:
    pad = " " * (indent + INDENT)
    if not force and indent + INDENT + text_width(body) <= width:
        return [pad + body]
    toks = lex(body)
    if not toks:
        return [pad + body]
    prio, cuts = delimiters(toks)
    if not cuts:
        return render(body, indent + INDENT, width, False)
    pieces = _pieces(body, toks, cuts)
    if prio == COMMA and not pieces[-1].endswith(","):
        pieces[-1] += ","
    lines: list[str] = []
    for piece in pieces:
        lines.extend(render(piece, indent + INDENT, width, False))
    return lines


def _split_rhs(text: str, toks: list[Tok], indent: int, width: int, strict: bool) -> Optional[list[str]]:
    pairs = top_pairs(toks)
    if not pairs:
        return None
    pad = " " * indent
    is_def = toks[0].string in ("def", "class") or (toks[0].string == "async" and toks[1].string == "def")
    order = pairs[:1] if is_def else list(reversed(pairs))
    chosen = None
    for o, c in order:
        if indent + text_width(text[: toks[o].end]) <= width:
            chosen = (o, c)
            break
    if chosen is None:
        if strict:
            return None
        chosen = pairs[0]
    o, c = chosen
    head = text[: toks[o].end]
    body = text[toks[o].end : toks[c].start].strip()
    tail = text[toks[c].start :]
    body_toks = lex(body)
    force = False
    if body_toks and _is_atom_bracket(toks, o):
        force = delimiters(body_toks)[0] == COMMA
    return [pad + head] + _body_lines(body, indent, width, force) + [pad + tail]


def _split_wrap(text: str, toks: list[Tok], indent: int, width: int, lo: int, hi: int) -> Optional[list[str]]:
    pad = " " * indent
    expr = text[toks[lo].start : toks[hi - 1].end]
    pre = text[: toks[lo].start].rstrip()
    post = text[toks[hi - 1].end :]
    sub = toks[lo:hi]
    fits = indent + INDENT + text_width(expr) <= width
    if not fits and not delimiters(sub)[1] and not top_pairs(sub):
        return None
    return [pad + pre + " ("] + _body_lines(expr, indent, width, False) + [pad + ")" + post]


def _split_import(text: str, indent: int) -> Optional[list[str]]:
    head, sep, names = text.partition(" import ")
    if not sep or not head.startswith("from ") or names.startswith("(") or names.strip() == "*":
        return None
    pad = " " * indent
    items = [n.strip() for n in names.split(",") if n.strip()]
    return [pad + head + " import ("] + [pad + " " * INDENT + n + "," for n in items] + [pad + ")"]


def render(text: str, indent: int, width: int = MAX_WIDTH, statement: bool = True) -> list[str]:
    """Lay out `text` at `indent` columns, splitting it at brackets and delimiters when it does not fit.

    `statement` is false for a fragment of a statement, where `=` is a keyword argument and not an assignment.
    """
    pad = " " * indent
    if "\n" in text or indent + text_width(text) <= width:
        return [pad + text]
    imp = _split_import(text, indent) if statement else None
    if imp is not None:
        return imp
    toks = lex(text)
    if not toks:
        return [pad + text]
    wrap = find_wrap(toks) if statement else None
    prefer_wrap = False
    if wrap is not None:
        sub = toks[wrap[0] : wrap[1]]
        prefer_wrap = len(delimiters(sub)[1]) > 1 or not top_pairs(sub)
    attempts = []
    rhs_strict = lambda: _split_rhs(text, toks, indent, width, True)  # noqa: E731
    wrapped = (lambda: _split_wrap(text, toks, indent, width, *wrap)) if wrap else (lambda: None)  # noqa: E731
    attempts = [wrapped, rhs_strict] if prefer_wrap else [rhs_strict, wrapped]
    attempts.append(lambda: _split_rhs(text, toks, indent, width, False))
    for attempt in attempts:
        result = attempt()
        if result is not None:
            return result
    return [pad + text]
