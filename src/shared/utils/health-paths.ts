// Health probes live at /health and /health/ready. Match the exact prefix so
// look-alike routes (e.g. /healthz) are never treated as health endpoints by
// the rate limiter, request timeout, or access logger.
export function isHealthPath(path: string): boolean {
  return path === '/health' || path.startsWith('/health/');
}
