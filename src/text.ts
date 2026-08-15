import path from 'node:path';
import { fail } from './errors';
import type { TypeDescriptor } from './types';
import { describeDisallowed, findDisallowed, isWellFormed } from './unicode';

const BACKTICK = 96;
const MIN_FENCE = 3;
const FENCE_RE = /`{3,}/;
const LANG_RE = /^[A-Za-z0-9_+#.-]*$/;

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function hasNul(value: string): boolean {
    return value.includes('\0');
}

/**
 * The floor every built-in stands on: a non-empty string whose UTF-16 is well
 * formed, so the rendered string survives a UTF-8 round trip byte for byte.
 */
function isText(value: unknown): value is string {
    return isString(value)
        && value.length > 0
        && !hasNul(value)
        && isWellFormed(value);
}

function textReason(value: unknown): string {
    if (value === null) return 'value is null';
    if (value === undefined) return 'value is undefined';
    if (!isString(value)) return `expected a string, got ${typeof value}`;
    if (value.length === 0) return 'empty string';
    if (hasNul(value)) return 'contains a NUL byte';
    if (!isWellFormed(value)) return 'contains an unpaired surrogate';
    return 'invalid value';
}

function descriptor(
    validate: (value: unknown) => boolean,
    reason: (value: unknown) => string,
): TypeDescriptor<string> {
    return { validate, reason };
}

function assertPositiveInteger(limit: number, factory: string): void {
    if (!Number.isInteger(limit) || limit <= 0) {
        fail(
            'INVALID_OPTIONS',
            factory,
            `${factory}() needs a positive integer limit, got ${String(limit)}`,
        );
    }
}

function longestBacktickRun(value: string): number {
    let longest = 0;
    let run = 0;
    for (let i = 0; i < value.length; i += 1) {
        if (value.charCodeAt(i) === BACKTICK) {
            run += 1;
            if (run > longest) longest = run;
        } else {
            run = 0;
        }
    }
    return longest;
}

export interface FenceOptions {
    /** Info string after the opening fence. Default: none. */
    readonly lang?: string;
}

/**
 * Non-empty text. Newlines allowed. Inserted verbatim.
 */
const required = descriptor(isText, textReason);

/**
 * Same rule as `required`. The name marks a large multi-line insert at the
 * call site.
 */
const block = descriptor(isText, textReason);

/**
 * Single line: no LF, no CR.
 */
const line = descriptor(
    (value) => isText(value) && !value.includes('\n') && !value.includes('\r'),
    (value) => (isText(value) ? 'contains a newline' : textReason(value)),
);

/**
 * Absolute per the host `path` implementation.
 */
const absolutePath = descriptor(
    (value) => isText(value) && path.isAbsolute(value),
    (value) => (isText(value) ? 'not an absolute path' : textReason(value)),
);

/**
 * Text with no control characters (other than tab and newline), no bidi
 * controls, no zero-width or invisible formatting, and no Unicode tag
 * characters. Opt in when a value reaches a terminal, a diff, or a model and
 * an invisible character would change what a reader sees.
 */
const plain = descriptor(
    (value) => isText(value) && findDisallowed(value) === null,
    (value) => {
        if (!isText(value)) return textReason(value);
        const found = findDisallowed(value);
        return found === null ? 'invalid value' : describeDisallowed(found);
    },
);

/**
 * Text that cannot close a backtick fence written in the template file.
 */
const noFence = descriptor(
    (value) => isText(value) && !FENCE_RE.test(value),
    (value) => (isText(value) ? 'contains a backtick fence (3 or more backticks)' : textReason(value)),
);

/**
 * Caps the UTF-8 size of a value. The reason names the sizes, never the value.
 */
function maxBytes(limit: number): TypeDescriptor<string> {
    assertPositiveInteger(limit, 'text.maxBytes');
    return descriptor(
        (value) => isText(value) && Buffer.byteLength(value, 'utf8') <= limit,
        (value) => (isText(value)
            ? `exceeds ${limit} bytes (${Buffer.byteLength(value, 'utf8')})`
            : textReason(value)),
    );
}

/**
 * Caps the length in UTF-16 code units, the same unit as `String.length`.
 */
function maxChars(limit: number): TypeDescriptor<string> {
    assertPositiveInteger(limit, 'text.maxChars');
    return descriptor(
        (value) => isText(value) && value.length <= limit,
        (value) => (isText(value) ? `exceeds ${limit} characters (${value.length})` : textReason(value)),
    );
}

/**
 * The one descriptor that adds bytes, and only because the caller asked for a
 * frame. The opening fence is one backtick longer than the longest backtick
 * run inside the value, so the value cannot close its own block. The value
 * itself is untouched: no escaping, no re-indentation, no trimming. A single
 * trailing newline is added only when the value lacks one, so the closing
 * fence starts its own line.
 */
function fencedBlock(options: FenceOptions = {}): TypeDescriptor<string> {
    const lang = options.lang ?? '';
    if (!LANG_RE.test(lang)) {
        fail(
            'INVALID_OPTIONS',
            'text.fencedBlock',
            `text.fencedBlock() needs a lang matching ${String(LANG_RE)}, got "${lang}"`,
        );
    }

    return {
        validate: isText,
        reason: textReason,
        format: (value) => {
            const body = String(value);
            const fence = '`'.repeat(Math.max(MIN_FENCE, longestBacktickRun(body) + 1));
            const tail = body.endsWith('\n') ? '' : '\n';
            return `${fence}${lang}\n${body}${tail}${fence}`;
        },
    };
}

export const text = {
    required,
    block,
    line,
    absolutePath,
    plain,
    noFence,
    maxBytes,
    maxChars,
    fencedBlock,
};
