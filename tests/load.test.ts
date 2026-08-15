import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptRenderError } from '../src/errors';
import { digestSource } from '../src/digest';
import { loadTemplateFile } from '../src/load';
import { fixture } from './helpers';

describe('loadTemplateFile', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-render-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reads UTF-8 LF files and hashes the raw bytes', () => {
        const filePath = fixture('plain.md');
        const loaded = loadTemplateFile(filePath);
        const raw = fs.readFileSync(filePath);
        expect(loaded.source).toBe(raw.toString('utf8'));
        expect(loaded.digest).toBe(createHash('sha256').update(raw).digest('hex'));
        expect(loaded.path).toBe(path.resolve(filePath));
        expect(loaded.source.endsWith('\n')).toBe(true);
    });

    it('preserves a missing trailing newline', () => {
        const filePath = fixture('no-trailing-newline.md');
        const loaded = loadTemplateFile(filePath);
        expect(loaded.source.endsWith('\n')).toBe(false);
        expect(loaded.source).toBe(fs.readFileSync(filePath, 'utf8'));
    });

    it('throws FILE_NOT_FOUND with the resolved path', () => {
        const missing = path.join(tmpDir, 'nope.md');
        try {
            loadTemplateFile(missing);
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('FILE_NOT_FOUND');
            expect(error.filePath).toBe(path.resolve(missing));
            expect(error.message).toContain(path.resolve(missing));
        }
    });

    it('throws FILE_UNREADABLE when the path is a directory', () => {
        try {
            loadTemplateFile(tmpDir);
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('FILE_UNREADABLE');
            expect(error.message).toContain(path.resolve(tmpDir));
        }
    });

    it('refuses CR in the file', () => {
        const filePath = path.join(tmpDir, 'crlf.md');
        fs.writeFileSync(filePath, 'hello\r\n{{name}}\r\n');
        try {
            loadTemplateFile(filePath);
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('CRLF_REFUSED');
            expect(error.message).toContain(filePath);
        }
    });

    it('refuses a leading UTF-8 BOM', () => {
        const filePath = path.join(tmpDir, 'bom.md');
        fs.writeFileSync(filePath, Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69, 0x0a]));
        try {
            loadTemplateFile(filePath);
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('BOM_REFUSED');
            expect(error.message).toContain(filePath);
        }
    });

    it('refuses invalid UTF-8', () => {
        const filePath = path.join(tmpDir, 'bad.md');
        fs.writeFileSync(filePath, Buffer.from([0x68, 0xff, 0x69]));
        try {
            loadTemplateFile(filePath);
            expect.unreachable();
        } catch (err) {
            const error = err as PromptRenderError;
            expect(error.code).toBe('INVALID_ENCODING');
            expect(error.message).toContain(filePath);
        }
    });
});

describe('digestSource', () => {
    it('hashes UTF-8 bytes of a string', () => {
        expect(digestSource('ab')).toBe(
            createHash('sha256').update(Buffer.from('ab', 'utf8')).digest('hex'),
        );
    });
});
