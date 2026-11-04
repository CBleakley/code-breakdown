import * as assert from "assert";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";

suite("extraction prompt", () => {
  test("numbers each line from startLine", () => {
    const message = buildUserMessage({
      code: "const a = 1;\nif (a) {\n  log(a);",
      languageId: "typescript",
      startLine: 41,
    });
    assert.strictEqual(
      message,
      "Language: typescript\n\nCode:\n" +
        "41 | const a = 1;\n" +
        "42 | if (a) {\n" +
        "43 |   log(a);",
    );
  });

  test("pads line numbers to the widest one", () => {
    const code = Array.from({ length: 3 }, (_, i) => `x${i}`).join("\n");
    const message = buildUserMessage({
      code,
      languageId: "python",
      startLine: 9,
    });
    assert.ok(message.endsWith(" 9 | x0\n10 | x1\n11 | x2"), message);
  });

  test("keeps blank lines and indentation", () => {
    const message = buildUserMessage({
      code: "def f():\n\n    return 1",
      languageId: "python",
      startLine: 1,
    });
    assert.ok(message.endsWith("1 | def f():\n2 | \n3 |     return 1"));
  });

  test("the system prompt sets the audience and starter names", () => {
    assert.match(SYSTEM_PROMPT, /junior developers/);
    for (const name of [
      "rules of hooks",
      "stale closures",
      "union narrowing",
      "async/await and Promises",
      "context managers",
      "dunder methods",
    ]) {
      assert.ok(SYSTEM_PROMPT.includes(name), name);
    }
  });
});
