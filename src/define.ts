import { digestSource } from './digest';
import { fail } from './errors';
import { assertSourceBytes, loadTemplateFile } from './load';
import { parseTemplate } from './parse';
import { makeResult, render } from './render';
import type {
    InferParams,
    SchemaDefinition,
    StringTemplateOptions,
    TemplateFn,
    TemplateGuard,
    TemplateOptions,
    TypeDescriptor,
} from './types';
import { isWellFormed } from './unicode';

function formatList(names: readonly string[]): string {
    return `[${names.join(', ')}]`;
}

function runGuards(
    source: string,
    filePath: string,
    guards: readonly TemplateGuard[] | undefined,
): void {
    if (guards === undefined) return;
    if (!Array.isArray(guards)) {
        fail('INVALID_OPTIONS', filePath, `guards must be an array in ${filePath}`);
    }

    for (const guard of guards) {
        if (typeof guard?.validate !== 'function' || typeof guard.name !== 'string') {
            fail(
                'INVALID_OPTIONS',
                filePath,
                `Invalid guard for ${filePath}: needs { name, validate(source) }`,
            );
        }
        if (!guard.validate(source)) {
            const reason = guard.reason?.(source) ?? 'guard failed';
            fail(
                'TEMPLATE_REJECTED',
                filePath,
                `Template rejected by guard '${guard.name}' in ${filePath}: ${reason}`,
                { guard: guard.name, reason },
            );
        }
    }
}

function bind<S extends SchemaDefinition>(
    source: string,
    schemaDef: S,
    filePath: string,
    digest: string,
    options: TemplateOptions | undefined,
): TemplateFn<S> {
    const schemaKeys = Object.keys(schemaDef);

    for (const key of schemaKeys) {
        const desc = schemaDef[key];
        if (!desc || typeof desc.validate !== 'function') {
            fail(
                'INVALID_DESCRIPTOR',
                filePath,
                `Invalid schema descriptor for '${key}' in ${filePath}: must have a validate(val) method`,
                { token: key },
            );
        }
    }

    runGuards(source, filePath, options?.guards);

    const { segments, tokens } = parseTemplate(source, filePath);

    const missingInSchema = tokens.filter((token) => !schemaKeys.includes(token));
    if (missingInSchema.length > 0) {
        fail(
            'UNKNOWN_PLACEHOLDER',
            filePath,
            `Unknown placeholder(s) in ${filePath}: ${formatList(missingInSchema)}`,
            { token: missingInSchema[0] },
        );
    }

    const extraInSchema = schemaKeys.filter((key) => !tokens.includes(key));
    if (extraInSchema.length > 0) {
        fail(
            'UNUSED_PARAMETER',
            filePath,
            `Unused parameter(s) in ${filePath}: ${formatList(extraInSchema)}`,
            { token: extraInSchema[0] },
        );
    }

    const fn = ((params: InferParams<S>) => {
        if (params === null || typeof params !== 'object') {
            fail(
                'INVALID_PARAMS',
                filePath,
                `Parameters for ${filePath} must be an object, got ${params === null ? 'null' : typeof params}`,
            );
        }

        const bag = params as Record<string, unknown>;
        const paramKeys = Object.keys(bag);

        const missing = tokens.filter((token) => !Object.hasOwn(bag, token));
        if (missing.length > 0) {
            fail(
                'INVALID_VALUE',
                filePath,
                `Validation failed for '${missing[0]}' in ${filePath}: missing parameter`,
                { token: missing[0], reason: 'missing parameter' },
            );
        }

        const extra = paramKeys.filter((key) => !tokens.includes(key));
        if (extra.length > 0) {
            fail(
                'UNUSED_PARAMETER',
                filePath,
                `Unused parameter(s) in ${filePath}: ${formatList(extra)}`,
                { token: extra[0] },
            );
        }

        // Null prototype: a token named like an Object.prototype member must
        // still round-trip its own value.
        const values = Object.create(null) as Record<string, string>;
        for (const key of tokens) {
            const value = bag[key];
            const desc = schemaDef[key] as TypeDescriptor;
            if (!desc.validate(value)) {
                const reason = desc.reason?.(value) ?? 'validation failed';
                fail(
                    'INVALID_VALUE',
                    filePath,
                    `Validation failed for '${key}' in ${filePath}: ${reason}`,
                    { token: key, reason },
                );
            }
            const formatted = String(desc.format ? desc.format(value) : value);
            // The bytes are sealed and hashed: what cannot survive a UTF-8
            // round trip cannot be rendered, whoever wrote the descriptor.
            if (!isWellFormed(formatted)) {
                const reason = 'contains an unpaired surrogate';
                fail(
                    'INVALID_VALUE',
                    filePath,
                    `Validation failed for '${key}' in ${filePath}: ${reason}`,
                    { token: key, reason },
                );
            }
            values[key] = formatted;
        }

        return makeResult(render(segments, values));
    }) as TemplateFn<S>;

    Object.defineProperties(fn, {
        path: { value: filePath, enumerable: true },
        digest: { value: digest, enumerable: true },
        tokens: { value: Object.freeze([...tokens]), enumerable: true },
    });

    return fn;
}

export function defineTemplate<S extends SchemaDefinition>(
    filePath: string,
    schemaDef: S,
    options?: TemplateOptions,
): TemplateFn<S> {
    const loaded = loadTemplateFile(filePath);
    return bind(loaded.source, schemaDef, loaded.path, loaded.digest, options);
}

export function defineStringTemplate<S extends SchemaDefinition>(
    source: string,
    schemaDef: S,
    options: StringTemplateOptions,
): TemplateFn<S> {
    const label = options?.label;
    if (typeof label !== 'string' || label.length === 0) {
        fail(
            'INVALID_OPTIONS',
            'defineStringTemplate',
            'defineStringTemplate() needs a non-empty label: it is what errors name',
        );
    }
    if (typeof source !== 'string') {
        fail(
            'INVALID_OPTIONS',
            label,
            `defineStringTemplate() needs a string source for ${label}, got ${typeof source}`,
        );
    }
    assertSourceBytes(source, label);
    return bind(source, schemaDef, label, digestSource(source), options);
}
