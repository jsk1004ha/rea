import { describe, expect, it } from "vitest";

import { analyzeJavaScriptStaticSource } from "./javascriptStaticAnalysis.js";

const graphqlEndpoints = (source: string) =>
  analyzeJavaScriptStaticSource(source)
    .endpoints.filter(({ mechanism }) => mechanism.startsWith("graphql:"))
    .map(({ value, mechanism }) => ({ value, mechanism }));

// Issue #3311: Source-shaped metadata does not prove a duplicate. Keep
// independent literals while preserving proven precompiled-source ownership.
const cases = [
  {
    name: "retains a standalone query with locationOffset",
    source: "const source = { body: \"query GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "retains a standalone mutation with locationOffset",
    source: "const source = { body: \"mutation GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } };",
    expected: [
      { value: "GetUser", mechanism: "graphql:mutation" },
    ],
  },
  {
    name: "retains a standalone subscription with locationOffset",
    source: "const source = { body: \"subscription GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } };",
    expected: [
      { value: "GetUser", mechanism: "graphql:subscription" },
    ],
  },
  {
    name: "keeps the no-locationOffset control",
    source: "const source = { body: \"query GetUser { user { id } }\" };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "retains computed literal keys",
    source: "const source = { [\"body\"]: \"query GetUser { user }\", [\"locationOffset\"]: { line: 1, column: 1 } };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "does not conflate an unrelated precompiled operation",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const compiled = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "deduplicates even when loc precedes definitions",
    source: "const doc = { kind: \"Document\", loc: { source: { body: \"query GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } } }, definitions: [{ kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"GetUser\" } }] };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "deduplicates a Source initializer declared before its consumer",
    source: "const source = { body: \"query GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"GetUser\" }, loc: { source } };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "follows stable Source and location aliases",
    source: "const source = { body: \"query GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } }; const alias = source; const location = { source: alias }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"GetUser\" }, loc: location };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "keeps a shadowed Source in a different lexical scope",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; function nested() { const source = { body: \"query Compiled { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source } }; }",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "does not equate a reassigned binding with its old Source",
    source: "let source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; source = runtimeSource; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "keeps Source text when loc.source is unresolved",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source: missing } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "honors an overwritten loc.source property",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source, source: runtimeSource } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "honors a dynamic spread over loc.source",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source, ...runtimeOptions } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "requires an actual loc.source relationship",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, note: { source } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "does not suppress text for a fragment-only Document",
    source: "const doc = { kind: \"Document\", definitions: [{ kind: \"FragmentDefinition\", name: { kind: \"Name\", value: \"UserFields\" } }], loc: { source: { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } } } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
    ],
  },
  {
    name: "does not suppress text for an empty Document",
    source: "const doc = { kind: \"Document\", definitions: [], loc: { source: { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } } } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
    ],
  },
  {
    name: "does not infer a whole Source from a destructuring projection",
    source: "const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const { inner } = source; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source: inner } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "terminates on cyclic aliases without suppressing other text",
    source: "const a = b; const b = a; const source = { body: \"query Standalone { user { id } }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"Compiled\" }, loc: { source: a } };",
    expected: [
      { value: "Standalone", mechanism: "graphql:query" },
      { value: "Compiled", mechanism: "graphql:query" },
    ],
  },
  {
    name: "preserves another literal in a compiled Source object",
    source: "const source = { body: \"query GetUser { user }\", note: \"query Extra { user }\", locationOffset: { line: 1, column: 1 } }; const operation = { kind: \"OperationDefinition\", operation: \"query\", name: { kind: \"Name\", value: \"GetUser\" }, loc: { source } };",
    expected: [
      { value: "Extra", mechanism: "graphql:query" },
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
  {
    name: "does not execute the inspected JavaScript",
    source: "throw new Error(\"fixture must not execute\"); const source = { body: \"query GetUser { user { id } }\", locationOffset: { line: 1, column: 1 } };",
    expected: [
      { value: "GetUser", mechanism: "graphql:query" },
    ],
  },
];

describe("GraphQL source ownership", () => {
  it.each(cases)("$name", ({ source, expected }) => {
    expect(graphqlEndpoints(source)).toEqual(expected);
  });
});
