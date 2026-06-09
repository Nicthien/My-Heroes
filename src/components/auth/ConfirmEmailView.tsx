"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import AuthFrame, { authErrorClass, authLinkClass, authPrimaryButtonClass } from "@/components/auth/AuthFrame";

type Status = "pending" | "ok" | "invalid" | "expired" | "error";

export default function ConfirmEmailView() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<Status>(token ? "pending" : "invalid");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !token) return;
    ran.current = true;

    fetch("/api/auth/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        const next = data?.status as Status | undefined;
        setStatus(next === "ok" || next === "expired" || next === "invalid" ? next : "error");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const messageKey =
    status === "pending"
      ? "auth.confirm.pending"
      : status === "ok"
        ? "auth.confirm.success"
        : status === "expired"
          ? "auth.confirm.expired"
          : status === "invalid"
            ? "auth.confirm.invalid"
            : "auth.confirm.error";

  return (
    <AuthFrame title={t("auth.confirm.title")} subtitle={t("common.appName")}>
      {status === "ok" ? (
        <>
          <p className="mb-6 text-center text-amber-100/85">{t(messageKey)}</p>
          <a href="/auth/login" className={authPrimaryButtonClass + " flex items-center justify-center"}>
            {t("auth.confirm.goToLogin")}
          </a>
        </>
      ) : status === "pending" ? (
        <p className="text-center text-amber-100/85">{t(messageKey)}</p>
      ) : (
        <>
          <div className={authErrorClass}>{t(messageKey)}</div>
          <p className="mt-4 text-center text-sm text-amber-100/65">
            <a href="/auth/login" className={authLinkClass}>
              {t("auth.confirm.goToLogin")}
            </a>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
