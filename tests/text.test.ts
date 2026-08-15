import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { text } from '../src/text';

describe('text.required / text.block', () => {
    it('accepts non-empty strings, including newlines', () => {
        expect(text.required.validate('ok')).toBe(true);
        expect(text.required.validate('a\nb')).toBe(true);
        expect(text.block.validate('a\nb')).toBe(true);
    });

    it('rejects an unpaired surrogate, which UTF-8 cannot carry', () => {
        expect(text.required.validate('a\uD800b')).toBe(false);
        expect(text.block.validate('\uDC00')).toBe(false);
        expect(text.line.validate('a\uD800')).toBe(false);
        expect(text.required.validate('a\u{1F600}b')).toBe(true);
        expect(text.required.reason?.('a\uD800b')).toBe('contains an unpaired surrogate');
    });

    it('rejects empty, null, non-strings, and NUL', () => {
        expect(text.required.validate('')).toBe(false);
        expect(text.required.validate(null)).toBe(false);
        expect(text.required.validate(undefined)).toBe(false);
        expect(text.required.validate(1)).toBe(false);
        expect(text.required.validate('a\0b')).toBe(false);
        expect(text.required.reason?.('')).toBe('empty string');
        expect(text.required.reason?.(null)).toBe('value is null');
        expect(text.required.reason?.(1)).toBe('expected a string, got number');
        expect(text.required.reason?.('a\0b')).toBe('contains a NUL byte');
    });
});

describe('text.line', () => {
    it('rejects any newline', () => {
        expect(text.line.validate('ok')).toBe(true);
        expect(text.line.validate('a\nb')).toBe(false);
        expect(text.line.validate('a\rb')).toBe(false);
        expect(text.line.reason?.('a\nb')).toBe('contains a newline');
    });
});

describe('text.absolutePath', () => {
    it('accepts host-absolute paths only', () => {
        expect(text.absolutePath.validate(path.resolve('/tmp/out'))).toBe(true);
        expect(text.absolutePath.validate('relative/out')).toBe(false);
        expect(text.absolutePath.reason?.('relative/out')).toBe('not an absolute path');
    });
});
