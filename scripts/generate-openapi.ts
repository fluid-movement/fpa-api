/**
 * Write the OpenAPI document to openapi.json.
 *
 * The spec is served live at /openapi.json, but committing a generated copy
 * means consumers can generate a client without running the service, and any
 * change to the API surface shows up as a reviewable diff in a pull request.
 *
 * Run with: pnpm spec
 */
import { writeFile } from 'node:fs/promises';
import { createApp, OPENAPI_DOC } from '../src/app.js';

const app = createApp();
const spec = app.getOpenAPI31Document(OPENAPI_DOC);

const target = new URL('../openapi.json', import.meta.url);
await writeFile(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

const pathCount = Object.keys(spec.paths ?? {}).length;
const schemaCount = Object.keys(spec.components?.schemas ?? {}).length;
console.log(`Wrote openapi.json — ${pathCount} paths, ${schemaCount} schemas`);
