import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../config/openapi.ts';

// Mounted at /api/docs by src/app.ts, inside the /api namespace. The Swagger
// UI is served at the mount root; the raw spec is exposed as JSON for
// programmatic consumers and contract tests.
const router = Router();

// Exact routes first: if the root path reached the static asset middleware it
// would be treated as the swagger-ui-dist directory and 301-redirected, so the
// UI and the JSON spec are handled before any static fall-through.
router.get('/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

// Swagger UI's generated HTML references its assets relatively
// (./swagger-ui.css), so the page must be served at the slash-terminated URL.
// A bare /api/docs (no trailing slash) would resolve those assets one level up
// and render a broken UI, so redirect it to /api/docs/ first.
const serveDocs = swaggerUi.setup(openApiDocument);
router.get('/', (req, res, next) => {
  const requestPath = req.originalUrl.split('?')[0] ?? req.originalUrl;
  if (!requestPath.endsWith('/')) {
    res.redirect(301, `${requestPath}/`);
    return;
  }
  serveDocs(req, res, next);
});

// Static assets (css/js) and the generated swagger-ui-init.js are served from
// the swagger-ui-dist directory under the same prefix.
router.use(swaggerUi.serve);

export default router;
