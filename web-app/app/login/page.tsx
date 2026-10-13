"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CSRF_HEADER_NAME } from "../../../lib/csrf";

type Status = "loading" | "ready" | "submitting" | "success" | "error";

export default function LoginPage() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const requestCsrfToken = useCallback(async (): Promise<string> => {
    const response = await fetch("/api/auth/csrf", { method: "GET", cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not start a secure session. Please reload the page.");
    }

    const data = (await response.json()) as { csrfToken?: string };
    if (!data.csrfToken) {
      throw new Error("Could not start a secure session. Please reload the page.");
    }

    setCsrfToken(data.csrfToken);
    return data.csrfToken;
  }, []);

  useEffect(() => {
    let cancelled = false;

    requestCsrfToken()
      .then(() => {
        if (!cancelled) {
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Could not start a secure session.");
      });

    return () => {
      cancelled = true;
    };
  }, [requestCsrfToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);

    try {
      const token = csrfToken ?? (await requestCsrfToken());

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", [CSRF_HEADER_NAME]: token },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (response.status === 403) {
        // The pair was rejected, so fetch a fresh token before the user retries.
        await requestCsrfToken().catch(() => undefined);
        throw new Error("Your security token expired. Please try again.");
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to sign in.");
      }

      setStatus("success");
      setMessage("Signed in successfully.");
      setPassword("");
      await requestCsrfToken().catch(() => undefined);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  const busy = status === "loading" || status === "submitting";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} data-testid="login-form" noValidate>
        <label className="flex flex-col gap-1" htmlFor="login-email">
          <span className="text-sm font-medium">Email</span>
          <input
            id="login-email"
            data-testid="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1" htmlFor="login-password">
          <span className="text-sm font-medium">Password</span>
          <input
            id="login-password"
            data-testid="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          data-testid="login-submit"
          disabled={busy}
          className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {status === "submitting" ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {message ? (
        <p
          role="status"
          data-testid="login-status"
          className={status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
        >
          {message}
        </p>
      ) : null}

      <p className="text-sm text-gray-600">
        Need an account?{" "}
        <a className="underline" href="/register">
          Create one
        </a>
        .
      </p>
    </main>
  );
}
