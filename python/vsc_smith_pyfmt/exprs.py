"""Turn AST nodes back into one-line source text, keeping literals as written."""

import ast
import copy
import re
import tokenize

from .split import lex
from .strings import normalize_literal

_PLACEHOLDER = re.compile(r"__vsc(\d+)__")


class _Replacer(ast.NodeTransformer):
    """Swaps literals for placeholder names, because `ast.unparse` would rewrite them (`0xFF` -> `255`, `'a'`)."""

    def __init__(self, source: str):
        self.source = source
        self.saved: list[str] = []

    def _stash(self, node: ast.AST, text: str) -> ast.AST:
        name = f"__vsc{len(self.saved)}__"
        self.saved.append(text)
        return ast.copy_location(ast.Name(id=name, ctx=ast.Load()), node)

    def visit_Constant(self, node: ast.Constant) -> ast.AST:
        value = node.value
        if isinstance(value, bool) or value is None or value is Ellipsis:
            return node
        segment = ast.get_source_segment(self.source, node)
        if segment is None:
            return node
        if isinstance(value, (str, bytes)):
            segment = normalize_literal(segment)
        return self._stash(node, segment)

    def visit_JoinedStr(self, node: ast.JoinedStr) -> ast.AST:
        segment = ast.get_source_segment(self.source, node)
        if segment is None:
            return node
        return self._stash(node, normalize_literal(segment))

    def visit_Attribute(self, node: ast.Attribute) -> ast.AST:
        # `1 .real` needs the space `ast.unparse` adds, which a placeholder name would lose.
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, int):
            return node
        return self.generic_visit(node)


def unparse(node: ast.AST, source: str) -> str:
    """One-line text of `node` (modified in place), with string and number literals as in `source`."""
    replacer = _Replacer(source)
    text = ast.unparse(replacer.visit(node))
    return _PLACEHOLDER.sub(lambda m: replacer.saved[int(m.group(1))], text)


def _space_annotated_defaults(text: str) -> str:
    """`def f(a: int=1)` -> `def f(a: int = 1)`: `ast.unparse` drops the spaces around such defaults."""
    toks = lex(text)
    if not toks:
        return text
    cuts: list[int] = []
    depth = 0
    annotated = False
    for t in toks:
        if t.type != tokenize.OP:
            continue
        if t.string in "([{":
            depth += 1
        elif t.string in ")]}":
            depth -= 1
        elif depth == 1 and t.string == ",":
            annotated = False
        elif depth == 1 and t.string == ":":
            annotated = True
        elif depth == 1 and t.string == "=" and annotated:
            cuts.append(t.start)
    for pos in reversed(cuts):
        text = text[:pos] + " = " + text[pos + 1 :]
    return text


def header(node: ast.AST, source: str) -> str:
    """The first line of a compound statement or clause (`if x:`, `except E as e:`), without its body."""
    clone = copy.copy(node)
    for field in ("body", "orelse", "finalbody", "handlers", "cases"):
        if hasattr(clone, field):
            setattr(clone, field, [] if field != "body" else [ast.Pass()])
    if hasattr(clone, "decorator_list"):
        clone.decorator_list = []
    text = unparse(clone, source).split("\n")[0]
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        text = _space_annotated_defaults(text)
    return text
