import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/database/index.ts';
import { request_status } from '../../src/generated/prisma/client.ts';
import { resetDatabase } from './cleanup.ts';
import { isDatabaseAvailable } from './database.ts';
import { authenticateAs, createRequest, createReviewer } from './factories.ts';

// The pure authenticateAs cases always run; the factory round-trips hit the
// database, so they skip when it is unreachable.
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

describe('test factories', () => {
  it('authenticateAs builds the bearer header from the reviewer id', () => {
    expect(authenticateAs('abc-123')).toEqual({ Authorization: 'Bearer abc-123' });
  });

  itDb('createReviewer returns a reviewer row and honors overrides', async () => {
    const reviewer = await createReviewer({
      name: 'Override Name',
      email: `override-${Date.now()}@example.com`,
    });

    expect(reviewer.id).toBeTruthy();
    expect(reviewer.name).toBe('Override Name');
    expect(reviewer.email).toContain('override-');
    expect(reviewer.role).toBe('reviewer');
  });

  itDb('createReviewer generates a unique id and email on every call', async () => {
    const first = await createReviewer();
    const second = await createReviewer();

    expect(first.id).not.toBe(second.id);
    expect(first.email).not.toBe(second.email);
  });

  itDb('createRequest returns a request and honors overrides', async () => {
    const created = await createRequest({
      title: `Overridden title ${Date.now()}`,
      department: 'Sales',
      requesterName: 'Ada Lovelace',
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toContain('Overridden title');
    expect(created.department).toBe('Sales');
    expect(created.requesterName).toBe('Ada Lovelace');
    expect(created.status).toBe(request_status.SUBMITTED);
  });

  itDb('createRequest generates a unique id and title on every call', async () => {
    const first = await createRequest();
    const second = await createRequest();

    expect(first.id).not.toBe(second.id);
    expect(first.title).not.toBe(second.title);
  });
});
