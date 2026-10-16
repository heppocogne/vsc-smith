import os
import sys
import textwrap
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from vsc_smith_pyfmt import format_source  # noqa: E402


def fmt(source: str) -> str:
    return format_source(textwrap.dedent(source).lstrip("\n"))


class FormatTest(unittest.TestCase):
    def check(self, source: str, expected: str) -> None:
        result = fmt(source)
        self.assertEqual(result, textwrap.dedent(expected).lstrip("\n"))
        self.assertEqual(format_source(result), result, "formatting is not idempotent")

    def test_spacing_and_quotes(self):
        self.check(
            """
            x=1;y = {'a':1,
               'b':[1,2,3]}
            s = 'it\\'s'
            t = 'say "hi"'
            n = 0xFF + 1E5
            """,
            """
            x = 1
            y = {"a": 1, "b": [1, 2, 3]}
            s = "it's"
            t = 'say "hi"'
            n = 0xFF + 1E5
            """,
        )

    def test_blank_lines_around_definitions(self):
        self.check(
            """
            import os
            x = 1
            def f(): pass
            class A:
                y = 1
                def m(self): return 1
                def n(self): return 2
            z = 3
            """,
            """
            import os

            x = 1


            def f():
                pass


            class A:
                y = 1

                def m(self):
                    return 1

                def n(self):
                    return 2


            z = 3
            """,
        )

    def test_extra_blank_lines_are_limited(self):
        self.check(
            """
            a = 1



            b = 2
            if a:


                c = 3



                d = 4
            """,
            """
            a = 1


            b = 2
            if a:
                c = 3

                d = 4
            """,
        )

    def test_comments_are_kept(self):
        self.check(
            """
            # header
            import os  #noqa
            def f(a,  # first
                  b):
                # inside
                return a   # trailing
                # dangling
            # before else
            if os:
                pass
            # between
            else :   # note
                pass
            # end
            """,
            """
            # header
            import os  # noqa


            def f(a,  # first
                  b):
                # inside
                return a  # trailing
                # dangling


            # before else
            if os:
                pass
            # between
            else:  # note
                pass
            # end
            """,
        )

    def test_compound_statements(self):
        self.check(
            """
            try:
                pass
            except (A,B) as e:
                raise
            else :
                pass
            finally:
                pass
            for i in range(3): print(i)
            while x: x-=1
            with open('f') as f, open('g') as g: pass
            async def f():
                async with a as b: pass
                async for x in y: pass
            """,
            """
            try:
                pass
            except (A, B) as e:
                raise
            else:
                pass
            finally:
                pass
            for i in range(3):
                print(i)
            while x:
                x -= 1
            with open("f") as f, open("g") as g:
                pass


            async def f():
                async with a as b:
                    pass
                async for x in y:
                    pass
            """,
        )

    @unittest.skipIf(sys.version_info < (3, 10), "match statements need Python 3.10")
    def test_elif_chain_and_match(self):
        self.check(
            """
            if a: pass
            elif b: pass
            else: pass
            match command:
                case [x, y] if x: pass
                case {'k': v}: pass
                case _: pass
            """,
            """
            if a:
                pass
            elif b:
                pass
            else:
                pass
            match command:
                case [x, y] if x:
                    pass
                case {"k": v}:
                    pass
                case _:
                    pass
            """,
        )

    def test_docstring_is_reindented(self):
        self.check(
            '''
            def f():
                """Summary.

                    Detail.   
                """
                return 1
            ''',
            '''
            def f():
                """Summary.

                    Detail.
                """
                return 1
            ''',
        )

    def test_decorators_and_annotated_defaults(self):
        self.check(
            """
            @decorator( 1 )
            @other
            def f(a: int=1, *, b: str='x') -> None: ...
            """,
            """
            @decorator(1)
            @other
            def f(a: int = 1, *, b: str = "x") -> None: ...
            """,
        )

    def test_long_call_is_split_at_the_last_bracket(self):
        self.check(
            """
            result = some_module.some_function(argument_number_one, argument_number_two, argument_number_3)
            """,
            """
            result = some_module.some_function(
                argument_number_one, argument_number_two, argument_number_3
            )
            """,
        )

    def test_long_collection_is_exploded_with_trailing_comma(self):
        self.check(
            """
            x = [aaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccccccccccc, ddddddddd]
            """,
            """
            x = [
                aaaaaaaaaaaaaaaaaaaaaaa,
                bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
                ccccccccccccccccccccccccc,
                ddddddddd,
            ]
            """,
        )

    def test_long_boolean_condition_is_wrapped_in_parentheses(self):
        self.check(
            """
            if aaaaaaaaaaaaaaaaaaaaaaa and bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb and ccccccccccccccccccccccccccc and dddd:
                pass
            def f():
                return aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb + ccccccccccccc
            """,
            """
            if (
                aaaaaaaaaaaaaaaaaaaaaaa
                and bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
                and ccccccccccccccccccccccccccc
                and dddd
            ):
                pass


            def f():
                return (
                    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
                    + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
                    + ccccccccccccc
                )
            """,
        )

    def test_long_from_import(self):
        self.check(
            """
            from package.module import first_name_x, second_name_x, third_name_x, fourth_name_x, fifth_name_x
            """,
            """
            from package.module import (
                first_name_x,
                second_name_x,
                third_name_x,
                fourth_name_x,
                fifth_name_x,
            )
            """,
        )

    def test_keyword_arguments_are_not_wrapped_like_assignments(self):
        result = fmt(
            """
            parser.add_argument('-u', '--uuid', default='uuid4', help='The function to use to generate the uuid. By default uuid4 is used.')
            """
        )
        self.assertNotIn("help=(", result)

    def test_comment_inside_a_statement_is_kept_verbatim(self):
        self.check(
            """
            x = [  # why
                1, 2,
                # three
                3]
            """,
            """
            x = [  # why
                1, 2,
                # three
                3]
            """,
        )

    def test_wide_characters_count_as_two_columns(self):
        # 40 wide characters are 80 columns, so the 4 extra characters push the line over 88.
        text = "あ" * 40
        result = fmt(f"x = some_function('{text}', 1234)\n")
        self.assertIn("(\n", result)

    def test_empty_and_comment_only_sources(self):
        self.assertEqual(format_source(""), "")
        self.assertEqual(format_source("  \n\n"), "")
        self.assertEqual(format_source("#c\n\n\n\n#d\n"), "# c\n\n\n# d\n")

    def test_crlf_is_kept(self):
        self.assertEqual(format_source("x=1\r\ny=2\r\n"), "x = 1\r\ny = 2\r\n")

    def test_syntax_error_is_reported(self):
        with self.assertRaises(SyntaxError):
            format_source("def f(:\n")


