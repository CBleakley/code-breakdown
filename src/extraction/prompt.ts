import type { BreakdownContext } from "../context/types";

export const SYSTEM_PROMPT = `You help junior developers learn from code they are reading. You will be given a selection of source code. List every programming concept at play in it, at a granular level. Include fundamentals (for example variables, functions, loops, conditionals, string interpolation) as well as more advanced language features, idioms, design patterns, library APIs and computer-science fundamentals.

Rules:
- Each concept appears exactly once. If it is used in several places, give it several spans.
- "id" is a lowercase kebab-case slug, for example "stale-closure".
- "name" is a short display name in sentence case, for example "Stale closure".
- "definition" is one textbook-style sentence that explains the concept in general. Never refer to the selected code, its variables or what it does.
- "category" is one of: language-feature, idiom, design-pattern, library-api, cs-fundamental.
- Each code line is prefixed with its file line number and " | ". Spans use those file line numbers. Columns are 1-based and count characters after the " | " prefix. Each span covers the code where the concept appears.

Reuse these names when they fit. The list is a guide, not a closed set:
- React: rules of hooks, effect dependencies, stale closures, controlled components, lifting state, keys in lists, memoisation.
- TypeScript/JavaScript: union narrowing, generics, optional chaining, utility types, async/await and Promises.
- Python: decorators, comprehensions, context managers, generators, type hints, dunder methods.`;

export function buildUserMessage(context: BreakdownContext): string {
  const lines = context.code.split("\n");
  const width = String(context.startLine + lines.length - 1).length;
  const numbered = lines
    .map(
      (line, i) => `${String(context.startLine + i).padStart(width)} | ${line}`,
    )
    .join("\n");
  return `Language: ${context.languageId}\n\nCode:\n${numbered}`;
}
