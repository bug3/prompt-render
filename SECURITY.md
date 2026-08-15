# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately via
[GitHub Security Advisories](https://github.com/bug3/md-render/security/advisories/new).

Do not open a public issue for security vulnerabilities.

## Security Model

md-render inserts parameter values byte for byte. There is no denylist and no
escaping. That is required: a prompt renderer that mangles the caller's text
is broken.

The template file is trusted configuration. Values are untrusted data. This
package does not try to stop prompt injection inside a value. Callers that
forward rendered text to a model must frame values as data, the way MAGI
already does for candidate trees.

Some descriptors are opt-in and narrow the bytes a value may carry. They are
not injection defences:

- `text.plain` refuses control characters, bidi controls (Trojan Source),
  zero-width and invisible formatting, and Unicode tag characters. These are
  the sequences that change what a model reads without changing what a
  reviewer sees.
- `text.noFence` refuses a value that could close a fence written in the
  template. `text.fencedBlock` instead frames the value in a fence longer than
  any run inside it, so the value cannot end its own block.
- `text.maxBytes` / `text.maxChars` cap a value before it reaches a model.

A value that reads as an instruction in plain ASCII passes all of them. Do not
treat a rendered prompt as trusted because it validated.

Unpaired surrogates are refused everywhere, including in the output of a
custom `format`. Not as a policy: UTF-8 cannot carry them, so the bytes that
would be sealed would not be the text that was rendered.

Validation errors name the parameter and the reason. They never echo the
value: values can be large and can carry content the caller would rather not
see in logs.
