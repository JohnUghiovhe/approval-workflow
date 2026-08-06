import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.ts';

// P5 follow-up: Swagger UI's generated HTML references its assets relatively
// (./swagger-ui.css), so a bare /api/docs without a trailing slash must be
// 301-redirected to /api/docs/ before the UI is rendered, and the raw spec +
// static assets must keep working from the slash-terminated mount. None of
// these routes touch the database, so the suite always runs.
describe('API docs routes', () => {
  it('redirects a bare /api/docs to the slash-terminated URL', async () => {
    const res = await request(app).get('/api/docs');

    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/api/docs/');
  });

  it('serves the Swagger UI at the trailing-slash root with relative assets', async () => {
    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui.css');
    expect(res.text).toContain('swagger-ui-init.js');
  });

  it('serves the swagger-ui assets under the docs mount', async () => {
    const res = await request(app).get('/api/docs/swagger-ui.css');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/css');
  });

  it('exposes the runtime spec as JSON with a relative server URL', async () => {
    const res = await request(app).get('/api/docs/openapi.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.openapi).toMatch(/^3\.0\./);
    expect(res.body.info.title).toBeTruthy();
    expect(res.body.servers).toEqual([{ url: '/' }]);
    expect(res.body.paths).toHaveProperty('/api/requests');
    expect(res.body.components.schemas).toHaveProperty('RequestResponse');
  });

  it('lets unknown docs paths fall through to the JSON 404', async () => {
    const res = await request(app).get('/api/docs/nope');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });
});
