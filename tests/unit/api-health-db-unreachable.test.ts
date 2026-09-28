import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('@vercel/postgres', () => ({
  sql: (...args: unknown[]) => query(...args),
}));

import { GET } from '../../../web-app/src/app/api/health/route';

describe('GET /api/health with an unreachable database', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockRejectedValue(new Error('connection terminated: connection refused'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('responds 503 with status "error" and an unreachable database check', async () => {
    const response = await GET();

    expect(response.status).toBe(503);

    const body = await response.json();

    expect(body.status).toBe('error');
    expect(body.checks.database.status).toBe('unreachable');
    expect(typeof body.checks.database.latencyMs).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('reports the failure reason', async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.checks.database.error).toBe('connection terminated: connection refused');
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    query.mockRejectedValueOnce('boom');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.database.error).toBe('unknown error');
  });

  it('serves JSON and is never cached', async () => {
    const response = await GET();

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('logs the failure for operators', async () => {
    await GET();

    expect(console.error).toHaveBeenCalledWith(
      '[api/health] database unreachable:',
      expect.any(Error),
    );
  });
});
