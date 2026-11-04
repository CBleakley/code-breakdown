import * as assert from "assert";
import Anthropic from "@anthropic-ai/sdk";
import type { BreakdownContext } from "../context/types";
import {
  DEFAULT_MODEL,
  ExtractionError,
  type ExtractionErrorKind,
  type ExtractionOptions,
  extractConceptsWithClient,
  type MessagesClient,
} from "./client";
import { wireConcept } from "./fixtures";
import { CONCEPTS_OUTPUT_SCHEMA } from "./schema";

const API_KEY = "sk-ant-test-key-do-not-log";
const CONTEXT: BreakdownContext = {
  code: "const secretSelectionMarker = user?.profile?.name;",
  languageId: "typescript",
  startLine: 7,
};

type CreateParams = Anthropic.MessageCreateParamsNonStreaming;
type CreateImpl = (
  params: CreateParams,
  options: { signal: AbortSignal },
) => Promise<Anthropic.Message>;

function fakeClient(impl: CreateImpl) {
  const calls: { params: CreateParams; options: { signal: AbortSignal } }[] =
    [];
  const client = {
    messages: {
      create: (params: CreateParams, options: { signal: AbortSignal }) => {
        calls.push({ params, options });
        return impl(params, options);
      },
    },
  } as unknown as MessagesClient;
  return { client, calls };
}

function message(
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.StopReason = "end_turn",
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 45 },
  } as unknown as Anthropic.Message;
}

function textMessage(text: string, stopReason?: Anthropic.StopReason) {
  return message(
    [{ type: "text", text, citations: null } as Anthropic.TextBlock],
    stopReason,
  );
}

function conceptsMessage(concepts: unknown[]) {
  return textMessage(JSON.stringify({ concepts }));
}

function run(
  impl: CreateImpl,
  extra: Partial<ExtractionOptions> = {},
): { result: ReturnType<typeof extractConceptsWithClient>; logs: string[] } {
  const logs: string[] = [];
  const { client } = fakeClient(impl);
  const result = extractConceptsWithClient(client, CONTEXT, {
    apiKey: API_KEY,
    logger: (m) => logs.push(m),
    ...extra,
  });
  return { result, logs };
}

async function expectKind(
  promise: Promise<unknown>,
  kind: ExtractionErrorKind,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ExtractionError, String(error));
    assert.strictEqual(error.kind, kind);
    return true;
  });
}

function rejectWhenAborted(
  _: CreateParams,
  { signal }: { signal: AbortSignal },
) {
  return new Promise<Anthropic.Message>((_resolve, reject) => {
    signal.addEventListener("abort", () =>
      reject(new Anthropic.APIUserAbortError()),
    );
  });
}

