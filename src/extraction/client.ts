import Anthropic from "@anthropic-ai/sdk";
import type { BreakdownContext } from "../context/types";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import {
  type Concept,
  CONCEPTS_OUTPUT_SCHEMA,
  type ExtractionResult,
  responseEnvelopeSchema,
  wireConceptSchema,
} from "./schema";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 16_000;

export interface ExtractionOptions {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  logger?: (message: string) => void;
}

export type ExtractionErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "cancelled"
  | "invalid_response"
  | "api_error";

export class ExtractionError extends Error {
  constructor(
    readonly kind: ExtractionErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ExtractionError";
  }
}

export type MessagesClient = Pick<Anthropic, "messages">;

export function extractConcepts(
  context: BreakdownContext,
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const client = new Anthropic({ apiKey: options.apiKey });
  return extractConceptsWithClient(client, context, options);
}

export async function extractConceptsWithClient(
  client: MessagesClient,
  context: BreakdownContext,
  options: ExtractionOptions,
): Promise<ExtractionResult> {
  const log = options.logger ?? (() => {});
  const model = options.model ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options.signal?.aborted) {
    throw new ExtractionError("cancelled", "Extraction was cancelled.");
  }

  const signals = [AbortSignal.timeout(timeoutMs)];
  if (options.signal) {
    signals.push(options.signal);
  }
  const signal = AbortSignal.any(signals);

  log(
    `Extracting concepts with ${model}: ${context.languageId}, ` +
      `${context.code.split("\n").length} lines, ${context.code.length} chars`,
  );

  let response: Anthropic.Message;
  try {
    response = await client.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(context) }],
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: CONCEPTS_OUTPUT_SCHEMA },
        },
      },
      { signal },
    );
  } catch (error) {
    throw toExtractionError(error, options.signal, timeoutMs);
  }

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  log(
    `Response: stop_reason=${response.stop_reason}, ` +
      `input_tokens=${usage.inputTokens}, output_tokens=${usage.outputTokens}`,
  );

  const rawConcepts = parseEnvelope(response);
  const concepts: Concept[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  rawConcepts.forEach((raw, index) => {
    const parsed = wireConceptSchema.safeParse(raw);
    if (!parsed.success) {
      dropped++;
      const reasons = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ");
      log(`Dropped concept ${index}${describeId(raw)}: ${reasons}`);
      return;
    }
    if (seen.has(parsed.data.id)) {
      log(`Skipped duplicate concept id "${parsed.data.id}"`);
      return;
    }
    seen.add(parsed.data.id);
    concepts.push(parsed.data);
  });

  log(`Kept ${concepts.length} concepts, dropped ${dropped}`);
  return { concepts, dropped, usage };
}

function parseEnvelope(response: Anthropic.Message): unknown[] {
  if (response.stop_reason !== "end_turn") {
    throw new ExtractionError(
      "invalid_response",
      `The model stopped without a complete answer (${response.stop_reason}).`,
    );
  }
  const text = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!text) {
    throw new ExtractionError(
      "invalid_response",
      "The response contained no output.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch (error) {
    throw new ExtractionError(
      "invalid_response",
      "The response was not valid JSON.",
      { cause: error },
    );
  }
  const envelope = responseEnvelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new ExtractionError(
      "invalid_response",
      "The response did not contain a concepts list.",
    );
  }
  return envelope.data.concepts;
}

function describeId(raw: unknown): string {
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id: unknown }).id;
    if (typeof id === "string") {
      return ` ("${id.slice(0, 60)}")`;
    }
  }
  return "";
}

function toExtractionError(
  error: unknown,
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): unknown {
  const timedOut = () =>
    new ExtractionError(
      "timeout",
      `The request timed out after ${timeoutMs / 1000} seconds.`,
      { cause: error },
    );

  if (error instanceof Anthropic.APIUserAbortError) {
    return userSignal?.aborted
      ? new ExtractionError("cancelled", "Extraction was cancelled.", {
          cause: error,
        })
      : timedOut();
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return timedOut();
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return new ExtractionError("auth", "The API key was rejected.", {
      cause: error,
    });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ExtractionError(
      "rate_limit",
      "Rate limited by the Anthropic API. Try again shortly.",
      { cause: error },
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ExtractionError(
      "network",
      "Could not reach the Anthropic API.",
      { cause: error },
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new ExtractionError(
      "api_error",
      `The Anthropic API returned an error (${error.status ?? "unknown status"}).`,
      { cause: error },
    );
  }
  return error;
}
