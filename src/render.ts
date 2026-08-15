import { digestSource } from './digest';
import type { Segment } from './parse';
import type { TemplateResult } from './types';

export function render(segments: readonly Segment[], values: Record<string, string>): string {
    const parts = new Array<string>(segments.length);
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        parts[i] = segment.type === 'lit' ? segment.value : values[segment.name];
    }
    return parts.join('');
}

/**
 * `digest` and `bytes` are derived from `markdown` on first access. The
 * rendered string is what it always was; nothing here mutates it.
 */
export function makeResult(markdown: string): TemplateResult {
    let digest: string | undefined;
    let bytes: number | undefined;
    return Object.freeze({
        markdown,
        get digest(): string {
            digest ??= digestSource(markdown);
            return digest;
        },
        get bytes(): number {
            bytes ??= Buffer.byteLength(markdown, 'utf8');
            return bytes;
        },
    });
}
