import { describe, it, expect } from 'vitest';
import { MdRenderError } from '../src/errors';
import { parseTemplate } from '../src/parse';

describe('parseTemplate', () => {
    it('returns no tokens for plain text', () => {
        const parsed = parseTemplate('hello { world }\n', 'plain.md');
        expect(parsed.tokens).toEqual([]);
        expect(parsed.segments).toEqual([{ type: 'lit', value: 'hello { world }\n' }]);
    });

    it('extracts unique tokens in first-appearance order', () => {
        const parsed = parseTemplate('{{b}} {{a}} {{b}}', 'dup.md');
        expect(parsed.tokens).toEqual(['b', 'a']);
    });

    it('treats {{{{ as a literal {{', () => {
        const parsed = parseTemplate('see {{{{task}} here {{task}}', 'esc.md');
        expect(parsed.tokens).toEqual(['task']);
        expect(parsed.segments).toEqual([
            { type: 'lit', value: 'see {{task}} here ' },
            { type: 'tok', name: 'task' },
        ]);
    });

    it('leaves single braces untouched next to a token', () => {
        const parsed = parseTemplate('{"n":{}} {{x}}', 'json.md');
        expect(parsed.tokens).toEqual(['x']);
        expect(parsed.segments[0]).toEqual({ type: 'lit', value: '{"n":{}} ' });
    });

    it('throws on inner whitespace', () => {
        expect(() => parseTemplate('{{ name }}', 'pad.md')).toThrow(MdRenderError);
        try {
            parseTemplate('{{ name }}', 'pad.md');
        } catch (err) {
            expect(err).toBeInstanceOf(MdRenderError);
            const error = err as MdRenderError;
            expect(error.code).toBe('MALFORMED_PLACEHOLDER');
            expect(error.filePath).toBe('pad.md');
            expect(error.message).toContain('pad.md');
        }
    });

    it('throws on an empty name', () => {
        expect(() => parseTemplate('{{}}', 'empty.md')).toThrow('Malformed placeholder');
    });

    it('throws on a name that does not match the pattern', () => {
        expect(() => parseTemplate('{{1x}}', 'bad.md')).toThrow('Malformed placeholder');
        expect(() => parseTemplate('{{foo-bar}}', 'bad.md')).toThrow('Malformed placeholder');
        expect(() => parseTemplate('{{{name}}}', 'bad.md')).toThrow('Malformed placeholder');
    });

    it('reports line and column, and points at the escape hatch', () => {
        try {
            parseTemplate('line one\nline two\nrun: ${{ github.sha }}\n', 'ci.md');
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('MALFORMED_PLACEHOLDER');
            expect(error.line).toBe(3);
            expect(error.column).toBe(7);
            expect(error.message).toContain('ci.md:3:7');
            expect(error.message).toContain('Write {{{{ to emit a literal {{.');
        }
    });

    it('refuses __proto__ as a placeholder name', () => {
        try {
            parseTemplate('a {{__proto__}}', 'proto.md');
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('RESERVED_PLACEHOLDER');
            expect(error.token).toBe('__proto__');
            expect(error.message).toContain('proto.md:1:3');
        }
    });

    it('allows other Object.prototype member names', () => {
        const parsed = parseTemplate('{{constructor}} {{toString}}', 'proto.md');
        expect(parsed.tokens).toEqual(['constructor', 'toString']);
    });

    it('throws on an unclosed placeholder and does not dump the rest of the file', () => {
        const rest = 'x'.repeat(200);
        try {
            parseTemplate(`{{task${rest}`, 'open.md');
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('MALFORMED_PLACEHOLDER');
            expect(error.message).toContain('open.md');
            expect(error.message).toContain('Unclosed');
            expect(error.message).not.toContain(rest);
        }
    });
});
