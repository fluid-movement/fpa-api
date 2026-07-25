import { HTTPException } from 'hono/http-exception';
import { ErrorSchema } from '../schemas/domain.js';

/** Standard error body, so consumers can rely on one shape everywhere. */
export function httpError(status: 400 | 401 | 404 | 503, message: string): HTTPException {
	return new HTTPException(status, {
		res: Response.json({ error: message, status }, { status })
	});
}

export function notFound(what: string, id: string): HTTPException {
	return httpError(404, `${what} "${id}" not found`);
}

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

export function paginate<T>(items: T[], page: Page): Paginated<T> {
	return {
		items: items.slice(page.offset, page.offset + page.limit),
		total: items.length,
		limit: page.limit,
		offset: page.offset
	};
}

const errorContent = { 'application/json': { schema: ErrorSchema } };

/** Error responses shared by most routes, so the spec stays consistent. */
export const commonErrors = {
	400: { description: 'Invalid request parameters', content: errorContent },
	503: { description: 'Data is still loading or upstream is unavailable', content: errorContent }
} as const;

export const notFoundResponse = {
	404: { description: 'Not found', content: errorContent }
} as const;
