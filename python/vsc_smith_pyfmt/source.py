"""Source text index: significant tokens, comments, and conversions of AST positions."""

import ast
import io
import tokenize
from bisect import bisect_left
from typing import Optional

Pos = tuple[int, int]

_TRIVIA = {
    tokenize.COMMENT,
    tokenize.NL,
    tokenize.NEWLINE,
    tokenize.INDENT,
    tokenize.DEDENT,
    tokenize.ENDMARKER,
}


class Source:
    def __init__(self, text: str):
        self.text = text
        self.lines = text.split("\n")
        self.sig: list[tokenize.TokenInfo] = []
        self.own: dict[int, tuple[int, str]] = {}  # line -> (column, comment) for comments on their own line
        self.trail: dict[int, str] = {}  # line -> comment that follows code
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type == tokenize.COMMENT:
                line, col = tok.start
                if self.lines[line - 1][:col].strip():
                    self.trail[line] = tok.string
                else:
                    self.own[line] = (col, tok.string)
            elif tok.type not in _TRIVIA:
                self.sig.append(tok)
        self.starts = [t.start for t in self.sig]

    def char_col(self, line: int, byte_col: int) -> int:
        """AST columns are UTF-8 byte offsets; convert one to a character index."""
        return len(self.lines[line - 1].encode("utf-8")[:byte_col].decode("utf-8", errors="ignore"))

    def start_pos(self, node: ast.AST) -> Pos:
        return node.lineno, self.char_col(node.lineno, node.col_offset)  # type: ignore[attr-defined]

    def end_pos(self, node: ast.AST) -> Pos:
        return node.end_lineno, self.char_col(node.end_lineno, node.end_col_offset)  # type: ignore[attr-defined]

    def first_sig_after(self, pos: Pos) -> Optional[tokenize.TokenInfo]:
        i = bisect_left(self.starts, pos)
        return self.sig[i] if i < len(self.sig) else None

    def colon_after(self, pos: Pos) -> Pos:
        """End position of the colon that closes the header starting at `pos`."""
        depth = 0
        lambdas = 0
        for tok in self.sig[bisect_left(self.starts, pos) :]:
            if tok.type == tokenize.OP:
                if tok.string in "([{":
                    depth += 1
                elif tok.string in ")]}":
                    depth -= 1
                elif tok.string == ":" and depth == 0:
                    if lambdas == 0:
                        return tok.end
                    lambdas -= 1
            elif tok.type == tokenize.NAME and tok.string == "lambda" and depth == 0:
                lambdas += 1
        raise ValueError(f"no colon after line {pos[0]}")

    def take_own(self, lo: int, hi: int, min_col: int = 0) -> list[tuple[int, str]]:
        """Remove and return the own-line comments on lines lo..hi, stopping at the first one left of `min_col`."""
        taken: list[tuple[int, str]] = []
        for line in sorted(k for k in self.own if lo <= k <= hi):
            col, text = self.own[line]
            if col < min_col:
                break
            taken.append((line, text))
            del self.own[line]
        return taken

    def has_comments(self, lo: int, hi: int) -> bool:
        return any(lo <= k <= hi for k in self.own) or any(lo <= k <= hi for k in self.trail)

    def drop_comments(self, lo: int, hi: int) -> None:
        for table in (self.own, self.trail):
            for k in [k for k in table if lo <= k <= hi]:
                del table[k]

    def blank_lines(self, after: int, before: int) -> int:
        """Number of empty lines strictly between the two line numbers."""
        return sum(1 for n in range(after + 1, before) if not self.lines[n - 1].strip())
