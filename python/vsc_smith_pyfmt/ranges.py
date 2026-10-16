"""Format only the statements that touch given line ranges, leaving every other line as it is.

The unit is one simple statement or one clause header (`if x:`, `def f(...):`). Blank lines, comments on their
own lines, decorators, docstrings and anything that is not alone on its lines are never touched.
"""

import ast
from typing import Optional

from .exprs import header, unparse
from .formatter import _COMPOUND, _MATCH, Formatter, comment_text
from .split import INDENT, MAX_WIDTH, render

LineRange = tuple[int, int]
_Edit = tuple[int, int, list[str]]


class _RangeFormatter:
    def __init__(self, text: str, ranges: list[LineRange]):
        self.fmt = Formatter(text)
        self.src = self.fmt.src
        self.ranges = ranges
        self.edits: list[_Edit] = []

    def selected(self, first: int, last: int) -> bool:
        return any(lo <= last and first <= hi for lo, hi in self.ranges)

    def layout(self, text: str, first: int, last: int, start_col: int, end_col: int) -> Optional[list[str]]:
        """The lines that replace lines first..last, or `None` when that is not safe."""
        lines = self.src.lines
        prefix = lines[first - 1][:start_col]
        if prefix.strip() or "\n" in text:
            return None
        rest = lines[last - 1][end_col:].strip()
        if rest and not rest.startswith("#"):
            return None
        if self.src.has_comments(first, last - 1):
            return None
        indent = len(prefix.expandtabs(INDENT))
        result = [prefix + line[indent:] for line in render(text, indent, MAX_WIDTH)]
        comment = self.src.trail.get(last)
        if comment is not None:
            result[-1] += "  " + comment_text(comment)
        return result

    def add(self, first: int, last: int, new: Optional[list[str]]) -> None:
        if new is not None and new != self.src.lines[first - 1 : last]:
            self.edits.append((first, last, new))

    def clause(self, text: str, pos: tuple[int, int], body_first_line: int) -> None:
        colon = self.src.colon_after(pos)
        if body_first_line <= colon[0] or not self.selected(pos[0], colon[0]):
            return
        self.add(pos[0], colon[0], self.layout(text, pos[0], colon[0], pos[1], colon[1]))

    def walk(self, stmts: list[ast.stmt]) -> None:
        for st in stmts:
            if isinstance(st, _MATCH):
                self.match(st)
                continue
            if isinstance(st, _COMPOUND):
                for text, pos, body, _ in self.fmt.sections(st):
                    self.clause(text, pos, body[0].lineno)
                    self.walk(body)
                continue
            self.simple(st)

    def simple(self, st: ast.stmt) -> None:
        last = st.end_lineno or st.lineno
        if isinstance(st, ast.Expr) and isinstance(st.value, ast.Constant) and isinstance(st.value.value, str):
            return  # docstrings and string statements
        if not self.selected(st.lineno, last):
            return
        start, end = self.src.start_pos(st), self.src.end_pos(st)
        text = unparse(st, self.src.text)
        self.add(st.lineno, last, self.layout(text, st.lineno, last, start[1], end[1]))

    def match(self, st: "ast.Match") -> None:
        colon = self.src.colon_after(self.src.start_pos(st))
        if st.cases and st.cases[0].body[0].lineno > colon[0]:
            subject = "match " + unparse(st.subject, self.src.text) + ":"
            if self.selected(st.lineno, colon[0]):
                self.add(
                    st.lineno,
                    colon[0],
                    self.layout(subject, st.lineno, colon[0], self.src.start_pos(st)[1], colon[1]),
                )
        prev_pos = colon
        for case in st.cases:
            tok = self.src.first_sig_after(prev_pos)
            if tok is not None:
                self.clause(header(case, self.src.text), tok.start, case.body[0].lineno)  # type: ignore[arg-type]
            self.walk(case.body)
            prev_pos = self.src.end_pos(case.body[-1])

    def apply(self) -> str:
        lines = list(self.src.lines)
        for first, last, new in sorted(self.edits, reverse=True):
            lines[first - 1 : last] = new
        return "\n".join(lines)


def format_lines(text: str, tree: ast.Module, ranges: list[LineRange]) -> str:
    """`text` with the statements that touch the 1-based, inclusive line `ranges` formatted."""
    formatter = _RangeFormatter(text, ranges)
    formatter.walk(tree.body)
    return formatter.apply()
