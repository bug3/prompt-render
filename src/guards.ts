import { fail } from './errors';
import type { TemplateGuard } from './types';

/**
 * The template file must end with exactly one newline. A missing one silently
 * glues the next block to the last line; extra ones are invisible in review
 * but change the sealed bytes.
 */
const trailingNewline: TemplateGuard = {
    name: 'trailing-newline',
    validate: (source) => source.endsWith('\n') && !source.endsWith('\n\n'),
    reason: (source) => (source.endsWith('\n\n')
        ? 'ends with more than one newline'
        : 'does not end with a newline'),
};

/**
 * Rejects a template whose text matches `pattern`. This is how a project
 * asserts a policy over its own prompt files ("no vendor name", "no absolute
 * path baked in") at module load, without putting logic in the file.
 */
function noPattern(name: string, pattern: RegExp, reason?: string): TemplateGuard {
    if (typeof name !== 'string' || name.length === 0) {
        fail('INVALID_OPTIONS', 'guard.noPattern', 'guard.noPattern() needs a non-empty name');
    }
    if (pattern.global || pattern.sticky) {
        fail(
            'INVALID_OPTIONS',
            'guard.noPattern',
            `guard.noPattern() refuses the ${pattern.global ? 'g' : 'y'} flag: `
            + 'a stateful regex makes the check depend on call order',
        );
    }

    const why = reason ?? `matches ${String(pattern)}`;
    return {
        name,
        validate: (source) => !pattern.test(source),
        reason: () => why,
    };
}

export const guard = {
    trailingNewline,
    noPattern,
};
