"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import LanguageSelect from "@/components/i18n/LanguageSelect";
import AuthFrame, {
  authErrorClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from "@/components/auth/AuthFrame";

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
    <AuthFrame title={t("common.appName")} subtitle={t("auth.login.tagline")} showHeader={false}>
      {error && <div className={authErrorClass}>{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className={authLabelClass}>
            {t("auth.login.identifier")}
          </label>
          <input
            id="login-email"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className={authInputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="login-password" className={authLabelClass}>
            {t("auth.login.password")}
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
            required
          />
        </div>
        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
          {loading ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-amber-100/65">
        {t("auth.login.noAccount")}{" "}
        <a href="/auth/register" className={authLinkClass}>
          {t("auth.login.createAccount")}
        </a>
      </p>

      <div className="mt-6">
        <LanguageSelect value={locale} onChange={setLocale} />
      </div>
    </AuthFrame>
  );
}
