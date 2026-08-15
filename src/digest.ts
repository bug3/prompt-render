import { createHash } from 'node:crypto';

export function digestBytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

export function digestSource(source: string): string {
    return digestBytes(Buffer.from(source, 'utf8'));
}
