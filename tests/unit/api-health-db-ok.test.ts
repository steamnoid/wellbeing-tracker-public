import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => query(...args),
}));

import { GET } from '../../../web-app/src/app/api/health/route';

describe('GET /api/health with a reachable database', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rowCount: 1, rows: [{ '?column?': 1 }] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('runs a single liveness query against the database', async () => {
    await GET();

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('responds 200 with status "ok" and a healthy database check', async () => {
    const response = await GET();

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.status).toBe('ok');
    expect(body.checks.database.status).toBe('ok');
    expect(typeof body.checks.database.latencyMs).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('serves JSON and is never cached', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not log a database error', async () => {
    await GET();

    expect(console.error).not.toHaveBeenCalled();
  });
});