class RangeTest(unittest.TestCase):
    SOURCE = textwrap.dedent(
        """\
        x=1
        def f(a,b):
            z=[1,2]
            if a and  b :
                return z
            w =  {'k':1}   # keep
            # own line
            q  =  3
        class  A:
            v=1
        """
    )

    def lines(self, *ranges):
        return format_source(self.SOURCE, list(ranges)).split("\n")

    def test_only_touched_statements_change(self):
        result = self.lines((3, 3))
        self.assertEqual(result[2], "    z = [1, 2]")
        self.assertEqual(result[0], "x=1")
        self.assertEqual(result[1], "def f(a,b):")
        self.assertEqual(result[3], "    if a and  b :")
        self.assertEqual(result[7], "    q  =  3")

    def test_clause_header_and_trailing_comment(self):
        result = self.lines((4, 4), (6, 6))
        self.assertEqual(result[3], "    if a and b:")
        self.assertEqual(result[5], '    w = {"k": 1}  # keep')
        self.assertEqual(result[2], "    z=[1,2]")

    def test_a_range_touching_a_multiline_statement_formats_all_of_it(self):
        source = "x = [1,\n  2,\n  3]\ny=1\n"
        self.assertEqual(format_source(source, [(2, 2)]), "x = [1, 2, 3]\ny=1\n")

    def test_blank_lines_and_own_line_comments_are_never_touched(self):
        source = "a=1\n\n\n\n# c\nb=2\n"
        self.assertEqual(format_source(source, [(1, 6)]), "a = 1\n\n\n\n# c\nb = 2\n")

    def test_a_line_shared_by_two_statements_is_left_alone(self):
        self.assertEqual(format_source("a=1; b=2\nc=3\n", [(1, 2)]), "a=1; b=2\nc = 3\n")

    def test_a_range_outside_every_statement_changes_nothing(self):
        self.assertEqual(format_source(self.SOURCE, [(100, 120)]), self.SOURCE)

    def test_the_whole_file_as_a_range_formats_every_statement(self):
        result = format_source(self.SOURCE, [(1, 10)])
        self.assertIn("class A:", result)
        self.assertIn("    v = 1", result)
        self.assertIn("def f(a, b):", result)

    def test_long_statement_is_split_with_its_own_indentation(self):
        source = "def f():\n    value = some_function(aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccc)\n"
        self.assertEqual(
            format_source(source, [(2, 2)]),
            "def f():\n    value = some_function(\n        aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccc\n    )\n",
        )

    def test_cli_rejects_a_bad_range(self):
        from vsc_smith_pyfmt.__main__ import parse_lines

        self.assertEqual(parse_lines("3-5"), (3, 5))
        self.assertEqual(parse_lines("7"), (7, 7))
        for bad in ("0", "5-3", "a-b"):
            with self.assertRaises(ValueError):
                parse_lines(bad)


if __name__ == "__main__":
    unittest.main()
