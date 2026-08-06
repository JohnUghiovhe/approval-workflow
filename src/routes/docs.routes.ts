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
router.get('/', swaggerUi.setup(openApiDocument));

// Static assets (css/js) and the generated swagger-ui-init.js are served from
// the swagger-ui-dist directory under the same prefix.
router.use(swaggerUi.serve);

export default router;
