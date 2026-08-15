export type PromptRenderErrorCode =
    | 'FILE_NOT_FOUND'
    | 'FILE_UNREADABLE'
    | 'INVALID_ENCODING'
    | 'CRLF_REFUSED'
    | 'BOM_REFUSED'
    | 'MALFORMED_PLACEHOLDER'
    | 'RESERVED_PLACEHOLDER'
    | 'UNKNOWN_PLACEHOLDER'
    | 'UNUSED_PARAMETER'
    | 'INVALID_DESCRIPTOR'
    | 'INVALID_OPTIONS'
    | 'INVALID_PARAMS'
    | 'INVALID_VALUE'
    | 'TEMPLATE_REJECTED';

export interface PromptRenderErrorOptions {
    readonly code: PromptRenderErrorCode;
    readonly filePath: string;
    readonly message: string;
    readonly token?: string;
    readonly reason?: string;
    readonly guard?: string;
    readonly line?: number;
    readonly column?: number;
    readonly cause?: unknown;
}

export class PromptRenderError extends Error {
    readonly code: PromptRenderErrorCode;

    readonly filePath: string;

    readonly token?: string;

    readonly reason?: string;

    readonly guard?: string;

    readonly line?: number;

    readonly column?: number;

    constructor(options: PromptRenderErrorOptions) {
        super(options.message, { cause: options.cause });
        this.name = 'PromptRenderError';
        this.code = options.code;
        this.filePath = options.filePath;
        this.token = options.token;
        this.reason = options.reason;
        this.guard = options.guard;
        this.line = options.line;
        this.column = options.column;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export type FailExtra = Omit<PromptRenderErrorOptions, 'code' | 'filePath' | 'message'>;

export function fail(
    code: PromptRenderErrorCode,
    filePath: string,
    message: string,
    extra?: FailExtra,
): never {
    throw new PromptRenderError({
        code,
        filePath,
        message,
        ...extra,
    });
}
