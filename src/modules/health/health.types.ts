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
