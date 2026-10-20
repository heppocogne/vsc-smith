"""A small Black-style Python formatter built on `ast` and `tokenize`."""

import ast
import inspect
import tokenize
from typing import Optional

from .formatter import Formatter, Unsupported
from .ranges import format_lines

__all__ = ["format_source", "FormatError", "Unsupported"]


class FormatError(Exception):
    """Formatting would have changed the meaning of the code, so no output is produced."""


def _normalized_dump(tree: ast.AST) -> str:
    # Docstrings are re-indented and stripped, which changes their value but not their meaning.
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            first = node.body[0] if node.body else None
            if (
                isinstance(first, ast.Expr)
                and isinstance(first.value, ast.Constant)
                and isinstance(first.value.value, str)
            ):
                lines = inspect.cleandoc(first.value.value).splitlines()
                first.value.value = "\n".join(line.rstrip() for line in lines).rstrip()
    return ast.dump(tree)


def format_source(source: str, lines: Optional[list[tuple[int, int]]] = None) -> str:
    """Return `source` formatted. Raises `SyntaxError`, `Unsupported` or `FormatError` instead of guessing.

    With `lines` (1-based, inclusive ranges), only the statements that touch those lines are formatted.
    """
    bom = "﻿" if source.startswith("﻿") else ""
    newline = "\r\n" if "\r\n" in source else "\n"
    text = source[len(bom) :].replace("\r\n", "\n")
    if not text.strip():
        return ""
    tree = ast.parse(text)  # raises SyntaxError first, so tokenize errors below are never about invalid code
    try:
        result = format_lines(text, tree, lines) if lines else Formatter(text).run(tree)
    except tokenize.TokenError as e:
        raise Unsupported(f"cannot tokenize: {e}") from e
    if _normalized_dump(ast.parse(result)) != _normalized_dump(ast.parse(text)):
        raise FormatError("the formatted code is not equivalent to the original")
    return bom + result.replace("\n", newline)
