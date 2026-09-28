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

describe('GET /api/health when the database is reachable', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([{ '1': 1 }]);
  });

  it('answers 200 and reports a healthy service', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      database: 'reachable',
    });
  });

  it('pings the database exactly once with a trivial query', async () => {
    await GET();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(String(queryRaw.mock.calls[0]?.[0])).toContain('SELECT 1');
  });

  it('marks the response as uncacheable', async () => {
    const response = await GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
