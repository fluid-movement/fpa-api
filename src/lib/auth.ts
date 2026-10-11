import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Compare a supplied secret against the expected one in constant time.
 *
 * Both sides are hashed first: `timingSafeEqual` requires equal-length
 * buffers, and comparing digests means the token's length does not leak either.
 */
export function tokensMatch(provided: string | undefined, expected: string): boolean {
	if (provided === undefined) return false;
	const digest = (value: string) => createHash('sha256').update(value).digest();
	return timingSafeEqual(digest(provided), digest(expected));
}
