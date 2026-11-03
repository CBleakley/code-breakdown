import * as assert from "assert";
import {
  buildContext,
  EMPTY_SELECTION_MESSAGE,
  MAX_SELECTION_CHARS,
  MAX_SELECTION_LINES,
  SUPPORTED_LANGUAGES,
  TOO_LARGE_MESSAGE,
  UNSUPPORTED_LANGUAGE_MESSAGE,
} from "./buildContext";
import { PYTHON_FILE, REACT_COMPONENT, TYPESCRIPT_MODULE } from "./fixtures";
import type { BreakdownContext, ContextResult } from "./types";

type Pos = [line: number, character: number];

function run(
  lines: string[],
  start: Pos,
  end: Pos,
  languageId = "typescript",
): ContextResult {
  return buildContext({
    languageId,
    selection: {
      start: { line: start[0], character: start[1] },
      end: { line: end[0], character: end[1] },
    },
    lineCount: lines.length,
    getLine: (i) => lines[i],
  });
}

function expectContext(result: ContextResult): BreakdownContext {
  if (!result.ok) {
    assert.fail(`expected ok, got ${result.error.kind}`);
  }
  return result.context;
}

function expectError(result: ContextResult, kind: string, message: string) {
  assert.deepStrictEqual(result, { ok: false, error: { kind, message } });
}

const SAMPLE = ["const a = 1;", "function f() {", "  return a;", "}"];

suite("buildContext", () => {
  test("expands a mid-line selection to whole lines", () => {
    const context = expectContext(run(SAMPLE, [1, 9], [2, 5]));
    assert.strictEqual(context.code, "function f() {\n  return a;");
  });

  test("leaves out a final line selected only up to character 0", () => {
    const context = expectContext(run(SAMPLE, [1, 0], [3, 0]));
    assert.strictEqual(context.code, "function f() {\n  return a;");
  });

  test("startLine is 1-based", () => {
    assert.strictEqual(expectContext(run(SAMPLE, [0, 2], [0, 5])).startLine, 1);
    assert.strictEqual(expectContext(run(SAMPLE, [2, 0], [3, 1])).startLine, 3);
  });

  test("preserves indentation and inner blank lines", () => {
    const lines = ["def f():", "    x = 1", "", "\t  y = 2", "    return x"];
    const context = expectContext(run(lines, [0, 0], [4, 12], "python"));
    assert.strictEqual(context.code, lines.join("\n"));
  });

  test("an empty selection returns empty_selection", () => {
    expectError(
      run(SAMPLE, [1, 4], [1, 4]),
      "empty_selection",
      EMPTY_SELECTION_MESSAGE,
    );
  });

  test("a whitespace-only selection returns empty_selection", () => {
    const lines = ["a", "   ", "", "\t", "b"];
    expectError(
      run(lines, [1, 0], [4, 0]),
      "empty_selection",
      EMPTY_SELECTION_MESSAGE,
    );
  });

  test("a markdown document returns unsupported_language", () => {
    expectError(
      run(["# Title", "text"], [0, 0], [1, 4], "markdown"),
      "unsupported_language",
      UNSUPPORTED_LANGUAGE_MESSAGE,
    );
  });

  test("checks the language before the selection", () => {
    expectError(
      run(SAMPLE, [0, 0], [0, 0], "markdown"),
      "unsupported_language",
      UNSUPPORTED_LANGUAGE_MESSAGE,
    );
  });

  test("accepts every supported language", () => {
    for (const languageId of SUPPORTED_LANGUAGES) {
      assert.ok(run(SAMPLE, [0, 0], [0, 3], languageId).ok, languageId);
    }
  });

  test("200 lines succeed and 201 lines return too_large", () => {
    const lines = Array.from({ length: 201 }, (_, i) => `x${i}`);
    const context = expectContext(
      run(lines, [0, 0], [MAX_SELECTION_LINES - 1, 1]),
    );
    assert.strictEqual(context.code.split("\n").length, MAX_SELECTION_LINES);

    expectError(
      run(lines, [0, 0], [MAX_SELECTION_LINES, 1]),
      "too_large",
      TOO_LARGE_MESSAGE,
    );
  });

  test("20,000 characters succeed and 20,001 return too_large", () => {
    // Two lines joined by "\n": the separator counts towards the limit.
    const half = (MAX_SELECTION_CHARS - 1) / 2;
    const atLimit = ["a".repeat(Math.floor(half)), "b".repeat(Math.ceil(half))];
    const context = expectContext(run(atLimit, [0, 0], [1, 1]));
    assert.strictEqual(context.code.length, MAX_SELECTION_CHARS);

    const overLimit = [atLimit[0], atLimit[1] + "b"];
    expectError(run(overLimit, [0, 0], [1, 1]), "too_large", TOO_LARGE_MESSAGE);
  });

  suite("fixtures", () => {
    test("React component", () => {
      // Drag-select the component from mid-line to the start of the next line.
      const result = run(REACT_COMPONENT, [2, 7], [11, 0], "typescriptreact");
      assert.deepStrictEqual(expectContext(result), {
        code: REACT_COMPONENT.slice(2, 11).join("\n"),
        languageId: "typescriptreact",
        startLine: 3,
      });
      assert.ok(expectContext(result).code.includes("\n\n  return ("));
    });

    test("TypeScript module", () => {
      const result = run(TYPESCRIPT_MODULE, [8, 8], [9, 20]);
      assert.deepStrictEqual(expectContext(result), {
        code:
          '  const raw = await readFile(path, "utf8");\n' +
          "  return JSON.parse(raw) as Config;",
        languageId: "typescript",
        startLine: 9,
      });
    });

    test("Python file", () => {
      const result = run(PYTHON_FILE, [3, 0], [9, 0], "python");
      assert.deepStrictEqual(expectContext(result), {
        code: [
          "class Circle:",
          "    def __init__(self, radius):",
          "        self.radius = radius",
          "",
          "    def area(self):",
          "        return math.pi * self.radius ** 2",
        ].join("\n"),
        languageId: "python",
        startLine: 4,
      });
    });
  });
});
