import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express, { type Application, type Request, type Response } from 'express';
import { HttpStatus } from '../../../shared/constants/http-status.ts';
import { SYS_MSG } from '../../../shared/constants/system.messages.ts';
import { UnauthorizedError } from '../../../shared/errors/unauthorized-error.ts';
import { errorHandler } from '../../../shared/middleware/error-handler.ts';
import { sendSuccess } from '../../../shared/utils/response.ts';
import { requireReviewer } from '../reviewer.middleware.ts';
const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
}));

vi.mock('../../../database/index.ts', () => ({ prisma: {} }));
vi.mock('../reviewer.repository.ts', () => ({ findById: mocks.findById }));

function buildTestApp(): Application {
  const app: Application = express();
  app.get('/protected', requireReviewer, (req, res) => {
    sendSuccess(res, { reviewer: req.reviewer });
  });
  app.use(errorHandler);
  return app;
}

describe('requireReviewer', () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a request with no authorization header', async () => {
    const res = await request(app).get('/protected');

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
  });

  it('rejects a malformed authorization header', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Basic abc123');

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
  });

  it('rejects an empty bearer token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer ');

    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.INVALID_AUTHORIZATION_HEADER);
  });

  it('rejects an unknown reviewer', async () => {
    mocks.findById.mockResolvedValue(null);

    const res = await request(app).get('/protected').set('Authorization', 'Bearer reviewer-999');

    expect(mocks.findById).toHaveBeenCalledWith(expect.anything(), 'reviewer-999');
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.REVIEWER_NOT_FOUND);
  });

  it('rejects a disabled reviewer', async () => {
    mocks.findById.mockResolvedValue({
      id: 'reviewer-2',
      name: 'Grace Nwosu',
      email: 'grace.nwosu@peerless.com',
      role: 'reviewer',
      is_active: false,
    });

    const res = await request(app).get('/protected').set('Authorization', 'Bearer reviewer-2');

    expect(mocks.findById).toHaveBeenCalledWith(expect.anything(), 'reviewer-2');
    expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(res.body.message).toBe(SYS_MSG.REVIEWER_DISABLED);
  });

  it('attaches the reviewer context and continues for a known reviewer', async () => {
    mocks.findById.mockResolvedValue({
      id: 'reviewer-1',
      name: 'Amina Bello',
      email: 'amina.bello@peerless.com',
      role: 'reviewer',
      is_active: true,
    });

    const res = await request(app).get('/protected').set('Authorization', 'Bearer reviewer-1');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.data.reviewer).toEqual({
      id: 'reviewer-1',
      name: 'Amina Bello',
      email: 'amina.bello@peerless.com',
      role: 'reviewer',
    });
  });

  it('rejects a bearer header whose token trims to empty', async () => {
    // Node's HTTP parser strips trailing whitespace, so a "Bearer " header
    // arrives as "Bearer" and fails the prefix check instead. Invoke the
    // middleware directly to exercise the empty-token path.
    const req = { headers: { authorization: 'Bearer ' } } as Request;
    const res = {} as Response;
    const next = vi.fn();

    requireReviewer(req, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError);
    expect(next.mock.calls[0]?.[0]).toMatchObject({
      message: SYS_MSG.INVALID_AUTHORIZATION_HEADER,
    });
  });
});
