"""Command line: `python -m vsc_smith_pyfmt [--check] [FILE]` formats FILE (or stdin) to stdout."""

import argparse
import sys

from . import FormatError, Unsupported, format_source

EXIT_ERROR = 123


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="vsc_smith_pyfmt", description=__doc__)
    parser.add_argument("file", nargs="?", default="-", help="file to format; '-' or omitted reads stdin")
    parser.add_argument("--check", action="store_true", help="print nothing; exit 1 if the file would change")
    args = parser.parse_args(argv)

    data = sys.stdin.buffer.read() if args.file == "-" else open(args.file, "rb").read()
    try:
        source = data.decode("utf-8")
        result = format_source(source)
    except UnicodeDecodeError as e:
        print(f"error: not valid UTF-8: {e}", file=sys.stderr)
        return EXIT_ERROR
    except SyntaxError as e:
        print(f"error: cannot parse: {e.msg} (line {e.lineno})", file=sys.stderr)
        return EXIT_ERROR
    except (Unsupported, FormatError) as e:
        print(f"error: left unchanged: {e}", file=sys.stderr)
        return EXIT_ERROR

    if args.check:
        return 0 if result == source else 1
    sys.stdout.buffer.write(result.encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
