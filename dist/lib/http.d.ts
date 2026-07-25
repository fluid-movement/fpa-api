import { HTTPException } from 'hono/http-exception';
/** Standard error body, so consumers can rely on one shape everywhere. */
export declare function httpError(status: 400 | 401 | 404 | 503, message: string): HTTPException;
export declare function notFound(what: string, id: string): HTTPException;
export interface Page {
    limit: number;
    offset: number;
}
export interface Paginated<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}
export declare function paginate<T>(items: T[], page: Page): Paginated<T>;
/** Error responses shared by most routes, so the spec stays consistent. */
export declare const commonErrors: {
    readonly 400: {
        readonly description: 'Invalid request parameters';
        readonly content: {
            'application/json': {
                schema: import("zod").ZodObject<{
                    error: import("zod").ZodString;
                    status: import("zod").ZodNumber;
                }, import("zod/v4/core").$strip>;
            };
        };
    };
    readonly 503: {
        readonly description: 'Data is still loading or upstream is unavailable';
        readonly content: {
            'application/json': {
                schema: import("zod").ZodObject<{
                    error: import("zod").ZodString;
                    status: import("zod").ZodNumber;
                }, import("zod/v4/core").$strip>;
            };
        };
    };
};
export declare const notFoundResponse: {
    readonly 404: {
        readonly description: 'Not found';
        readonly content: {
            'application/json': {
                schema: import("zod").ZodObject<{
                    error: import("zod").ZodString;
                    status: import("zod").ZodNumber;
                }, import("zod/v4/core").$strip>;
            };
        };
    };
};
