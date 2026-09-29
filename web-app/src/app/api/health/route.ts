import { connect } from "node:net";

/**
 * GET /api/health
 *
 * Unauthenticated liveness endpoint. It answers 200 with `"status": "ok"`
 * whether or not the database is reachable: reachability and schema version
 * travel in the body rather than in the status code, so a short database
 * outage does not take the instance out of a load balancer's rotation and turn
 * into a cascade of 503s.
 *
 * The handler is written against the platform `Response` instead of
 * `next/server`, so it can be called directly from unit tests without a
 * Next.js runtime or an extra dependency.
 */

export const dynamic = "force-dynamic";

/** The fallback probe uses node:net, so this route must not run on the edge. */
export const runtime = "nodejs";

/** How long the fallback probe waits for the database to accept a connection. */
const PROBE_TIMEOUT_MS = 1500;

export type DatabaseProbeResult = {
  /** Whether the database answered the probe. */
  reachable: boolean;
  /** Schema version the database reports, or `null` when it cannot be read. */
  schemaVersion: string | null;
  /** Why the probe came back the way it did; safe to expose. */
  detail: string;
};

export type DatabaseProbe = () => Promise<DatabaseProbeResult>;

/** Body served by this route. */
export type HealthBody = {
  status: "ok";
  database: DatabaseProbeResult;
};

type DatabaseTarget = { host: string; port: number };
type ProbeOutcome = { reachable: boolean; detail: string };

function readDatabaseTarget(): DatabaseTarget | null {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return null;
  }

  return { host: parsed.hostname || "localhost", port: Number(parsed.port) || 5432 };
}

function canConnect(target: DatabaseTarget, timeoutMs: number): Promise<ProbeOutcome> {
  return new Promise((resolve) => {
    const endpoint = `${target.host}:${target.port}`;
    const socket = connect({ host: target.host, port: target.port });
    let settled = false;
    let guard: ReturnType<typeof setTimeout> | undefined;

    const settle = (outcome: ProbeOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      if (guard) {
        clearTimeout(guard);
      }
      socket.destroy();
      resolve(outcome);
    };

    // A TCP connect to a black-holed host never errors, so the deadline is
    // enforced here rather than by the socket's own timeout.
    guard = setTimeout(() => {
      settle({ reachable: false, detail: `${endpoint} did not accept a connection within ${timeoutMs}ms` });
    }, timeoutMs);

    socket.once("connect", () => settle({ reachable: true, detail: `connected to ${endpoint}` }));
    socket.once("error", (error: Error) => settle({ reachable: false, detail: error.message }));
  });
}

/**
 * Fallback probe. It carries no database driver, so it can only answer
 * reachability, at the transport level. An application that also wants the
 * schema version in the payload registers its own probe with
 * `registerDatabaseProbe` - for example one that reads
 * `SELECT version FROM schema_version` through the client's pool.
 */
const transportProbe: DatabaseProbe = async () => {
  const target = readDatabaseTarget();
  if (!target) {
    return { reachable: false, schemaVersion: null, detail: "DATABASE_URL is not set" };
  }

  const outcome = await canConnect(target, PROBE_TIMEOUT_MS);
  return { reachable: outcome.reachable, schemaVersion: null, detail: outcome.detail };
};

let probe: DatabaseProbe = transportProbe;

/**
 * Point the health endpoint at the application's own database client. The
 * endpoint stays usable without it; see `transportProbe` for what the fallback
 * can and cannot report.
 */
export function registerDatabaseProbe(next: DatabaseProbe): void {
  probe = next;
}

async function runProbe(): Promise<DatabaseProbeResult> {
  try {
    const result = await probe();
    return {
      reachable: result.reachable,
      // A database we could not reach has no schema version to report.
      schemaVersion: result.reachable ? (result.schemaVersion ?? null) : null,
      detail: result.detail || (result.reachable ? "database reachable" : "database unreachable"),
    };
  } catch (error) {
    // A probe that blows up is a database problem, not a health endpoint
    // problem: report it in the body and keep answering 200.
    const message = error instanceof Error ? error.message : String(error);
    return { reachable: false, schemaVersion: null, detail: `database probe failed: ${message}` };
  }
}

export async function GET(_request: Request): Promise<Response> {
  // No cookie, Authorization header or session is read here: the endpoint is
  // deliberately open to load balancers and uptime monitors.
  const body: HealthBody = { status: "ok", database: await runProbe() };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Health is per-request state; never let a cache or CDN answer it.
      "cache-control": "no-store",
    },
  });
}
