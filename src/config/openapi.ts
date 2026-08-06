import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);

// Read the version once at startup so the served spec always matches the
// shipped build instead of a hard-coded copy that can drift. createRequire
// keeps the JSON import free of the import-assertion ceremony ESM would need.
const packageJson: { version: string } = require('../../package.json');

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: Array<{ url: string }>;
  paths: Record<string, unknown>;
  components: Record<string, unknown>;
}

// Resolve the spec path relative to this file so it works no matter the
// working directory (tests run from the repo root, the built server from
// dist/), then parse the hand-written yaml once at startup.
const specPath = fileURLToPath(new URL('../../docs/openapi.yaml', import.meta.url));
const rawSpec = readFileSync(specPath, 'utf8');
const document = parse(rawSpec) as OpenApiDocument;

// Overwrite the static yaml fields with runtime values: version from
// package.json and a relative server URL. A relative `servers[].url` resolves
// against the origin serving the spec, so Swagger UI's "Try it out" targets
// the same host in every deployment instead of a hard-coded localhost.
document.info = { ...document.info, version: packageJson.version };
document.servers = [{ url: '/' }];

export const openApiDocument: OpenApiDocument = document;
