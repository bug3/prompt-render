import { describe, it, expect } from 'vitest';
import {
    describeDisallowed,
    findDisallowed,
    formatCodePoint,
    isWellFormed,
} from '../src/unicode';

describe('isWellFormed', () => {
    it('accepts paired surrogates and rejects lone ones', () => {
        expect(isWellFormed('plain')).toBe(true);
        expect(isWellFormed('emoji \u{1F600} ok')).toBe(true);
        expect(isWellFormed('a\uD800b')).toBe(false);
        expect(isWellFormed('a\uDC00')).toBe(false);
        expect(isWellFormed('😀')).toBe(true);
    });
});

describe('findDisallowed', () => {
    it('returns null for ordinary text, tabs, and newlines', () => {
        expect(findDisallowed('a\tb\nc  d')).toBeNull();
        expect(findDisallowed('türkçe \u{1F600} 中文')).toBeNull();
        expect(findDisallowed('emoji with VS16: ❤️')).toBeNull();
    });

    it('classifies control characters', () => {
        expect(findDisallowed('esc [31m red')).toEqual({
            kind: 'control',
            codePoint: 0x1b,
            index: 4,
        });
        expect(findDisallowed('cr \r here')?.kind).toBe('control');
        expect(findDisallowed('nul \0 here')?.kind).toBe('control');
    });

    it('classifies bidi controls (Trojan Source)', () => {
        const found = findDisallowed('if (admin) { ‮ return; }');
        expect(found?.kind).toBe('bidi');
        expect(found?.codePoint).toBe(0x202e);
        expect(findDisallowed('⁦isolate')?.kind).toBe('bidi');
    });

    it('classifies zero-width and invisible formatting', () => {
        expect(findDisallowed('zero​width')?.kind).toBe('invisible');
        expect(findDisallowed('joiner⁠here')?.kind).toBe('invisible');
        expect(findDisallowed('inner﻿bom')?.kind).toBe('invisible');
    });

    it('classifies Unicode tag characters (invisible instructions)', () => {
        const smuggled = `visible${String.fromCodePoint(0xe0041, 0xe0042)}`;
        const found = findDisallowed(smuggled);
        expect(found?.kind).toBe('tag');
        expect(found?.codePoint).toBe(0xe0041);
    });
});

describe('describeDisallowed / formatCodePoint', () => {
    it('names the code point without echoing the value', () => {
        expect(formatCodePoint(0x1b)).toBe('U+001B');
        expect(formatCodePoint(0xe0041)).toBe('U+E0041');
        expect(describeDisallowed({ kind: 'bidi', codePoint: 0x202e, index: 0 }))
            .toBe('contains a bidi control character (U+202E)');
        expect(describeDisallowed({ kind: 'tag', codePoint: 0xe0041, index: 0 }))
            .toBe('contains a Unicode tag character (U+E0041)');
        expect(describeDisallowed({ kind: 'control', codePoint: 0x1b, index: 0 }))
            .toBe('contains a control character (U+001B)');
        expect(describeDisallowed({ kind: 'invisible', codePoint: 0x200b, index: 0 }))
            .toBe('contains an invisible character (U+200B)');
    });
});
