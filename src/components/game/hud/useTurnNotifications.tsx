"use client";

import { useEffect, useRef, useState } from "react";
import {
  getNotificationPromptDismissed,
  markNotificationPromptDismissed,
  showBrowserNotification,
} from "./helpers";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function useTurnNotifications({
  canAct,
  isPending,
  turnNotificationKey,
}: {
  canAct: boolean;
  isPending: boolean;
  turnNotificationKey: string;
}) {
  const { t } = useI18n();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "denied" : Notification.permission
  );
  const [dismissed, setDismissed] = useState(getNotificationPromptDismissed);
  const lastNotifiedTurnRef = useRef<string | null>(null);

  const requestNotifications = async () => {
    setDismissed(true);
    markNotificationPromptDismissed();

    if (typeof Notification === "undefined") {
      setPermission("denied");
      return;
    }

    const next = await Notification.requestPermission();
    setPermission(next);
  };

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    const syncPermission = () => {
      setPermission(Notification.permission);
    };

    window.addEventListener("focus", syncPermission);
    document.addEventListener("visibilitychange", syncPermission);

    return () => {
      window.removeEventListener("focus", syncPermission);
      document.removeEventListener("visibilitychange", syncPermission);
    };
  }, []);

  useEffect(() => {
    if (isPending) {
      document.title = "My Heroes";
      return;
    }

    document.title = canAct ? t("hud.yourTurnTitle") : "My Heroes";
  }, [canAct, isPending, t]);

  useEffect(() => {
    if (!canAct || isPending) return;
    if (lastNotifiedTurnRef.current === turnNotificationKey) return;

    lastNotifiedTurnRef.current = turnNotificationKey;

    void showBrowserNotification("My Heroes", {
      body: t("hud.yourTurnBody"),
    });
  }, [canAct, isPending, permission, turnNotificationKey, t]);

  const promptUI = canAct && !isPending && permission === "default" && !dismissed
    ? (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-auto rounded-2xl border border-green-400/50 bg-green-950/90 px-6 py-3 text-center shadow-2xl shadow-green-900/40 backdrop-blur-xl">
          <button
            className="rounded bg-green-700 px-3 py-1 text-sm font-bold text-white hover:bg-green-600"
            onClick={requestNotifications}
          >
            {t("hud.enableNotifications")}
          </button>
        </div>
      )
    : null;

  return { promptUI };
}
