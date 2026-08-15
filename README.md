# prompt-render

[![CI](https://github.com/bug3/prompt-render/actions/workflows/ci.yml/badge.svg)](https://github.com/bug3/prompt-render/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/prompt-render)](https://www.npmjs.com/package/prompt-render)
[![license](https://img.shields.io/npm/l/prompt-render)](LICENSE)
[![node](https://img.shields.io/node/v/prompt-render)](package.json)

Type-safe `{{variable}}` templating for prompt files. Fail closed. Insert verbatim.

- Zero runtime dependencies
- Schema bound at module load, not at first render
- `{{token}}` substitution, and nothing else
- Rendered bytes are deterministic, digestible, and survive a UTF-8 round trip
- Opt-in descriptors for the ways untrusted text breaks a document
- Compatible with the same placeholder style as [sql-render](https://www.npmjs.com/package/sql-render)

This package does not parse markdown. The file is plain text with placeholders.
The `.md` extension is a convention, not a contract.

The decisions behind the refusals are in [Decisions](#decisions).

## What it refuses

These refusals are the product. Read them before the API.

**No template logic.** No conditionals, loops, partials, includes, helpers,
filters, or comments with behaviour. The output is a pure function of (file
bytes, parameter values), so a reader can predict the rendered bytes from the
file alone. If a fourth template wants a branch, the answer is two files.

**No silent blanks.** A placeholder with no descriptor, or a descriptor with no
placeholder, throws when the template is defined. A missing value throws when
it renders. An empty string is never a substitute for an answer, because it
makes "what was the model told?" unanswerable.

**No runtime the text can reach.** No expression evaluation, no frontmatter
parser, no model, tool, or message binding, no I/O beyond reading the template
file, no dependencies. A sealed prompt should not carry a stack.

**No escaping.** Values are inserted byte for byte. A renderer that mangles the
user's task text is broken. Descriptors may validate and may normalise
(trailing newline, host path rules). They never escape. The one descriptor that
adds bytes, `text.fencedBlock`, only puts a frame around a value the caller
asked to frame; the value inside is still byte for byte.

## Installation

```bash
npm install prompt-render
```

Node 20 or newer.

## Quick Start

Create a template file with `{{variable}}` placeholders:

```md
Complete the task in this isolated repository.

## Task

{{task}}

## Output

Write result.json to {{outputDir}} matching this schema:

{{resultSchema}}
```

Bind it at module load. Types are inferred from the descriptor map.

```typescript
import { defineTemplate, text } from 'prompt-render';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const templatePath = (name: string) => path.join(here, name);

export const generationPrompt = defineTemplate(templatePath('generation.md'), {
    task: text.required,
    outputDir: text.absolutePath,
    resultSchema: text.block,
});

const { markdown } = generationPrompt({
    task,
    outputDir,
    resultSchema,
});
```

`templatePath` is your helper, not part of this package. Resolve files from
`import.meta.url`. Do not guess the caller directory from the stack.

A missing or misspelled parameter is a compile error. A placeholder with no
descriptor, or a descriptor with no placeholder, throws when the template is
defined.

## Decisions

Answered before the first renderer line.

1. **Independent of sql-render.** The packages share about 60 lines and invert
   everything that matters (escape vs verbatim, `sql` vs `markdown`). A shared
   core would break sql-render users for no gain.
2. **Files are the product.** `defineTemplate` reads a path. Tests and embeds
   use `defineStringTemplate(source, schema, { label })`. Same parser.
3. **No frontmatter.** An id/version YAML block would drag a parser in and
   split the digest. Versioning is the file name plus `digest`.
4. **The digest is public.** `template.digest` is lowercase hex `sha256` of the
   raw file bytes. After CRLF and BOM refusal, that equals
   `sha256(fs.readFileSync(path))`.
5. **Every template is bound.** There is no untyped generic mode: that is how
   unguarded text sneaks back in. A placeholder with no descriptor, or a
   descriptor with no placeholder, throws at module load.
6. **Values are checked for round-trip safety, and nothing else.** Bytes UTF-8
   cannot carry (unpaired surrogates) are refused in the template and in every
   rendered value, including the output of a custom `format`. That is not a
   policy: it is what makes `sha256(rendered bytes)` identify the text that was
   actually rendered. Everything a byte sequence *can* express still passes
   through untouched unless a descriptor refuses it.
7. **Safety descriptors are opt-in.** The ways untrusted text breaks a document
   (fence collision, invisible characters, size) get descriptors a caller can
   choose, never a default that repairs a value behind their back.
8. **Guards assert over the file.** Descriptors guard values; guards guard the
   template text at module load. Both fail where a policy failure is cheap.

## Byte semantics

The rendered bytes are hashed, sealed, and compared. The rules are exact.

| Topic | Rule |
| --- | --- |
| Encoding | UTF-8, fatal. Invalid bytes throw and name the resolved path. |
| BOM | A leading U+FEFF is refused. |
| Newlines in the file | LF only. Any `\r` is refused. Values may contain CRLF and are inserted as-is. |
| Trailing newline | Preserved exactly as the file has it. |
| Placeholder | `{{name}}`. Name: `[A-Za-z_][A-Za-z0-9_]*`. No inner whitespace. |
| `{{ name }}`, `{{}}`, `{{{name}}}` | Define-time error. A padded token is a typo, not data. |
| Single `{` / `}` | Data. JSON Schema in the file passes through. |
| Literal `{{` | `{{{{` emits `{{`. To write the characters `{{task}}`, write `{{{{task}}`. Closing `}}` is only special as the end of `{{name}}`. `}}}}` is not an escape, because nested JSON ends with runs of `}`. |
| `{{__proto__}}` | Reserved. Define-time error: that name cannot be carried safely through a parameter object. Every other `Object.prototype` name (`constructor`, `toString`) is an ordinary token. |
| Values | Verbatim. No re-indent, dedent, wrap, or rescan. A task that contains `{{secret}}` stays `{{secret}}`. |
| Unpaired surrogates | Refused, in the template and in every rendered value. UTF-8 cannot carry them, so the sealed bytes would not be the rendered text. |
| Duplicate tokens | Allowed. One descriptor, every occurrence replaced. |
| Determinism | Same file + same values => identical bytes, any process, any machine. |

## Schema types

| Type | Accepts |
| --- | --- |
| `text.required` | Non-empty string, no NUL. Newlines allowed. |
| `text.block` | Same validate as `text.required`. Use it to mark a large insert. |
| `text.line` | Like `required`, but rejects `\n` and `\r`. |
| `text.absolutePath` | Non-empty string, no NUL, `path.isAbsolute` for the host. |

All built-ins reject `null`, `undefined`, non-strings, empty string, U+0000,
and unpaired surrogates. `text.block` is not a different type from
`text.required`; the name exists so a large JSON Schema or peer package is
obvious at the call site.

### Opt-in refusals

The default is verbatim. These exist for the ways untrusted text breaks a
document, and they refuse rather than repair. None of them is a defence
against prompt injection: plain ASCII that says "ignore your instructions"
passes every one.

| Type | Refuses |
| --- | --- |
| `text.plain` | Control characters (tab and newline excepted), bidi controls (Trojan Source), zero-width and invisible formatting, Unicode tag characters. |
| `text.noFence` | A run of three or more backticks, which would close a fence written in the template. |
| `text.maxBytes(n)` | Values over `n` UTF-8 bytes. The reason names both sizes, never the value. |
| `text.maxChars(n)` | Values over `n` UTF-16 code units, the unit `String.length` uses. |

```typescript
import { allOf, defineTemplate, text } from 'prompt-render';

const evaluatorPrompt = defineTemplate(templatePath('evaluator.md'), {
    task: allOf(text.plain, text.maxBytes(8_000)),
    rubric: text.noFence,
    resultSchema: text.block,
});
```

### Fenced blocks

`text.fencedBlock({ lang })` is the only descriptor that adds bytes, and it
adds only a frame: an opening fence one backtick longer than the longest run
inside the value, the value untouched, a closing fence. The value cannot end
its own block, so a peer package full of code fences stays data.

```typescript
const improvementPrompt = defineTemplate(templatePath('improvement.md'), {
    task: text.required,
    peerPackage: text.fencedBlock({ lang: 'markdown' }),
});

// peerPackage: "```js\ncode\n```"  renders as:
// ````markdown
// ```js
// code
// ```
// ````
```

A single trailing newline is added only when the value lacks one, so the
closing fence starts its own line. Nothing inside the value is escaped,
re-indented, or trimmed.

### Custom types

A descriptor is `{ validate(value): boolean; format?(value): string }`.
`format` is for normalisation (a trailing newline), never for escaping.
An optional `reason(value): string` lets a built-in or custom type name the
failure without echoing the value.

Wrap it in `defineType<T>()` so the call site keeps its compile-time check: a
bare object literal infers the parameter as `unknown`.

```typescript
import { allOf, defineType, text } from 'prompt-render';

const noVendor = defineType<string>({
    validate: (val) => typeof val === 'string'
        && val.length > 0
        && !/\b(openai|anthropic|google)\b/i.test(val),
    reason: () => 'contains a vendor name',
});

const prompt = defineTemplate(templatePath('generation.md'), {
    task: allOf(noVendor, text.plain),
    outputDir: text.absolutePath,
    resultSchema: text.block,
});
```

`allOf(...)` runs every `validate` against the original value and reports the
first failure; `format` steps then run in argument order. That is why the
built-in set stays small: a single-line, invisible-character-free, budgeted
value is a composition, not a fifth built-in.

## Template guards

Descriptors guard values. Guards guard the template file itself, at module
load, before the placeholder scan.

```typescript
import { defineTemplate, guard, text } from 'prompt-render';

const noVendorName = guard.noPattern('no-vendor', /\b(openai|anthropic)\b/i, 'names a vendor');

export const generationPrompt = defineTemplate(templatePath('generation.md'), {
    task: text.required,
}, {
    guards: [guard.trailingNewline, noVendorName],
});
```

A guard is `{ name, validate(source): boolean, reason?(source): string }`. It
validates; it never rewrites the source. Failure throws `TEMPLATE_REJECTED`
naming the guard and the file. `guard.noPattern` refuses a `g` or `y` regex,
because a stateful regex would make the check depend on call order.

## String templates

For tests and in-memory use. `label` is required and is what errors name.

```typescript
import { defineStringTemplate, text } from 'prompt-render';

const greet = defineStringTemplate('Hello {{name}}\n', {
    name: text.required,
}, { label: 'greet.md' });

const { markdown } = greet({ name: 'Ada' });
```

`greet.digest` is `sha256` of the UTF-8 source bytes. Prefer `defineTemplate`
when the text is an audit artifact.

## Audit surface

The function returned by `defineTemplate` carries the bound file:

```typescript
generationPrompt.path;    // resolved absolute path
generationPrompt.digest;  // sha256 hex of the raw file bytes
generationPrompt.tokens;  // unique names, first-appearance order
```

The result carries the bytes that were actually produced:

```typescript
const { markdown, digest, bytes } = generationPrompt({ task, outputDir, resultSchema });

digest; // sha256 hex of Buffer.from(markdown, 'utf8')
bytes;  // that buffer's length
```

`digest` and `bytes` are computed on first access, so reading only `markdown`
costs nothing. `template.digest` answers "which prompt"; `result.digest`
answers "which prompt with which values". A run record wants both.

## Error messages

Errors are `PromptRenderError`. Every message names the template file. Validation
messages name the parameter and the reason. They do not echo the value.

| Scenario | Code |
| --- | --- |
| File missing | `FILE_NOT_FOUND` |
| File unreadable | `FILE_UNREADABLE` |
| Not valid UTF-8, or an unpaired surrogate in the source | `INVALID_ENCODING` |
| CR in the file | `CRLF_REFUSED` |
| Leading UTF-8 BOM | `BOM_REFUSED` |
| `{{ name }}`, unclosed `{{`, bad name | `MALFORMED_PLACEHOLDER` |
| `{{__proto__}}` | `RESERVED_PLACEHOLDER` |
| Placeholder with no descriptor | `UNKNOWN_PLACEHOLDER` |
| Descriptor with no placeholder | `UNUSED_PARAMETER` |
| Descriptor missing `validate` | `INVALID_DESCRIPTOR` |
| Bad label, bad guard, bad descriptor option | `INVALID_OPTIONS` |
| Parameter bag is not an object | `INVALID_PARAMS` |
| Value fails `validate` | `INVALID_VALUE` |
| Template rejected by a guard | `TEMPLATE_REJECTED` |

Placeholder errors carry `line` and `column` and report `path:line:column`:

```
Malformed placeholder "{{ github.sha }}" at /prompts/ci.md:3:7. A name matches
[A-Za-z_][A-Za-z0-9_]* with no inner whitespace. Write {{{{ to emit a literal {{.
```

`PromptRenderError` also carries `code`, `filePath`, `token`, `reason`, `guard`,
and the underlying `cause` for filesystem failures. For an option that is
wrong before any template exists (`text.maxBytes(0)`), `filePath` names the
factory instead of a file.

## Security Model

Values are untrusted data and are inserted verbatim. There is no injection
denylist. `text.plain`, `text.noFence` and `text.fencedBlock` are opt-in and
address byte-level and structural failures, not the meaning of a value: text
that instructs the model passes all of them. See [SECURITY.md](SECURITY.md).

To report a vulnerability, use GitHub Security Advisories, not a public issue.

## For LLMs

A machine-readable summary is maintained as [llms.txt](llms.txt), following
the [llms.txt](https://llmstxt.org) convention.

## License

[MIT](LICENSE)
