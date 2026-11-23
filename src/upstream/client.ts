import { config } from '../config.js';

export class UpstreamError extends Error {
	constructor(
		message: string,
		readonly url: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'UpstreamError';
	}
}

/**
 * Fetch and parse JSON from an upstream service.
 *
 * Retries are deliberately conservative: a failure is usually a transient
 * blip that a single retry clears, or a real outage that retrying will not
 * fix. We do not hammer — the upstream rate-limits us like any other client.
 */
export async function fetchJson<T>(url: string, attempts = 2): Promise<T> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(config.requestTimeoutMs),
				headers: { accept: 'application/json' }
			});

			if (!response.ok) {
				// The sync and Points APIs answer errors with `{ error }`; keep it for /health.
				const detail = await response
					.json()
					.then((body: { error?: unknown }) => (typeof body?.error === 'string' ? `: ${body.error}` : ''))
					.catch(() => '');
				throw new UpstreamError(
					`Upstream returned ${response.status}${detail}`,
					url,
					response.status
				);
			}

			return (await response.json()) as T;
		} catch (error) {
			lastError = error;
			// A 4xx will not fix itself; only retry transport errors and 5xx.
			const status = error instanceof UpstreamError ? error.status : undefined;
			const worthRetrying = status === undefined || status >= 500;
			if (!worthRetrying || attempt === attempts) break;
			await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
		}
	}

	if (lastError instanceof UpstreamError) throw lastError;
	throw new UpstreamError(
		`Upstream request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
		url
	);
}
