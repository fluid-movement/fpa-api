import type { Corpus } from '../domain/index-builder.js';
export declare function saveSnapshot(corpus: Corpus): Promise<void>;
export declare function loadSnapshot(): Promise<Corpus | null>;
