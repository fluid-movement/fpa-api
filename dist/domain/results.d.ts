import type { RawResult } from '../upstream/types.js';
import type { DivisionResult, Player } from './types.js';
export declare function roundName(number: number): string;
/**
 * Normalize one result record. Returns null for records that should not be
 * published (hidden, or structurally unusable).
 */
export declare function normalizeResult(id: string, raw: RawResult, players: Map<string, Player>, canonicalPlayerId: Map<string, string>): DivisionResult | null;
