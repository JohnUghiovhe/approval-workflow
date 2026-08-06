export type HealthStatus = 'healthy' | 'degraded';

export interface HealthCheck {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: 'up' | 'down';
  };
}

// Liveness is application-only: it never probes the database, so it exposes no
// `checks` and stays fast even when the database is unreachable.
export interface LivenessCheck {
  status: 'ok';
  timestamp: string;
  uptime: number;
  version: string;
}
