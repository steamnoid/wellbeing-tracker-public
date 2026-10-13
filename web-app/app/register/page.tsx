"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CSRF_HEADER_NAME } from "../../../lib/csrf";

type Status = "loading" | "ready" | "submitting" | "success" | "error";

export default function RegisterPage() {
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

      const response = await fetch("/api/auth/register", {
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
        throw new Error(data.error ?? "Unable to create your account.");
      }

      setStatus("success");
      setMessage("Account created. You can sign in now.");
      setPassword("");
      await requestCsrfToken().catch(() => undefined);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to create your account.");
    }
  }

  const busy = status === "loading" || status === "submitting";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Create an account</h1>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} data-testid="register-form" noValidate>
        <label className="flex flex-col gap-1" htmlFor="register-email">
          <span className="text-sm font-medium">Email</span>
          <input
            id="register-email"
            data-testid="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1" htmlFor="register-password">
          <span className="text-sm font-medium">Password</span>
          <input
            id="register-password"
            data-testid="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
          <span className="text-xs text-gray-500">At least 8 characters.</span>
        </label>

        <button
          type="submit"
          data-testid="register-submit"
          disabled={busy}
          className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
        >
          {status === "submitting" ? "Creating account…" : "Create account"}
        </button>
      </form>

      {message ? (
        <p
          role="status"
          data-testid="register-status"
          className={status === "error" ? "text-sm text-red-600" : "text-sm text-green-700"}
        >
          {message}
        </p>
      ) : null}

      <p className="text-sm text-gray-600">
        Already have an account?{" "}
        <a className="underline" href="/login">
          Sign in
        </a>
        .
      </p>
    </main>
  );
}
