"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { getSavedLocale } from "@/lib/i18n/preferences";
import LanguageSelect from "@/components/i18n/LanguageSelect";

export default function RegisterForm() {
  const { t, setLocale } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [language, setLanguage] = useState(getSavedLocale());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
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
        setError(data?.error || t("auth.register.genericError"));
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

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-96 rounded-xl border border-gray-700 bg-gray-800/90 p-5 shadow-2xl backdrop-blur sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-white sm:text-3xl">
          {t("auth.register.title")}
        </h1>
        <p className="text-gray-400 text-center mb-8">{t("common.appName")}</p>

        {error && (
          <div className="bg-red-900/50 text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-name" className="text-gray-300 text-sm block mb-1">{t("auth.register.name")}</label>
            <input
              id="register-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="register-email" className="text-gray-300 text-sm block mb-1">{t("auth.register.email")}</label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="register-password" className="text-gray-300 text-sm block mb-1">
              {t("auth.register.password")}
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label htmlFor="register-confirm-password" className="text-gray-300 text-sm block mb-1">
              {t("auth.register.confirm")}
            </label>
            <input
              id="register-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="text-gray-300 text-sm block mb-1">{t("language.label")}</label>
            <LanguageSelect value={language} onChange={setLanguage} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded font-bold transition disabled:opacity-50"
          >
            {loading ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>
        </form>

        <p className="text-gray-400 text-center mt-4 text-sm">
          {t("auth.register.alreadyRegistered")}{" "}
          <a href="/auth/login" className="text-blue-400 hover:underline">
            {t("auth.register.signIn")}
          </a>
        </p>
      </div>
    </div>
  );
}
