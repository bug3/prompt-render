import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
    defineStringTemplate,
    defineTemplate,
    guard,
    PromptRenderError,
    text,
} from '../src/index';
import { fixture } from './helpers';

describe('guard.trailingNewline', () => {
    it('accepts exactly one trailing newline', () => {
        expect(guard.trailingNewline.validate('a\n')).toBe(true);
        expect(guard.trailingNewline.validate('a')).toBe(false);
        expect(guard.trailingNewline.validate('a\n\n')).toBe(false);
        expect(guard.trailingNewline.reason?.('a')).toBe('does not end with a newline');
        expect(guard.trailingNewline.reason?.('a\n\n')).toBe('ends with more than one newline');
    });

    it('rejects the template file at define time and names it', () => {
        const file = path.resolve(fixture('no-trailing-newline.md'));
        try {
            defineTemplate(fixture('no-trailing-newline.md'), { name: text.required }, {
                guards: [guard.trailingNewline],
            });
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('TEMPLATE_REJECTED');
            expect(error.guard).toBe('trailing-newline');
            expect(error.reason).toBe('does not end with a newline');
            expect(error.message).toContain(file);
        }
    });

    it('passes a well-formed file through', () => {
        const tmpl = defineTemplate(fixture('simple.md'), { name: text.required }, {
            guards: [guard.trailingNewline],
        });
        expect(tmpl({ name: 'Ada' }).markdown).toBe('Hello Ada.\n');
    });
});

describe('guard.noPattern', () => {
    it('rejects a template whose text matches the pattern', () => {
        const noVendor = guard.noPattern('no-vendor', /\bacme\b/i, 'names a vendor');
        try {
            defineStringTemplate('Use ACME to solve {{task}}\n', { task: text.required }, {
                label: 'vendor.md',
                guards: [noVendor],
            });
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('TEMPLATE_REJECTED');
            expect(error.guard).toBe('no-vendor');
            expect(error.reason).toBe('names a vendor');
            expect(error.filePath).toBe('vendor.md');
        }
    });

    it('falls back to naming the pattern', () => {
        const noTabs = guard.noPattern('no-tabs', /\t/);
        expect(() => defineStringTemplate('a\t{{v}}\n', { v: text.required }, {
            label: 'tabs.md',
            guards: [noTabs],
        })).toThrow('matches /\\t/');
    });

    it('refuses a stateful regex', () => {
        expect(() => guard.noPattern('g', /x/g)).toThrow(PromptRenderError);
        expect(() => guard.noPattern('y', /x/y)).toThrow('stateful regex');
        expect(() => guard.noPattern('', /x/)).toThrow('non-empty name');
    });
});

describe('guards option', () => {
    it('runs every guard in order and stops at the first failure', () => {
        const calls: string[] = [];
        const record = (name: string, ok: boolean) => ({
            name,
            validate: () => {
                calls.push(name);
                return ok;
            },
        });
        expect(() => defineStringTemplate('{{v}}\n', { v: text.required }, {
            label: 'order.md',
            guards: [record('first', true), record('second', false), record('third', true)],
        })).toThrow(PromptRenderError);
        expect(calls).toEqual(['first', 'second']);
    });

    it('runs before the placeholder scan, so a policy failure is not masked', () => {
        try {
            defineStringTemplate('{{ bad }}\n', {}, {
                label: 'both.md',
                guards: [guard.noPattern('no-bad', /bad/)],
            });
            expect.unreachable();
        } catch (err) {
            expect((err as PromptRenderError).code).toBe('TEMPLATE_REJECTED');
        }
    });

    it('refuses a malformed guard', () => {
        expect(() => defineStringTemplate('{{v}}\n', { v: text.required }, {
            label: 'bad-guard.md',
            guards: [{ name: 'x' } as never],
        })).toThrow('needs { name, validate(source) }');
    });

    it('is optional', () => {
        const tmpl = defineStringTemplate('{{v}}\n', { v: text.required }, { label: 'plain.md' });
        expect(tmpl({ v: 'ok' }).markdown).toBe('ok\n');
    });
});
