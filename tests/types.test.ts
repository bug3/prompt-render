import { describe, it, expect, expectTypeOf } from 'vitest';
import {
    defineStringTemplate,
    defineType,
    text,
    type InferParams,
    type TemplateResult,
} from '../src/index';

const schema = {
    task: text.required,
    outputDir: text.absolutePath,
    count: defineType<number>({
        validate: (val) => typeof val === 'number' && Number.isFinite(val),
        format: (val) => String(val),
    }),
};

const tmpl = defineStringTemplate(
    '{{task}} {{outputDir}} {{count}}',
    schema,
    { label: 'types.md' },
);

describe('type contract', () => {
    it('infers a parameter type per descriptor', () => {
        expectTypeOf<InferParams<typeof schema>>().toEqualTypeOf<{
            task: string;
            outputDir: string;
            count: number;
        }>();
    });

    it('types the result fields', () => {
        expectTypeOf(tmpl).returns.toEqualTypeOf<TemplateResult>();
        expectTypeOf(tmpl({ task: 't', outputDir: '/tmp', count: 1 })).toEqualTypeOf<TemplateResult>();
        expectTypeOf<TemplateResult['markdown']>().toEqualTypeOf<string>();
        expectTypeOf<TemplateResult['digest']>().toEqualTypeOf<string>();
        expectTypeOf<TemplateResult['bytes']>().toEqualTypeOf<number>();
        expectTypeOf(tmpl.path).toEqualTypeOf<string>();
        expectTypeOf(tmpl.digest).toEqualTypeOf<string>();
        expectTypeOf(tmpl.tokens).toEqualTypeOf<readonly string[]>();
    });

    // Never called: `tsc --noEmit` fails if any of these stops being an error.
    const compileOnly = (): void => {
        // @ts-expect-error misspelled parameter
        tmpl({ tsak: 't', outputDir: '/tmp', count: 1 });
        // @ts-expect-error missing parameter
        tmpl({ task: 't', outputDir: '/tmp' });
        // @ts-expect-error extra parameter
        tmpl({ task: 't', outputDir: '/tmp', count: 1, extra: 'x' });
        // @ts-expect-error wrong value type
        tmpl({ task: 42, outputDir: '/tmp', count: 1 });
        // @ts-expect-error no parameters at all
        tmpl();
        // @ts-expect-error the result is read-only
        tmpl({ task: 't', outputDir: '/tmp', count: 1 }).markdown = 'x';
        // @ts-expect-error the bound file is read-only
        tmpl.digest = 'x';
    };

    it('keeps the compile-time checks in the build', () => {
        expect(typeof compileOnly).toBe('function');
    });
});
