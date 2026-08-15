/**
 * Character classes that are never safe to seal into a prompt without the
 * caller asking for them. Used by `text.plain`; never applied by default.
 */
export type DisallowedKind = 'control' | 'bidi' | 'invisible' | 'tag';

export interface DisallowedChar {
    readonly kind: DisallowedKind;
    readonly codePoint: number;
    readonly index: number;
}

// C0 minus \t and \n, DEL, C1, bidi controls, zero-width and invisible
// formatting, interlinear annotation, and the Unicode Tags block.
const DISALLOWED_RE = new RegExp(
    '[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F'
    + '\\u061C\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u206F'
    + '\\uFEFF\\uFFF9-\\uFFFB]'
    + '|[\\u{E0000}-\\u{E007F}]',
    'u',
);

const BIDI = new Set([0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e]);

function classify(codePoint: number): DisallowedKind {
    if (codePoint >= 0xe0000) return 'tag';
    if (codePoint <= 0x001f || (codePoint >= 0x007f && codePoint <= 0x009f)) return 'control';
    if (BIDI.has(codePoint) || (codePoint >= 0x2066 && codePoint <= 0x2069)) return 'bidi';
    return 'invisible';
}

export function isWellFormed(value: string): boolean {
    return value.isWellFormed();
}

export function findDisallowed(value: string): DisallowedChar | null {
    const match = DISALLOWED_RE.exec(value);
    if (match === null) return null;
    const codePoint = match[0].codePointAt(0) as number;
    return { kind: classify(codePoint), codePoint, index: match.index };
}

export function formatCodePoint(codePoint: number): string {
    return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function describeDisallowed(found: DisallowedChar): string {
    const at = formatCodePoint(found.codePoint);
    switch (found.kind) {
        case 'control':
            return `contains a control character (${at})`;
        case 'bidi':
            return `contains a bidi control character (${at})`;
        case 'tag':
            return `contains a Unicode tag character (${at})`;
        default:
            return `contains an invisible character (${at})`;
    }
}
