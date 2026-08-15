import { describe, it, expect } from 'vitest';
import {
    allOf,
    defineStringTemplate,
    defineType,
    PromptRenderError,
    text,
} from '../src/index';

const define = (source: string, schema: Parameters<typeof defineStringTemplate>[1]) => (
    defineStringTemplate(source, schema, { label: 'd.md' })
);

describe('text.plain', () => {
    it('accepts ordinary prose, tabs, and newlines', () => {
        expect(text.plain.validate('a\tb\nc')).toBe(true);
        expect(text.plain.validate('görev: 42 \u{1F600}')).toBe(true);
    });

    it('rejects bidi, invisible, tag, and control characters', () => {
        expect(text.plain.validate('admin ‮ evil')).toBe(false);
        expect(text.plain.reason?.('admin ‮ evil')).toBe('contains a bidi control character (U+202E)');
        expect(text.plain.validate(`hi${String.fromCodePoint(0xe0041)}`)).toBe(false);
        expect(text.plain.reason?.(`hi${String.fromCodePoint(0xe0041)}`))
            .toBe('contains a Unicode tag character (U+E0041)');
        expect(text.plain.validate('ansi [31m')).toBe(false);
        expect(text.plain.validate('zero​width')).toBe(false);
        expect(text.plain.reason?.('')).toBe('empty string');
    });

    it('does not echo the value in the reason', () => {
        const secret = `SECRET${String.fromCodePoint(0xe0041)}`;
        expect(text.plain.reason?.(secret)).not.toContain('SECRET');
    });
});

describe('text.noFence', () => {
    it('rejects a value that could close a fence written in the template', () => {
        expect(text.noFence.validate('no fences here')).toBe(true);
        expect(text.noFence.validate('inline `code` and ``double``')).toBe(true);
        expect(text.noFence.validate('```js\nbreakout\n```')).toBe(false);
        expect(text.noFence.reason?.('```')).toBe('contains a backtick fence (3 or more backticks)');
    });
});

describe('text.maxBytes / text.maxChars', () => {
    it('measures UTF-8 bytes, not characters', () => {
        const desc = text.maxBytes(4);
        expect(desc.validate('abcd')).toBe(true);
        expect(desc.validate('abcde')).toBe(false);
        expect(desc.validate('é'.repeat(2))).toBe(true);
        expect(desc.validate('é'.repeat(3))).toBe(false);
        expect(desc.reason?.('abcde')).toBe('exceeds 4 bytes (5)');
    });

    it('measures UTF-16 code units for maxChars', () => {
        const desc = text.maxChars(3);
        expect(desc.validate('ééé')).toBe(true);
        expect(desc.validate('abcd')).toBe(false);
        expect(desc.reason?.('abcd')).toBe('exceeds 3 characters (4)');
    });

    it('refuses a nonsense limit at construction time', () => {
        expect(() => text.maxBytes(0)).toThrow(PromptRenderError);
        expect(() => text.maxChars(-1)).toThrow(PromptRenderError);
        expect(() => text.maxBytes(1.5)).toThrow('positive integer');
    });
});

describe('text.fencedBlock', () => {
    it('wraps in a fence longer than the longest run inside the value', () => {
        const tmpl = define('Peer package:\n\n{{peer}}\n', { peer: text.fencedBlock() });
        const value = 'outer\n```js\nnested\n```\ndone';
        expect(tmpl({ peer: value }).markdown).toBe(
            'Peer package:\n\n````\nouter\n```js\nnested\n```\ndone\n````\n',
        );
    });

    it('keeps the minimum fence at three backticks and writes the lang', () => {
        const tmpl = define('{{body}}', { body: text.fencedBlock({ lang: 'json' }) });
        expect(tmpl({ body: '{"a":1}' }).markdown).toBe('```json\n{"a":1}\n```');
    });

    it('does not add a second trailing newline', () => {
        const tmpl = define('{{body}}', { body: text.fencedBlock() });
        expect(tmpl({ body: 'x\n' }).markdown).toBe('```\nx\n```');
    });

    it('never rewrites the value itself', () => {
        const tmpl = define('{{body}}', { body: text.fencedBlock() });
        const value = '  indented\t{{token}}\n\n  kept  ';
        expect(tmpl({ body: value }).markdown).toContain(value);
    });

    it('refuses an invalid lang at construction time', () => {
        expect(() => text.fencedBlock({ lang: 'js fake' })).toThrow(PromptRenderError);
        expect(() => text.fencedBlock({ lang: '```' })).toThrow('fencedBlock');
    });
});

describe('allOf', () => {
    it('requires every descriptor and reports the first failure', () => {
        const desc = allOf(text.line, text.plain, text.maxBytes(10));
        expect(desc.validate('short line')).toBe(true);
        expect(desc.validate('two\nlines')).toBe(false);
        expect(desc.reason?.('two\nlines')).toBe('contains a newline');
        expect(desc.reason?.('way too long to fit')).toBe('exceeds 10 bytes (19)');
    });

    it('chains formats in argument order', () => {
        const suffix = defineType<string>({
            validate: (val) => typeof val === 'string',
            format: (val) => `${String(val)}!`,
        });
        const desc = allOf(text.required, suffix, text.fencedBlock({ lang: 'txt' }));
        const tmpl = define('{{v}}', { v: desc });
        expect(tmpl({ v: 'hi' }).markdown).toBe('```txt\nhi!\n```');
    });

    it('omits format when no member formats', () => {
        expect(allOf(text.required, text.line).format).toBeUndefined();
    });

    it('refuses an empty or malformed list', () => {
        expect(() => allOf()).toThrow(PromptRenderError);
        expect(() => allOf({ nope: true } as never)).toThrow('validate');
    });
});

describe('defineType', () => {
    it('is identity at runtime and keeps the descriptor usable', () => {
        const noVendor = defineType<string>({
            validate: (val) => typeof val === 'string' && !/\bacme\b/i.test(val),
            reason: () => 'contains a vendor name',
        });
        const tmpl = define('{{v}}', { v: noVendor });
        expect(tmpl({ v: 'clean text' }).markdown).toBe('clean text');
        expect(() => tmpl({ v: 'use ACME' })).toThrow('contains a vendor name');
    });
});
