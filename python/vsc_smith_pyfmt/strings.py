"""String literal normalization (Black-style double quotes) built on `tokenize`."""

import io
import tokenize

_FSTRING_START = getattr(tokenize, "FSTRING_START", None)
_FSTRING_END = getattr(tokenize, "FSTRING_END", None)


def normalize_string(text: str) -> str:
    """Prefer double quotes for a single string token, unless that needs more escaping."""
    i = 0
    while i < len(text) and text[i] not in "'\"":
        i += 1
    prefix, rest = text[:i], text[i:]
    if rest.startswith("'''") or rest.startswith('"""') or not rest.startswith("'"):
        return text
    body = rest[1:-1]
    if "r" not in prefix.lower():
        body = body.replace("\\'", "'")
    elif "\\'" in body:
        return text
    if '"' in body:
        return text
    return f'{prefix}"{body}"'


def _offsets(text: str) -> list[int]:
    result, pos = [0], 0
    for line in text.splitlines(keepends=True):
        pos += len(line)
        result.append(pos)
    return result


def normalize_literal(segment: str) -> str:
    """Normalize every string token of a (possibly implicitly concatenated) string literal.

    Tokens are joined by one space, so line breaks between concatenated parts disappear.
    Anything that is not made only of string tokens is returned unchanged.
    """
    wrapped = "(" + segment + ")"
    starts = _offsets(wrapped)

    def pos(p: tuple[int, int]) -> int:
        return starts[p[0] - 1] + p[1]

    parts: list[str] = []
    depth = 0
    begin = 0
    try:
        for tok in tokenize.generate_tokens(io.StringIO(wrapped).readline):
            if _FSTRING_START is not None and tok.type == _FSTRING_START:
                if depth == 0:
                    begin = pos(tok.start)
                depth += 1
            elif _FSTRING_END is not None and tok.type == _FSTRING_END:
                depth -= 1
                if depth == 0:
                    parts.append(normalize_string(wrapped[begin : pos(tok.end)]))
            elif depth:
                continue
            elif tok.type == tokenize.STRING:
                parts.append(normalize_string(tok.string))
            elif tok.type in (
                tokenize.OP,
                tokenize.NL,
                tokenize.NEWLINE,
                tokenize.ENDMARKER,
                tokenize.COMMENT,
            ):
                if tok.type == tokenize.COMMENT:
                    return segment
            else:
                return segment
    except (tokenize.TokenError, SyntaxError):
        return segment
    return " ".join(parts) if parts else segment
