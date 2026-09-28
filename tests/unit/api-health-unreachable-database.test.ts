import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

// Same module the route imports, addressed relatively so the mock applies
// without relying on a path alias being configured for the test run.
vi.mock('../../web-app/src/lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

import { GET } from '../../web-app/src/app/api/health/route';

describe('GET /api/health when the database is unreachable', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockRejectedValue(new Error('connection refused'));
  });

  it('answers 503 and reports a degraded service', async () => {
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'degraded',
      database: 'unreachable',
    });
  });

  it('does not throw the connection error at the caller', async () => {
    await expect(GET()).resolves.toBeDefined();
  });

  it('still attempts the database exactly once', async () => {
    await GET();

    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('marks the response as uncacheable', async () => {
    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
