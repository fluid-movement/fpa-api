export declare class UpstreamError extends Error {
    readonly url: string;
    readonly status?: number | undefined;
    constructor(message: string, url: string, status?: number | undefined);
}
/**
 * Fetch and parse JSON from an upstream service.
 *
 * Retries are deliberately conservative: these are Lambdas backed by an S3
 * cache, so a failure is usually a cold-start timeout that a single retry
 * clears, or a real outage that retrying will not fix. We do not hammer.
 */
export declare function fetchJson<T>(url: string, attempts?: number): Promise<T>;
