export interface TypeDescriptor<T = unknown> {
    readonly __phantom?: T;
    validate(value: unknown): boolean;
    format?(value: unknown): string;
    reason?(value: unknown): string;
}

export type SchemaDefinition = Record<string, TypeDescriptor>;

export type InferParams<S extends SchemaDefinition> = {
    [K in keyof S]: S[K] extends TypeDescriptor<infer T> ? T : never;
};

export interface TemplateResult {
    /** The rendered bytes as a string. */
    readonly markdown: string;
    /** sha256 hex of the rendered UTF-8 bytes. Computed on first access. */
    readonly digest: string;
    /** Length of the rendered UTF-8 bytes. Computed on first access. */
    readonly bytes: number;
}

/**
 * A define-time assertion over the template file itself. It validates the
 * source text, it never rewrites it.
 */
export interface TemplateGuard {
    readonly name: string;
    validate(source: string): boolean;
    reason?(source: string): string;
}

export interface TemplateOptions {
    readonly guards?: readonly TemplateGuard[];
}

export interface StringTemplateOptions extends TemplateOptions {
    readonly label: string;
}

export type TemplateFn<S extends SchemaDefinition> = ((
    params: InferParams<S>,
) => TemplateResult) & {
    readonly path: string;
    readonly digest: string;
    readonly tokens: readonly string[];
};
