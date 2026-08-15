import { fail } from './errors';
import type { TypeDescriptor } from './types';

/**
 * Identity at runtime. It exists so a custom descriptor carries a parameter
 * type: without it, `InferParams` widens a hand-written descriptor to
 * `unknown` and the call site loses its compile-time check.
 */
export function defineType<T = string>(descriptor: TypeDescriptor<T>): TypeDescriptor<T> {
    return descriptor;
}

/**
 * Every descriptor validates the original value. `format` steps then run in
 * argument order, each seeing the previous step's output.
 */
export function allOf<T>(...descriptors: readonly TypeDescriptor<T>[]): TypeDescriptor<T> {
    if (descriptors.length === 0) {
        fail('INVALID_OPTIONS', 'allOf', 'allOf() needs at least one descriptor');
    }
    for (const descriptor of descriptors) {
        if (typeof descriptor?.validate !== 'function') {
            fail('INVALID_OPTIONS', 'allOf', 'allOf() needs descriptors with a validate(val) method');
        }
    }

    const formatters = descriptors.filter((descriptor) => descriptor.format);
    const combined: TypeDescriptor<T> = {
        validate: (value) => descriptors.every((descriptor) => descriptor.validate(value)),
        reason: (value) => {
            const failed = descriptors.find((descriptor) => !descriptor.validate(value));
            return failed?.reason?.(value) ?? 'validation failed';
        },
    };

    if (formatters.length === 0) return combined;

    return {
        ...combined,
        format: (value) => formatters.reduce<string>(
            (acc, descriptor) => (descriptor.format as (val: unknown) => string)(acc),
            String(value),
        ),
    };
}