suite("extractConcepts", () => {
  test("returns validated concepts and usage for a valid response", async () => {
    const { result, logs } = run(async () =>
      conceptsMessage([
        wireConcept(),
        wireConcept({
          id: "async-await",
          name: "Async/await",
          category: "language-feature",
        }),
      ]),
    );
    const { concepts, dropped, usage } = await result;
    assert.deepStrictEqual(
      concepts.map((c) => c.id),
      ["optional-chaining", "async-await"],
    );
    assert.deepStrictEqual(concepts[0].spans, [
      { start: [3, 5], end: [3, 20] },
    ]);
    assert.strictEqual(dropped, 0);
    assert.deepStrictEqual(usage, { inputTokens: 120, outputTokens: 45 });
    assert.ok(logs.some((l) => l.includes("Kept 2 concepts, dropped 0")));
  });

  test("sends the model, system prompt, numbered code and output schema", async () => {
    const { client, calls } = fakeClient(async () => conceptsMessage([]));
    await extractConceptsWithClient(client, CONTEXT, { apiKey: API_KEY });
    const { params, options } = calls[0];
    assert.strictEqual(params.model, DEFAULT_MODEL);
    assert.strictEqual(DEFAULT_MODEL, "claude-sonnet-5-5");
    assert.deepStrictEqual(params.output_config?.format, {
      type: "json_schema",
      schema: CONCEPTS_OUTPUT_SCHEMA,
    });
    assert.strictEqual(params.tool_choice, undefined);
    assert.ok(typeof params.system === "string" && params.system.length > 0);
    assert.match(String(params.messages[0].content), /^7 \| const/m);
    assert.ok(options.signal instanceof AbortSignal);
  });

  test("uses a custom model when given", async () => {
    const { client, calls } = fakeClient(async () => conceptsMessage([]));
    await extractConceptsWithClient(client, CONTEXT, {
      apiKey: API_KEY,
      model: "claude-haiku-5-5",
    });
    assert.strictEqual(calls[0].params.model, "claude-haiku-5-5");
  });

  test("drops and counts an invalid concept and logs why", async () => {
    const { result, logs } = run(async () =>
      conceptsMessage([
        wireConcept(),
        wireConcept({ id: "Not Kebab", category: "nonsense" }),
      ]),
    );
    const { concepts, dropped } = await result;
    assert.deepStrictEqual(
      concepts.map((c) => c.id),
      ["optional-chaining"],
    );
    assert.strictEqual(dropped, 1);
    const dropLog = logs.find((l) => l.startsWith("Dropped concept 1"));
    assert.ok(dropLog, logs.join("\n"));
    assert.match(dropLog, /id:/);
    assert.match(dropLog, /category:/);
  });

  test("removes duplicate ids, keeping the first", async () => {
    const { result, logs } = run(async () =>
      conceptsMessage([
        wireConcept({ name: "First" }),
        wireConcept({ name: "Second" }),
      ]),
    );
    const { concepts, dropped } = await result;
    assert.strictEqual(concepts.length, 1);
    assert.strictEqual(concepts[0].name, "First");
    assert.strictEqual(dropped, 0);
    assert.ok(logs.some((l) => l.includes("duplicate")));
  });

  suite("invalid responses", () => {
    const cases: [string, () => Anthropic.Message][] = [
      ["no output block", () => message([])],
      ["text that is not JSON", () => textMessage("Here are the concepts:")],
      ["JSON without a concepts list", () => textMessage('{"items": []}')],
      ["a refusal", () => textMessage("", "refusal")],
      [
        "a max_tokens cut-off",
        () => textMessage('{"concepts": [', "max_tokens"),
      ],
    ];
    for (const [label, build] of cases) {
      test(`${label} is invalid_response`, async () => {
        await expectKind(run(async () => build()).result, "invalid_response");
      });
    }
  });

  suite("API errors", () => {
    const statusCases: [number, ExtractionErrorKind][] = [
      [401, "auth"],
      [429, "rate_limit"],
      [400, "api_error"],
      [500, "api_error"],
    ];
    for (const [status, kind] of statusCases) {
      test(`${status} maps to ${kind}`, async () => {
        const error = Anthropic.APIError.generate(
          status,
          { type: "error", error: { type: "x", message: "m" } },
          "m",
          new Headers(),
        );
        await expectKind(
          run(async () => {
            throw error;
          }).result,
          kind,
        );
      });
    }

    test("a connection error maps to network", async () => {
      await expectKind(
        run(async () => {
          throw new Anthropic.APIConnectionError({ message: "ECONNRESET" });
        }).result,
        "network",
      );
    });

    test("an SDK connection timeout maps to timeout", async () => {
      await expectKind(
        run(async () => {
          throw new Anthropic.APIConnectionTimeoutError();
        }).result,
        "timeout",
      );
    });

    test("an unrelated error is rethrown unchanged", async () => {
      const boom = new TypeError("boom");
      await assert.rejects(
        run(async () => {
          throw boom;
        }).result,
        (e: unknown) => e === boom,
      );
    });
  });

  suite("timeout and cancellation", () => {
    test("exceeding timeoutMs maps to timeout", async () => {
      await expectKind(
        run(rejectWhenAborted, { timeoutMs: 20 }).result,
        "timeout",
      );
    });

    test("aborting the caller's signal maps to cancelled", async () => {
      const controller = new AbortController();
      const { result } = run(rejectWhenAborted, { signal: controller.signal });
      setTimeout(() => controller.abort(), 5);
      await expectKind(result, "cancelled");
    });

    test("an already-aborted signal is cancelled without calling the API", async () => {
      const controller = new AbortController();
      controller.abort();
      const { client, calls } = fakeClient(async () => conceptsMessage([]));
      await expectKind(
        extractConceptsWithClient(client, CONTEXT, {
          apiKey: API_KEY,
          signal: controller.signal,
        }),
        "cancelled",
      );
      assert.strictEqual(calls.length, 0);
    });
  });

  test("never logs the API key or the selected code", async () => {
    const { result, logs } = run(async () =>
      conceptsMessage([wireConcept(), wireConcept({ id: "Bad Id" })]),
    );
    await result;
    assert.ok(logs.length > 0);
    for (const line of logs) {
      assert.ok(!line.includes(API_KEY), line);
      assert.ok(!line.includes("secretSelectionMarker"), line);
    }
  });
});
