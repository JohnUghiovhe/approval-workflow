import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv, type AnySchema, type ValidateFunction } from 'ajv';
import addFormatsModule from 'ajv-formats';

// ajv-formats ships a CJS build where the default export is the plugin itself
// (module.exports = formatsPlugin, exports.default = formatsPlugin). Under
// NodeNext + verbatimModuleSyntax the default import resolves to the module
// namespace, so grab .default: it is the same callable function at runtime and
// the correctly typed plugin at compile time.
const addFormats = addFormatsModule.default;
import request from 'supertest';
import app from '../src/app.ts';
import { prisma } from '../src/database/index.ts';
import { resetDatabase } from './helpers/cleanup.ts';
import { isDatabaseAvailable } from './helpers/database.ts';
import { authenticateAs, createReviewer } from './helpers/factories.ts';

// P4-7 (stretch): contract validation. The OpenAPI spec in docs/openapi.yaml is
// the documented source of truth; this suite dereferences it, compiles the
// response schemas with Ajv, then validates a sample of live responses against
// them so the spec cannot drift silently from the implementation.
//
// Approach notes:
// - SwaggerParser.validate() both checks the spec against the OpenAPI 3.0
//   meta-schema and returns the fully dereferenced document, so component
//   $refs are already inlined when we compile them with Ajv.
// - OpenAPI 3.0 `nullable: true` is not JSON Schema; toJsonSchema rewrites it
//   as `anyOf: [<schema>, { type: 'null' }]` and drops schema-only keywords.
// - `data: {}` in ApiResponse stays an open schema (any payload), so the
//   specific data schema in each *Response allOf is what actually validates.

interface DereferencedSpec {
  components?: {
    schemas?: Record<string, unknown>;
  };
}

// Response schema names the walkthrough exercises, each tied to a documented
// component that wraps the standard envelope.
const SCHEMA_NAMES = [
  'RequestResponse',
  'ListRequestsResponse',
  'DecisionResponse',
  'CommentResponse',
  'ActivitiesResponse',
  'LivenessResponse',
  'HealthResponse',
] as const;

// Recursively convert an OpenAPI 3.0 schema object into a JSON Schema Ajv can
// compile: `nullable` becomes an explicit null variant and schema annotation
// keys (nullable) are dropped; everything else is copied through. Maps of
// schemas (properties, definitions) recurse into every entry.
function toJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toJsonSchema);
  }
  if (schema === null || typeof schema !== 'object') {
    return schema;
  }

  const source = schema as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'nullable') {
      continue;
    }
    if (
      key === 'properties' ||
      key === 'patternProperties' ||
      key === 'definitions' ||
      key === '$defs'
    ) {
      const map: Record<string, unknown> = {};
      for (const [mapKey, mapValue] of Object.entries(value as Record<string, unknown>)) {
        map[mapKey] = toJsonSchema(mapValue);
      }
      result[key] = map;
    } else if (key === 'items') {
      result[key] = toJsonSchema(value);
    } else if (key === 'additionalProperties') {
      result[key] = typeof value === 'object' && value !== null ? toJsonSchema(value) : value;
    } else if (key === 'allOf' || key === 'anyOf' || key === 'oneOf' || key === 'prefixItems') {
      result[key] = Array.isArray(value) ? value.map(toJsonSchema) : value;
    } else {
      result[key] = value;
    }
  }

  if (source.nullable === true) {
    return { anyOf: [result, { type: 'null' }] };
  }
  return result;
}

// Resolve the spec path relative to this file so the suite works regardless of
// the working directory, then validate it against the OpenAPI meta-schema and
// dereference every $ref in one call. A malformed or invalid spec fails here.
const specUrl = fileURLToPath(new URL('../docs/openapi.yaml', import.meta.url));
const spec = (await SwaggerParser.validate(specUrl)) as DereferencedSpec;

const specSchemas = spec.components?.schemas ?? {};
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);

function compileValidators(): Map<string, ValidateFunction> {
  const validators = new Map<string, ValidateFunction>();
  for (const name of SCHEMA_NAMES) {
    const schema = specSchemas[name];
    if (schema === undefined) {
      throw new Error(`OpenAPI spec is missing the ${name} component schema`);
    }
    validators.set(name, ajv.compile(toJsonSchema(schema) as AnySchema));
  }
  return validators;
}

const validators = compileValidators();

// Fail with the offending method + path so a drift is immediately actionable.
function expectMatchesSchema(name: string, method: string, path: string, body: unknown): void {
  const validate = validators.get(name);
  if (validate === undefined) {
    throw new Error(`No compiled validator for schema ${name}`);
  }
  const valid = validate(body);
  expect(
    valid,
    `${method} ${path} does not match the ${name} schema: ${JSON.stringify(validate.errors)}`,
  ).toBe(true);
}

const dbAvailable = await isDatabaseAvailable();
const itDb = dbAvailable ? it : it.skip;

afterEach(async () => {
  if (dbAvailable) {
    await resetDatabase();
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.$disconnect();
  }
});

describe('OpenAPI contract validation', () => {
  it('loads a valid spec and compiles every documented response schema', () => {
    expect(validators.size).toBe(SCHEMA_NAMES.length);
  });

  itDb('live responses match the documented schemas', async () => {
    const reviewer = await createReviewer();
    const auth = authenticateAs(reviewer.id);

    const liveness = await request(app).get('/health');
    expectMatchesSchema('LivenessResponse', 'GET', '/health', liveness.body);

    const readiness = await request(app).get('/health/ready');
    expectMatchesSchema('HealthResponse', 'GET', '/health/ready', readiness.body);

    const createRes = await request(app).post('/api/requests').send({
      title: 'Contract checked monitor',
      description: 'A 4K display for the walkthrough',
      department: 'Engineering',
      requesterName: 'Olu Smith',
    });
    expectMatchesSchema('RequestResponse', 'POST', '/api/requests', createRes.body);
    const requestId = (createRes.body as { data: { id: string } }).data.id;

    const listRes = await request(app).get('/api/requests?page=1&pageSize=10');
    expectMatchesSchema('ListRequestsResponse', 'GET', '/api/requests', listRes.body);

    const viewRes = await request(app).get(`/api/requests/${requestId}`);
    expectMatchesSchema('RequestResponse', 'GET', `/api/requests/${requestId}`, viewRes.body);

    const approveRes = await request(app).post(`/api/requests/${requestId}/approve`).set(auth);
    expectMatchesSchema(
      'DecisionResponse',
      'POST',
      `/api/requests/${requestId}/approve`,
      approveRes.body,
    );

    const commentRes = await request(app)
      .post(`/api/requests/${requestId}/comments`)
      .set(auth)
      .send({ body: 'Looks good' });
    expectMatchesSchema(
      'CommentResponse',
      'POST',
      `/api/requests/${requestId}/comments`,
      commentRes.body,
    );

    const activitiesRes = await request(app).get(`/api/requests/${requestId}/activities`);
    expectMatchesSchema(
      'ActivitiesResponse',
      'GET',
      `/api/requests/${requestId}/activities`,
      activitiesRes.body,
    );
  });
});
