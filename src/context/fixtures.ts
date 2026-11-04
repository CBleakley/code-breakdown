// Test-only fixture documents, stored as line arrays so tsc and eslint
// don't try to compile them as source.

export const REACT_COMPONENT = [
  'import { useState } from "react";',
  "",
  "export function Counter({ start }: { start: number }) {",
  "  const [count, setCount] = useState(start);",
  "",
  "  return (",
  "    <button onClick={() => setCount(count + 1)}>",
  "      Clicked {count} times",
  "    </button>",
  "  );",
  "}",
  "",
];

export const TYPESCRIPT_MODULE = [
  'import { readFile } from "fs/promises";',
  "",
  "export interface Config {",
  "  name: string;",
  "  retries: number;",
  "}",
  "",
  "export async function loadConfig(path: string): Promise<Config> {",
  '  const raw = await readFile(path, "utf8");',
  "  return JSON.parse(raw) as Config;",
  "}",
  "",
];

export const PYTHON_FILE = [
  "import math",
  "",
  "",
  "class Circle:",
  "    def __init__(self, radius):",
  "        self.radius = radius",
  "",
  "    def area(self):",
  "        return math.pi * self.radius ** 2",
  "",
];
