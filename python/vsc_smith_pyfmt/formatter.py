"""Statement-level layout: blank lines, comments, indentation and block structure."""

import ast
from typing import Optional

from .exprs import header, unparse
from .source import Pos, Source
from .split import INDENT, render
from .strings import normalize_literal

_DEFS = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
_IMPORTS = (ast.Import, ast.ImportFrom)
# `match` and `except*` exist only on newer Pythons; a tuple of no classes matches nothing.
_MATCH = (ast.Match,) if hasattr(ast, "Match") else ()
_COMPOUND = (
    ast.FunctionDef,
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.If,
    ast.For,
    ast.AsyncFor,
    ast.While,
    ast.With,
    ast.AsyncWith,
    ast.Try,
) + _MATCH + ((ast.TryStar,) if hasattr(ast, "TryStar") else ())

# (header text, position of the clause keyword, body statements, node that owns a docstring or None)
Section = tuple[str, Pos, list[ast.stmt], Optional[ast.AST]]


class Unsupported(Exception):
    """The source has a construct this formatter does not handle; it is left untouched."""


def comment_text(raw: str) -> str:
    raw = raw.rstrip()
    if len(raw) > 1 and raw[1] not in " !:#":
        return "# " + raw[1:]
    return raw


class Formatter:
    def __init__(self, text: str):
        self.src = Source(text)
        self.out: list[str] = []
        self.defs: list[int] = []  # levels of the def/class blocks still open
        self.pending = 0  # blank lines to put before the next emitted line
        self.limit = len(self.src.lines) + 2

    # -- output -------------------------------------------------------------------------------------------------

    def emit(self, lines: list[str]) -> None:
        if self.out:
            self.out.extend([""] * self.pending)
        self.pending = 0
        self.out.extend(lines)

    def run(self, tree: ast.Module) -> str:
        if tree.body:
            self.body(tree.body, 0, 0, self.limit, tree)
        else:
            prev_line = 0
            for line, text in self.src.take_own(1, self.limit):
                self.pending = min(self.src.blank_lines(prev_line, line), 2) if prev_line else 0
                self.emit([comment_text(text)])
                prev_line = line
        if self.src.own or self.src.trail:
            line = min(list(self.src.own) + list(self.src.trail))
            raise Unsupported(f"comment on line {line} could not be placed")
        return "\n".join(self.out) + "\n" if self.out else ""

    # -- blocks -------------------------------------------------------------------------------------------------

    def first_line(self, st: ast.stmt) -> int:
        decorators = getattr(st, "decorator_list", [])
        return min([st.lineno] + [d.lineno for d in decorators])

    def blank_count(
        self,
        prev_line: int,
        line: int,
        level: int,
        first: bool,
        is_def: bool,
        prev: Optional[ast.stmt],
        this: Optional[ast.stmt],
        after_doc: bool,
    ) -> int:
        if first:
            return 0
        cap = 2 if level == 0 else 1
        count = min(self.src.blank_lines(prev_line, line), cap)
        closed_def = False
        while self.defs and self.defs[-1] >= level:
            self.defs.pop()
            closed_def = True
        if closed_def or is_def:
            count = cap
        elif after_doc:
            count = 1
        if isinstance(prev, _IMPORTS) and not isinstance(this, _IMPORTS):
            count = max(count, 1)
        return count

    def body(self, stmts: list[ast.stmt], level: int, after_line: int, limit: int, owner: Optional[ast.AST]) -> None:
        while self.defs and self.defs[-1] >= level:
            self.defs.pop()
        pad = " " * (INDENT * level)
        prev_line = after_line
        prev: Optional[ast.stmt] = None
        after_doc = False
        body_col = self.src.start_pos(stmts[0])[1]
        for i, st in enumerate(stmts):
            start = self.first_line(st)
            is_doc = (
                i == 0
                and isinstance(owner, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                and isinstance(st, ast.Expr)
                and isinstance(st.value, ast.Constant)
                and isinstance(st.value.value, str)
            )
            is_def = isinstance(st, _DEFS)
            run_first = True  # the first line of the group of leading comments plus the statement
            for line, text in self.src.take_own(prev_line + 1, start - 1):
                self.pending = self.blank_count(
                    prev_line, line, level, i == 0 and run_first, is_def and run_first, prev, None, after_doc
                )
                self.emit([pad + comment_text(text)])
                prev_line, run_first, after_doc = line, False, False
            self.pending = self.blank_count(
                prev_line, start, level, i == 0 and run_first, is_def and run_first, prev, st, after_doc
            )
            next_limit = self.first_line(stmts[i + 1]) if i + 1 < len(stmts) else limit
            self.statement(st, level, next_limit, is_doc)
            after_doc = is_doc and isinstance(owner, (ast.Module, ast.ClassDef))
            prev_line, prev = st.end_lineno or st.lineno, st
        for line, text in self.src.take_own(prev_line + 1, limit - 1, body_col):
            self.pending = self.blank_count(prev_line, line, level, False, False, prev, None, after_doc)
            self.emit([pad + comment_text(text)])
            prev_line, after_doc = line, False

    def statement(self, st: ast.stmt, level: int, limit: int, is_doc: bool) -> None:
        if isinstance(st, _COMPOUND):
            self.compound(st, level, limit)
        else:
            self.simple(st, level, is_doc)

    # -- simple statements --------------------------------------------------------------------------------------

    def verbatim(self, first: Pos, last: Pos, level: int) -> list[str]:
        """The original text between two positions, indented for `level`; comments inside it stay in place."""
        lines = self.src.lines[first[0] - 1 : last[0]]
        if len(lines) == 1:
            lines = [lines[0][first[1] : last[1]]]
        else:
            lines = [lines[0][first[1] :]] + lines[1:-1] + [lines[-1][: last[1]]]
        self.src.drop_comments(first[0], last[0] - 1)
        return [" " * (INDENT * level) + lines[0]] + lines[1:]

    def docstring(self, st: ast.Expr, level: int) -> list[str]:
        pad = " " * (INDENT * level)
        segment = ast.get_source_segment(self.src.text, st.value) or ""
        lines = segment.split("\n")
        if len(lines) == 1:
            return [pad + normalize_literal(segment)]
        if any(line.endswith("\\") for line in lines[:-1]):
            return [pad + lines[0]] + lines[1:]  # a line continuation makes the next line's indentation part of the text
        indent = self.src.lines[st.lineno - 1][: self.src.start_pos(st)[1]]
        result = [pad + lines[0].rstrip()]
        for line in lines[1:]:
            rest = line[min(len(indent), len(line) - len(line.lstrip())) :]
            result.append((pad + rest).rstrip() if rest.strip() else "")
        return result

    def with_comment(self, lines: list[str], line: int) -> list[str]:
        comment = self.src.trail.pop(line, None)
        if comment is not None:
            lines[-1] += "  " + comment_text(comment)
        return lines

    def simple(self, st: ast.stmt, level: int, is_doc: bool) -> None:
        last = st.end_lineno or st.lineno
        if is_doc:
            lines = self.docstring(st, level)  # type: ignore[arg-type]
        else:
            interior = self.src.has_comments(st.lineno, last - 1)
            first, end = self.src.start_pos(st), self.src.end_pos(st)
            text = unparse(st, self.src.text)
            if interior or "\n" in text:
                lines = self.verbatim(first, end, level)
            else:
                lines = render(text, INDENT * level)
        self.emit(self.with_comment(lines, last))

    # -- compound statements ------------------------------------------------------------------------------------

    def is_stub(self, stmts: list[ast.stmt], colon_line: int) -> bool:
        """A body that is just `...`, with no comment around it, goes on the header line."""
        st = stmts[0]
        if not (len(stmts) == 1 and isinstance(st, ast.Expr) and isinstance(st.value, ast.Constant)):
            return False
        if st.value.value is not Ellipsis or st.lineno != st.end_lineno:
            return False
        if st.lineno == colon_line:
            return True
        return not self.src.has_comments(colon_line, st.lineno - 1)

    def clause_header(self, text: str, pos: Pos, level: int, body_line: int, stub: Optional[ast.stmt] = None) -> int:
        """Emit the header line(s) of a clause and return the line of its colon.

        With `stub`, the `...` body statement is written on the header's last line.
        """
        colon = self.src.colon_after(pos)
        if self.src.has_comments(pos[0], colon[0] - 1) or "\n" in text:
            lines = self.verbatim(pos, colon, level)
        else:
            lines = render(text + (" ..." if stub else ""), INDENT * level)
        if stub is not None:
            if "\n" in text or len(lines) > 1 and lines[-1].endswith(":"):
                lines[-1] += " ..."
            lines = self.with_comment(lines, stub.end_lineno or colon[0])
        elif body_line > colon[0]:
            lines = self.with_comment(lines, colon[0])
        self.emit(lines)
        return colon[0]

    def flush_comments(self, lo: int, hi: int, level: int) -> None:
        for _, text in self.src.take_own(lo + 1, hi - 1):
            self.emit([" " * (INDENT * level) + comment_text(text)])

    def run_sections(self, sections: list[Section], level: int, limit: int) -> None:
        prev_end = 0
        for i, (text, pos, stmts, owner) in enumerate(sections):
            if i:
                self.flush_comments(prev_end, pos[0], level)
            next_limit = sections[i + 1][1][0] if i + 1 < len(sections) else limit
            if owner is not None and isinstance(owner, _DEFS) and self.is_stub(stmts, self.src.colon_after(pos)[0]):
                self.clause_header(text, pos, level, stmts[0].lineno, stmts[0])
            else:
                colon_line = self.clause_header(text, pos, level, stmts[0].lineno)
                self.body(stmts, level + 1, colon_line, next_limit, owner)
            prev_end = stmts[-1].end_lineno or stmts[-1].lineno

    def keyword_after(self, stmts: list[ast.stmt]):
        tok = self.src.first_sig_after(self.src.end_pos(stmts[-1]))
        if tok is None:
            raise Unsupported("missing keyword")
        return tok

    def decorators(self, st: ast.stmt, level: int) -> None:
        prev = 0
        for d in getattr(st, "decorator_list", []):
            self.flush_comments(prev, d.lineno, level)
            last = d.end_lineno or d.lineno
            text = "@" + unparse(d, self.src.text)
            first = (d.lineno, len(self.src.lines[d.lineno - 1]) - len(self.src.lines[d.lineno - 1].lstrip()))
            if self.src.has_comments(d.lineno, last - 1) or "\n" in text:
                lines = self.verbatim(first, self.src.end_pos(d), level)
            else:
                lines = render(text, INDENT * level)
            self.emit(self.with_comment(lines, last))
            prev = last
        if getattr(st, "decorator_list", None):
            self.flush_comments(prev, st.lineno, level)

    def compound(self, st: ast.stmt, level: int, limit: int) -> None:
        if isinstance(st, _DEFS):
            self.decorators(st, level)
            self.defs.append(level)
        if isinstance(st, _MATCH):
            self.match(st, level, limit)
            return
        self.run_sections(self.sections(st), level, limit)

    def sections(self, st: ast.stmt) -> list[Section]:
        text = self.src.text
        pos = self.src.start_pos(st)
        if isinstance(st, ast.If):
            result: list[Section] = [(header(st, text), pos, st.body, None)]
            node = st
            while node.orelse:
                tok = self.keyword_after(node.body)
                if tok.string == "elif":
                    node = node.orelse[0]  # type: ignore[assignment]
                    result.append(("elif" + header(node, text)[2:], tok.start, node.body, None))
                else:
                    result.append(("else:", tok.start, node.orelse, None))
                    break
            return result
        if isinstance(st, (ast.For, ast.AsyncFor, ast.While)):
            result = [(header(st, text), pos, st.body, None)]
            if st.orelse:
                result.append(("else:", self.keyword_after(st.body).start, st.orelse, None))
            return result
        if isinstance(st, ast.Try) or (hasattr(ast, "TryStar") and isinstance(st, ast.TryStar)):
            result = [("try:", pos, st.body, None)]
            last = st.body
            for handler in st.handlers:
                h = header(handler, text)
                if not isinstance(st, ast.Try):
                    h = "except*" + h[len("except") :]
                result.append((h, self.src.start_pos(handler), handler.body, None))
                last = handler.body
            if st.orelse:
                result.append(("else:", self.keyword_after(last).start, st.orelse, None))
                last = st.orelse
            if st.finalbody:
                result.append(("finally:", self.keyword_after(last).start, st.finalbody, None))
            return result
        owner = st if isinstance(st, _DEFS) else None
        return [(header(st, text), pos, st.body, owner)]  # type: ignore[attr-defined]

    def match(self, st: "ast.Match", level: int, limit: int) -> None:
        colon = self.src.colon_after(self.src.start_pos(st))
        subject = "match " + unparse(st.subject, self.src.text) + ":"
        lines = render(subject, INDENT * level)
        self.emit(self.with_comment(lines, colon[0]))
        prev_pos, prev_line = colon, colon[0]
        for case in st.cases:
            tok = self.src.first_sig_after(prev_pos)
            if tok is None:
                raise Unsupported("missing case")
            self.flush_comments(prev_line, tok.start[0], level + 1)
            clone_text = header(case, self.src.text)  # type: ignore[arg-type]
            colon_line = self.clause_header(clone_text, tok.start, level + 1, case.body[0].lineno)
            self.body(case.body, level + 2, colon_line, limit, None)
            prev_pos, prev_line = self.src.end_pos(case.body[-1]), case.body[-1].end_lineno or 0
