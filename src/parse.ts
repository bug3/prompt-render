import { fail } from './errors';

export interface LiteralSegment {
    readonly type: 'lit';
    readonly value: string;
}

export interface TokenSegment {
    readonly type: 'tok';
    readonly name: string;
}

export type Segment = LiteralSegment | TokenSegment;

export interface ParsedTemplate {
    readonly segments: Segment[];
    readonly tokens: string[];
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_NAMES = new Set(['__proto__']);
const EXCERPT_MAX = 40;
const HATCH_HINT = 'Write {{{{ to emit a literal {{.';

function excerpt(text: string): string {
    if (text.length <= EXCERPT_MAX) return text;
    const code = text.charCodeAt(EXCERPT_MAX - 1);
    // Never cut a surrogate pair in half.
    const end = code >= 0xd800 && code <= 0xdbff ? EXCERPT_MAX - 1 : EXCERPT_MAX;
    return `${text.slice(0, end)}...`;
}

function positionOf(source: string, index: number): { line: number; column: number } {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < index; i += 1) {
        if (source.charCodeAt(i) === 10) {
            line += 1;
            lineStart = i + 1;
        }
    }
    return { line, column: index - lineStart + 1 };
}

function pushLiteral(segments: Segment[], value: string): void {
    if (value.length === 0) return;
    const last = segments[segments.length - 1];
    if (last?.type === 'lit') {
        segments[segments.length - 1] = { type: 'lit', value: last.value + value };
        return;
    }
    segments.push({ type: 'lit', value });
}

export function parseTemplate(source: string, filePath: string): ParsedTemplate {
    const segments: Segment[] = [];
    const seen = new Set<string>();
    const tokens: string[] = [];
    let i = 0;

    while (i < source.length) {
        if (source.startsWith('{{{{', i)) {
            pushLiteral(segments, '{{');
            i += 4;
            continue;
        }

        if (source.startsWith('{{', i)) {
            const at = positionOf(source, i);
            const where = `${filePath}:${at.line}:${at.column}`;
            const close = source.indexOf('}}', i + 2);
            if (close === -1) {
                fail(
                    'MALFORMED_PLACEHOLDER',
                    filePath,
                    `Unclosed placeholder at ${where}: "${excerpt(source.slice(i, i + EXCERPT_MAX + 1))}". ${HATCH_HINT}`,
                    { ...at },
                );
            }

            const inner = source.slice(i + 2, close);
            if (!NAME_RE.test(inner)) {
                fail(
                    'MALFORMED_PLACEHOLDER',
                    filePath,
                    `Malformed placeholder "{{${excerpt(inner)}}}" at ${where}. `
                    + `A name matches [A-Za-z_][A-Za-z0-9_]* with no inner whitespace. ${HATCH_HINT}`,
                    { token: inner.length > 0 ? excerpt(inner) : undefined, ...at },
                );
            }
            if (RESERVED_NAMES.has(inner)) {
                fail(
                    'RESERVED_PLACEHOLDER',
                    filePath,
                    `Reserved placeholder name "{{${inner}}}" at ${where}. `
                    + 'This name cannot be carried safely through a parameter object.',
                    { token: inner, ...at },
                );
            }

            segments.push({ type: 'tok', name: inner });
            if (!seen.has(inner)) {
                seen.add(inner);
                tokens.push(inner);
            }
            i = close + 2;
            continue;
        }

        const next = source.indexOf('{{', i);
        if (next === -1) {
            pushLiteral(segments, source.slice(i));
            break;
        }
        pushLiteral(segments, source.slice(i, next));
        i = next;
    }

    return { segments, tokens };
}
