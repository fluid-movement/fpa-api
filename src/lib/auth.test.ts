import { describe, expect, it } from 'vitest';
import { tokensMatch } from './auth.js';

describe('tokensMatch', () => {
	it('accepts the exact token', () => {
		expect(tokensMatch('s3cret', 's3cret')).toBe(true);
	});

	it('rejects a wrong, differently sized or missing token', () => {
		expect(tokensMatch('s3creT', 's3cret')).toBe(false);
		expect(tokensMatch('s3cret-and-more', 's3cret')).toBe(false);
		expect(tokensMatch('', 's3cret')).toBe(false);
		expect(tokensMatch(undefined, 's3cret')).toBe(false);
	});
});
