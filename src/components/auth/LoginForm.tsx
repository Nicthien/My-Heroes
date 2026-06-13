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
import { recordSupportLogin } from "@/app/dashboard/SupportKofi";
import { SocialLinks } from "@/app/dashboard/SocialLinks";

export default function LoginForm() {
  const { t, locale, setLocale } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnconfirmedEmail("");
    setResendState("idle");

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

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError || !signInData.user) {
        setError(t("auth.login.invalidCredentials"));
        setLoading(false);
        return;
      }

      // Email-confirmation gate: a signed-in but unconfirmed account is rejected
      // and immediately signed out (soft gate; see register flow / USE_SMTP).
      const { data: profile } = await supabase
        .from("profiles")
        .select("email_confirmed")
        .eq("id", signInData.user.id)
        .maybeSingle();

      if (profile && profile.email_confirmed === false) {
        await supabase.auth.signOut();
        setUnconfirmedEmail(email);
        setError(t("auth.login.emailNotConfirmed"));
        setLoading(false);
        return;
      }

      // Count this deliberate login toward the one-time "support the game" nudge.
      recordSupportLogin(signInData.user.id);

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Supabase auth network error:", error);
      setError(t("auth.error.network"));
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unconfirmedEmail }),
      });
    } catch (error) {
      console.error("Resend confirmation network error:", error);
    }
    setResendState("sent");
  };

  return (
    <AuthFrame title={t("common.appName")} subtitle={t("auth.login.tagline")} showHeader={false}>
      {error && <div className={authErrorClass}>{error}</div>}

      {unconfirmedEmail && (
        <button
          type="button"
          onClick={handleResend}
          disabled={resendState !== "idle"}
          className="mb-4 w-full text-sm text-amber-200 underline underline-offset-2 hover:text-amber-100 disabled:opacity-60"
        >
          {resendState === "sending"
            ? t("auth.register.resending")
            : resendState === "sent"
              ? t("auth.register.resent")
              : t("auth.login.resendConfirmation")}
        </button>
      )}

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

      <div className="mt-5 border-t border-amber-700/30 pt-4">
        <SocialLinks />
      </div>
    </AuthFrame>
  );
}
