import { config } from '../config.js';
export class UpstreamError extends Error {
    url;
    status;
    constructor(message, url, status) {
        super(message);
        this.url = url;
        this.status = status;
        this.name = 'UpstreamError';
    }
}
/**
 * Fetch and parse JSON from an upstream service.
 *
 * Retries are deliberately conservative: these are Lambdas backed by an S3
 * cache, so a failure is usually a cold-start timeout that a single retry
 * clears, or a real outage that retrying will not fix. We do not hammer.
 */
export async function fetchJson(url, attempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(config.requestTimeoutMs),
                headers: { accept: 'application/json' }
            });
            if (!response.ok) {
                throw new UpstreamError(`Upstream returned ${response.status}`, url, response.status);
            }
            return (await response.json());
        }
        catch (error) {
            lastError = error;
            // A 4xx will not fix itself; only retry transport errors and 5xx.
            const status = error instanceof UpstreamError ? error.status : undefined;
            const worthRetrying = status === undefined || status >= 500;
            if (!worthRetrying || attempt === attempts)
                break;
            await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
    }
    if (lastError instanceof UpstreamError)
        throw lastError;
    throw new UpstreamError(`Upstream request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`, url);
}
//# sourceMappingURL=client.js.map