import { describe, it, expect } from 'vitest';
import { parseTemplate } from '../src/parse';
import { render } from '../src/render';

describe('render', () => {
    it('replaces tokens and concatenates with join', () => {
        const parsed = parseTemplate('A {{x}} B {{y}} C', 'r.md');
        expect(render(parsed.segments, { x: '1', y: '2' })).toBe('A 1 B 2 C');
    });

    it('replaces every occurrence of a duplicate token', () => {
        const parsed = parseTemplate('{{n}}/{{n}}', 'r.md');
        expect(render(parsed.segments, { n: 'z' })).toBe('z/z');
    });

    it('inserts $ sequences in values as literals', () => {
        const parsed = parseTemplate('{{a}} {{b}} {{c}}', 'r.md');
        expect(render(parsed.segments, { a: '$&', b: '$$', c: "$'" })).toBe("$& $$ $'");
    });

    it('does not rescan values for placeholders', () => {
        const parsed = parseTemplate('X {{body}} Y', 'r.md');
        expect(render(parsed.segments, { body: 'see {{secret}}' })).toBe('X see {{secret}} Y');
    });

    it('returns an empty string for an empty parse', () => {
        expect(render([], {})).toBe('');
    });
});
