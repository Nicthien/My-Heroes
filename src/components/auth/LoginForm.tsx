"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import LanguageSelect from "@/components/i18n/LanguageSelect";

export default function LoginForm() {
  const { t, locale, setLocale } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let email = identifier.trim();
      if (!email.includes("@")) {
        if (email.toLowerCase() === "admin") {
          email = "admin@myheroes.local";
        } else {
        const resolveResponse = await fetch("/api/auth/resolve-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: email }),
        });
        const resolved = await resolveResponse.json().catch(() => null);
        if (!resolveResponse.ok || !resolved?.email) {
          setError(t("auth.login.invalidCredentials"));
          setLoading(false);
          return;
        }
        email = resolved.email;
        }
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(t("auth.login.invalidCredentials"));
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Supabase auth network error:", error);
      setError(t("auth.error.network"));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-96 rounded-xl border border-gray-700 bg-gray-800/90 p-5 shadow-2xl backdrop-blur sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-white sm:text-3xl">
          {t("common.appName")}
        </h1>
        <p className="text-gray-400 text-center mb-8">
          {t("auth.login.tagline")}
        </p>

        {error && (
          <div className="bg-red-900/50 text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="text-gray-300 text-sm block mb-1">
              {t("auth.login.identifier")}
            </label>
            <input
              id="login-email"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-gray-300 text-sm block mb-1">
              {t("auth.login.password")}
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white p-3 rounded font-bold transition disabled:opacity-50"
          >
            {loading ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>
        </form>

        <p className="text-gray-400 text-center mt-4 text-sm">
          {t("auth.login.noAccount")}{" "}
          <a href="/auth/register" className="text-blue-400 hover:underline">
            {t("auth.login.createAccount")}
          </a>
        </p>

        <div className="mt-6">
          <LanguageSelect value={locale} onChange={setLocale} />
        </div>
      </div>
    </div>
  );
}
