"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getSavedLocale } from "@/lib/i18n/preferences";
import { localizedServerMessage } from "@/lib/i18n/serverMessages";
import LanguageSelect from "@/components/i18n/LanguageSelect";
import AuthFrame, {
  authErrorClass,
  authInputClass,
  authLabelClass,
  authLinkClass,
  authPrimaryButtonClass,
} from "@/components/auth/AuthFrame";

export default function RegisterForm() {
  const { t, locale, setLocale } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [language, setLanguage] = useState(getSavedLocale());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("auth.register.passwordMismatch"));
      return;
    }

    setLoading(true);

    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, language }),
      });

      if (!registerResponse.ok) {
        const data = await registerResponse.json().catch(() => null);
        setError(localizedServerMessage(data?.error, locale) || t("auth.register.genericError"));
        setLoading(false);
        return;
      }

      const registerData = await registerResponse.json().catch(() => null);

      // SMTP enabled: the account must confirm its email before it can sign in.
      if (registerData?.requiresConfirmation) {
        setLocale(language);
        setAwaitingConfirmation(true);
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message || t("auth.register.accountCreatedSignInFailed"));
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error("Supabase auth network error:", error);
      setError(t("auth.error.network"));
      setLoading(false);
      return;
    }

    setLocale(language);
    router.push("/dashboard");
    router.refresh();
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch (error) {
      console.error("Resend confirmation network error:", error);
    }
    setResendState("sent");
  };

  if (awaitingConfirmation) {
    return (
      <AuthFrame title={t("auth.register.checkEmailTitle")} subtitle={t("common.appName")}>
        <p className="text-center text-amber-100/85">
          {t("auth.register.checkEmailBody")}
        </p>
        <p className="mt-2 text-center font-semibold text-amber-200">{email}</p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendState !== "idle"}
          className={authPrimaryButtonClass + " mt-6"}
        >
          {resendState === "sending"
            ? t("auth.register.resending")
            : resendState === "sent"
              ? t("auth.register.resent")
              : t("auth.register.resend")}
        </button>
        <p className="mt-4 text-center text-sm text-amber-100/65">
          <a href="/auth/login" className={authLinkClass}>
            {t("auth.register.signIn")}
          </a>
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={t("auth.register.title")} subtitle={t("common.appName")}>
      {error && <div className={authErrorClass}>{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="register-name" className={authLabelClass}>
            {t("auth.register.name")}
          </label>
          <input
            id="register-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={authInputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="register-email" className={authLabelClass}>
            {t("auth.register.email")}
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="register-password" className={authLabelClass}>
            {t("auth.register.password")}
          </label>
          <input
            id="register-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
            required
          />
        </div>
        <div>
          <label htmlFor="register-confirm-password" className={authLabelClass}>
            {t("auth.register.confirm")}
          </label>
          <input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={authInputClass}
            required
          />
        </div>
        <div>
          <label className={authLabelClass}>{t("language.label")}</label>
          <LanguageSelect value={language} onChange={setLanguage} />
        </div>
        <button type="submit" disabled={loading} className={authPrimaryButtonClass}>
          {loading ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-amber-100/65">
        {t("auth.register.alreadyRegistered")}{" "}
        <a href="/auth/login" className={authLinkClass}>
          {t("auth.register.signIn")}
        </a>
      </p>
    </AuthFrame>
  );
}
