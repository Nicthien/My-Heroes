"use client";

import { useEffect, useMemo, useState } from "react";
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
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { getBrowserTurnstileSiteKey } from "@/lib/config/supabaseEnv";
import { useSession } from "@/lib/auth/client";

export default function LoginForm() {
  const { t, locale, setLocale } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [guestName, setGuestName] = useState("");
  const [guestLoading, setGuestLoading] = useState(false);
  const [allowAnonymousUsers, setAllowAnonymousUsers] = useState(true);
  const [guestSettingsLoading, setGuestSettingsLoading] = useState(true);
  const [captchaToken, setCaptchaToken] = useState("");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { status } = useSession();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/guest-settings", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAllowAnonymousUsers(data?.allowAnonymousUsers !== false);
      })
      .catch((settingsError) => {
        console.error("Guest settings load failed:", settingsError);
        if (!cancelled) setAllowAnonymousUsers(true);
      })
      .finally(() => {
        if (!cancelled) setGuestSettingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGuestSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = guestName.trim();
    if (!name) return;
    if (!allowAnonymousUsers) {
      setError(t("auth.guest.disabled"));
      return;
    }
    if (getBrowserTurnstileSiteKey() && !captchaToken) {
      setError(t("auth.guest.captchaRequired"));
      return;
    }

    setGuestLoading(true);
    setError("");
    try {
      const { data, error: signInError } = await supabase.auth.signInAnonymously({
        options: {
          data: { name },
          ...(captchaToken ? { captchaToken } : {}),
        },
      });
      if (signInError || !data.session) {
        const message = signInError?.message ?? "";
        setError(message.toLowerCase().includes("anonymous sign-ins are disabled") ? t("auth.guest.supabaseDisabled") : message || t("auth.guest.failed"));
        setGuestLoading(false);
        return;
      }

      const profileResponse = await fetch("/api/auth/guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
        },
        credentials: "include",
        body: JSON.stringify({ name, language: locale }),
      });
      if (!profileResponse.ok) {
        const profileError = await profileResponse.json().catch(() => null);
        await supabase.auth.signOut();
        setError(profileError?.error || t("auth.guest.failed"));
        setGuestLoading(false);
        return;
      }

      router.push("/dashboard?create=1");
      router.refresh();
    } catch (guestError) {
      console.error("Guest sign-in failed:", guestError);
      setError(t("auth.error.network"));
      setGuestLoading(false);
    }
  };

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
    <AuthFrame
      title={t("common.appName")}
      subtitle={t("auth.login.tagline")}
      showHeader={false}
      showGameIntro
    >
      <form onSubmit={handleGuestSubmit} className="mb-4 rounded-lg border border-emerald-500/35 bg-emerald-950/20 p-3">
        <div className="mb-2 text-center text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
          {t("auth.guest.title")}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
          <div>
            <label htmlFor="guest-name" className={authLabelClass}>
              {t("auth.guest.name")}
            </label>
            <input
              id="guest-name"
              type="text"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              className={authInputClass}
              autoComplete="nickname"
              disabled={!allowAnonymousUsers}
              required
            />
          </div>
          <button type="submit" disabled={guestLoading || guestSettingsLoading || status === "loading" || !allowAnonymousUsers} className={authPrimaryButtonClass}>
            {guestLoading ? t("auth.guest.starting") : t("auth.guest.try")}
          </button>
        </div>
        {allowAnonymousUsers && <TurnstileWidget onTokenChange={setCaptchaToken} />}
        <p className="mt-2 text-center text-[11px] leading-4 text-emerald-100/65">
          {allowAnonymousUsers ? t("auth.guest.notice") : t("auth.guest.disabled")}
        </p>
      </form>

      <div className="mb-4 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/45">
        <span className="h-px flex-1 bg-amber-700/30" />
        {t("auth.guest.orLogin")}
        <span className="h-px flex-1 bg-amber-700/30" />
      </div>

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

      <form onSubmit={handleSubmit} className="space-y-3">
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

      <p className="mt-3 text-center text-sm text-amber-100/65">
        {t("auth.login.noAccount")}{" "}
        <a href="/auth/register" className={authLinkClass}>
          {t("auth.login.createAccount")}
        </a>
      </p>

      <div className="mt-4">
        <LanguageSelect value={locale} onChange={setLocale} />
      </div>

      <div className="mt-4 border-t border-amber-700/30 pt-3">
        <SocialLinks />
      </div>
    </AuthFrame>
  );
}
