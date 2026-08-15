import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
    defineStringTemplate,
    defineTemplate,
    MdRenderError,
    text,
} from '../src/index';
import { fixture } from './helpers';

describe('defineTemplate', () => {
    it('binds at define time and renders verbatim', () => {
        const greet = defineTemplate(fixture('simple.md'), {
            name: text.required,
        });
        const { markdown } = greet({ name: 'Ada' });
        expect(markdown).toBe('Hello Ada.\n');
        expect(greet.path).toBe(path.resolve(fixture('simple.md')));
        expect(greet.tokens).toEqual(['name']);
        expect(greet.digest).toBe(
            createHash('sha256').update(fs.readFileSync(fixture('simple.md'))).digest('hex'),
        );
    });

    it('throws UNKNOWN_PLACEHOLDER when the schema omits a token', () => {
        try {
            defineTemplate(fixture('simple.md'), {});
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('UNKNOWN_PLACEHOLDER');
            expect(error.token).toBe('name');
            expect(error.message).toContain(path.resolve(fixture('simple.md')));
        }
    });

    it('throws UNUSED_PARAMETER when the schema has a dead key', () => {
        try {
            defineTemplate(fixture('simple.md'), {
                name: text.required,
                extra: text.required,
            });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('UNUSED_PARAMETER');
            expect(error.token).toBe('extra');
            expect(error.message).toContain(path.resolve(fixture('simple.md')));
        }
    });

    it('throws INVALID_DESCRIPTOR when validate is missing', () => {
        try {
            defineTemplate(fixture('simple.md'), {
                name: { foo: true } as never,
            });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('INVALID_DESCRIPTOR');
            expect(error.message).toContain('validate');
            expect(error.message).toContain(path.resolve(fixture('simple.md')));
        }
    });

    it('throws INVALID_VALUE without echoing the value', () => {
        const greet = defineTemplate(fixture('simple.md'), {
            name: text.required,
        });
        const secret = 'SUPER_SECRET_VALUE_DO_NOT_LOG';
        try {
            greet({ name: '' });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('INVALID_VALUE');
            expect(error.token).toBe('name');
            expect(error.reason).toBe('empty string');
            expect(error.message).toContain(path.resolve(fixture('simple.md')));
        }

        const noSecret = {
            validate: (val: unknown) => val !== secret,
            reason: () => 'rejected by policy',
        };
        const guarded = defineTemplate(fixture('simple.md'), { name: noSecret });
        try {
            guarded({ name: secret });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.message).not.toContain(secret);
            expect(error.reason).toBe('rejected by policy');
        }
    });

    it('does not call format when validate fails', () => {
        let formatted = false;
        const desc = {
            validate: () => false,
            format: () => {
                formatted = true;
                return 'x';
            },
            reason: () => 'nope',
        };
        const greet = defineTemplate(fixture('simple.md'), { name: desc });
        expect(() => greet({ name: 'Ada' })).toThrow(MdRenderError);
        expect(formatted).toBe(false);
    });

    it('applies format after a successful validate', () => {
        const desc = {
            validate: (val: unknown) => typeof val === 'string' && val.length > 0,
            format: (val: unknown) => `${String(val).trim()}\n`,
        };
        const greet = defineTemplate(fixture('simple.md'), { name: desc });
        expect(greet({ name: '  Ada  ' }).markdown).toBe('Hello Ada\n.\n');
    });

    it('throws on extra runtime params and names the file', () => {
        const greet = defineTemplate(fixture('simple.md'), {
            name: text.required,
        });
        try {
            greet({ name: 'Ada', extra: 'x' } as { name: string });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('UNUSED_PARAMETER');
            expect(error.message).toContain(path.resolve(fixture('simple.md')));
        }
    });

    it('throws on missing runtime params and names the file', () => {
        const greet = defineTemplate(fixture('simple.md'), {
            name: text.required,
        });
        try {
            greet({} as { name: string });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('INVALID_VALUE');
            expect(error.reason).toBe('missing parameter');
            expect(error.message).toContain(path.resolve(fixture('simple.md')));
        }
    });
});

describe('defineTemplate params', () => {
    it('throws INVALID_PARAMS instead of a raw TypeError', () => {
        const greet = defineTemplate(fixture('simple.md'), { name: text.required });
        for (const bad of [null, undefined, 'Ada', 42]) {
            try {
                (greet as (params: unknown) => unknown)(bad);
                expect.unreachable();
            } catch (err) {
                const error = err as MdRenderError;
                expect(error).toBeInstanceOf(MdRenderError);
                expect(error.code).toBe('INVALID_PARAMS');
                expect(error.message).toContain(path.resolve(fixture('simple.md')));
            }
        }
    });
});

describe('defineStringTemplate', () => {
    it('uses the label in errors and hashes the source bytes', () => {
        const source = 'Hi {{name}}\n';
        const greet = defineStringTemplate(source, { name: text.line }, { label: 'greet.md' });
        expect(greet.path).toBe('greet.md');
        expect(greet.digest).toBe(
            createHash('sha256').update(Buffer.from(source, 'utf8')).digest('hex'),
        );
        expect(greet({ name: 'Ada' }).markdown).toBe('Hi Ada\n');
    });

    it('refuses a leading BOM in the source string', () => {
        try {
            defineStringTemplate('\uFEFFhi {{n}}', { n: text.required }, { label: 'bom.md' });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('BOM_REFUSED');
            expect(error.filePath).toBe('bom.md');
        }
    });

    it('refuses CR in the source string', () => {
        try {
            defineStringTemplate('a\r\n{{n}}', { n: text.required }, { label: 'cr.md' });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('CRLF_REFUSED');
            expect(error.filePath).toBe('cr.md');
        }
    });

    it('refuses an empty label and a non-string source', () => {
        try {
            defineStringTemplate('{{n}}', { n: text.required }, { label: '' });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('INVALID_OPTIONS');
            expect(error.message).toContain('non-empty label');
        }

        expect(() => defineStringTemplate(
            42 as unknown as string,
            { n: text.required },
            { label: 'num.md' },
        )).toThrow('needs a string source');
    });

    it('refuses a source with an unpaired surrogate', () => {
        try {
            defineStringTemplate('a\uD800 {{n}}', { n: text.required }, { label: 'sur.md' });
            expect.unreachable();
        } catch (err) {
            const error = err as MdRenderError;
            expect(error.code).toBe('INVALID_ENCODING');
            expect(error.message).toContain('sur.md');
        }
    });

    it('rejects a multi-line value for text.line', () => {
        const greet = defineStringTemplate('{{name}}', { name: text.line }, { label: 'line.md' });
        expect(() => greet({ name: 'a\nb' })).toThrow('contains a newline');
    });

    it('rejects a relative path for text.absolutePath', () => {
        const tmpl = defineStringTemplate(
            '{{out}}',
            { out: text.absolutePath },
            { label: 'path.md' },
        );
        expect(() => tmpl({ out: 'relative/out' })).toThrow('not an absolute path');
    });
});
