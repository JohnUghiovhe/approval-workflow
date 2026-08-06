import { createRequire } from 'node:module';
import { probeDatabase } from './health.repository.ts';
import type { HealthCheck } from './health.types.ts';

// Read the app version from package.json once at startup so the health
// response never has to hit the filesystem per request. createRequire keeps
// the JSON import free of the import-assertion ceremony ESM would need.
const require = createRequire(import.meta.url);
const appVersion: string = require('../../../package.json').version;

export class HealthService {
  // Build the liveness/readiness report. The probe never throws (repository
  // contract), so this method itself has no failure path to surface.
  async check(databaseUp: boolean): Promise<HealthCheck> {
    return {
      status: databaseUp ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: appVersion,
      checks: {
        database: databaseUp ? 'up' : 'down',
      },
    };
  }

  async isDatabaseUp(): Promise<boolean> {
    return probeDatabase();
  }
}
