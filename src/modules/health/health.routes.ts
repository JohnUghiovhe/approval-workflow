import { Router } from 'express';
import { HealthController } from './health.controller.ts';
import { HealthService } from './health.service.ts';

// Mounted at /health by src/app.ts, outside the /api namespace.
const router = Router();

const healthService = new HealthService();
const healthController = new HealthController(healthService);

router.get('/', healthController.liveness);
router.get('/ready', healthController.readiness);

export default router;
