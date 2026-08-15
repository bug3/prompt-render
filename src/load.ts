import fs from 'node:fs';
import path from 'node:path';
import { digestBytes } from './digest';
import { fail } from './errors';
import { isWellFormed } from './unicode';

export interface LoadedTemplate {
    readonly source: string;
    readonly digest: string;
    readonly path: string;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export function assertSourceBytes(source: string, filePath: string): void {
    if (source.charCodeAt(0) === 0xfeff) {
        fail(
            'BOM_REFUSED',
            filePath,
            `Template has a UTF-8 BOM: ${filePath}`,
        );
    }
    if (!isWellFormed(source)) {
        fail(
            'INVALID_ENCODING',
            filePath,
            `Template contains an unpaired surrogate: ${filePath}`,
        );
    }
    if (source.includes('\r')) {
        fail(
            'CRLF_REFUSED',
            filePath,
            `Template contains a carriage return (LF-only): ${filePath}. `
            + 'Check .gitattributes for "* text=auto eol=lf".',
        );
    }
}

export function decodeUtf8(bytes: Uint8Array, filePath: string): string {
    try {
        return decoder.decode(bytes);
    } catch (err) {
        fail(
            'INVALID_ENCODING',
            filePath,
            `Template is not valid UTF-8: ${filePath}`,
            { cause: err },
        );
    }
}

export function loadTemplateFile(filePath: string): LoadedTemplate {
    const resolved = path.resolve(filePath);

    let bytes: Buffer;
    try {
        bytes = fs.readFileSync(resolved);
    } catch (err) {
        const code = err instanceof Error && 'code' in err
            ? (err as NodeJS.ErrnoException).code
            : undefined;
        if (code === 'ENOENT') {
            fail(
                'FILE_NOT_FOUND',
                resolved,
                `Template file not found: ${resolved}`,
                { cause: err },
            );
        }
        fail(
            'FILE_UNREADABLE',
            resolved,
            `Template file unreadable (${code ?? 'unknown error'}): ${resolved}`,
            { cause: err },
        );
    }

    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        fail(
            'BOM_REFUSED',
            resolved,
            `Template has a UTF-8 BOM: ${resolved}`,
        );
    }

    const source = decodeUtf8(bytes, resolved);
    assertSourceBytes(source, resolved);

    return {
        source,
        digest: digestBytes(bytes),
        path: resolved,
    };
}
