"use client";

import { FormEvent, useState } from "react";
import { fetchWithSupabaseAuth, useSession } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/browser";
import {
  authErrorClass,
  authInputClass,
  authLabelClass,
  authPrimaryButtonClass,
} from "@/components/auth/AuthFrame";
import { CornerOrnaments, ParchmentBackground, goldText, ornateFramePolished } from "@/components/game/hud/theme";

export function GuestAccountConversionModal({
  open,
  onClose,
  onConverted,
}: {
  open: boolean;
  onClose: () => void;
  onConverted?: () => void;
}) {
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const close = () => {
    setName(session?.user?.name ?? "");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setLoading(false);
    setAwaitingConfirmation(false);
    onClose();
  };

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t("auth.guest.passwordMismatch"));
      return;
    }

    setLoading(true);
    const response = await fetchWithSupabaseAuth("/api/auth/guest/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, language: locale }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error || t("auth.register.genericError"));
      setLoading(false);
      return;
    }

    if (data?.requiresConfirmation) {
      setAwaitingConfirmation(true);
      setLoading(false);
      return;
    }

    await createClient().auth.refreshSession();
    onConverted?.();
    close();
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[100] overflow-y-auto bg-black/75 p-3 backdrop-blur-sm" onClick={close}>
      <div className="mx-auto flex min-h-full max-w-xl items-center" onClick={(event) => event.stopPropagation()}>
        <div className={`${ornateFramePolished} relative w-full overflow-hidden p-5 sm:p-7`}>
          <CornerOrnaments />
          <ParchmentBackground />
          <div className="relative z-10">
            <h2 className={`mb-1 text-center text-xl font-black uppercase tracking-[0.15em] ${goldText}`}>{t("auth.guest.convertTitle")}</h2>
            <p className="mb-5 text-center text-xs font-bold uppercase tracking-widest text-amber-200/55">{t("common.appName")}</p>
            {awaitingConfirmation ? (
              <div className="text-center">
                <p className="rounded-md border border-emerald-400/40 bg-emerald-950/45 px-4 py-3 text-emerald-100">
                  {t("auth.guest.checkEmail")}
                </p>
                <button type="button" className={`${authPrimaryButtonClass} mt-5`} onClick={close}>
                  {t("common.close")}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-center text-sm leading-6 text-amber-100/75">{t("auth.guest.convertIntro")}</p>
                {error && <div className={authErrorClass}>{error}</div>}
                <div>
                  <label htmlFor="guest-convert-name" className={authLabelClass}>{t("auth.register.name")}</label>
                  <input id="guest-convert-name" value={name} onChange={(event) => setName(event.target.value)} className={authInputClass} required />
                </div>
                <div>
                  <label htmlFor="guest-convert-email" className={authLabelClass}>{t("auth.register.email")}</label>
                  <input id="guest-convert-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={authInputClass} required />
                </div>
                <div>
                  <label htmlFor="guest-convert-password" className={authLabelClass}>{t("auth.register.password")}</label>
                  <input id="guest-convert-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={authInputClass} minLength={6} required />
                </div>
                <div>
                  <label htmlFor="guest-convert-confirm" className={authLabelClass}>{t("auth.guest.confirmPassword")}</label>
                  <input id="guest-convert-confirm" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={authInputClass} minLength={6} required />
                </div>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button type="button" onClick={close} className="h-12 flex-1 rounded-md border border-amber-700/50 bg-stone-950/80 px-4 text-sm font-black uppercase text-amber-200/80 hover:border-amber-400/60">
                    {t("common.cancel")}
                  </button>
                  <button type="submit" disabled={loading} className={`${authPrimaryButtonClass} flex-1`}>
                    {loading ? t("auth.guest.convertSubmitting") : t("auth.guest.convertSubmit")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
