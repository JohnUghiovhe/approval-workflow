import { prisma } from '../../src/database/index.ts';
import type { reviewer } from '../../src/generated/prisma/client.ts';
import { RequestService } from '../../src/modules/request/request.service.ts';
import type { RequestDto } from '../../src/modules/request/request.types.ts';

const requestService = new RequestService();

// Every factory call must produce unique data (AC: unique IDs, names, emails),
// so the suffix is never reused and parallel or retried cases cannot collide.
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface ReviewerOverrides {
  name?: string;
  email?: string;
  role?: string;
}

export interface RequestOverrides {
  title?: string;
  description?: string;
  department?: string;
  requesterName?: string;
}

export async function createReviewer(overrides: ReviewerOverrides = {}): Promise<reviewer> {
  const suffix = uniqueSuffix();
  return prisma.reviewer.create({
    data: {
      name: overrides.name ?? `Test Reviewer ${suffix}`,
      email: overrides.email ?? `reviewer-${suffix}@example.com`,
      role: overrides.role ?? 'reviewer',
    },
  });
}

// Create the request through RequestService so the SUBMISSION activity is
// recorded exactly as the API would, without depending on HTTP round-trips.
export async function createRequest(overrides: RequestOverrides = {}): Promise<RequestDto> {
  return requestService.createRequest({
    title: overrides.title ?? `Test request ${uniqueSuffix()}`,
    description: overrides.description ?? 'Test description',
    department: overrides.department ?? 'Engineering',
    requesterName: overrides.requesterName ?? 'Olu Smith',
  });
}

// Authentication is mocked: the bearer token is the reviewer id, so this just
// builds the header that requireReviewer expects.
export function authenticateAs(reviewerId: string): { Authorization: string } {
  return { Authorization: `Bearer ${reviewerId}` };
}
