"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
        },
      });

      if (signUpError) {
        setError(signUpError.message || "Erreur lors de l'inscription");
        setLoading(false);
        return;
      }
    } catch (error) {
      console.error("Supabase auth network error:", error);
      setError(
        "Impossible de contacter le serveur d'authentification. Vérifiez votre connexion réseau ou la configuration de Supabase."
      );
      setLoading(false);
      return;
    }

    await fetch("/api/auth/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 p-4">
      <div className="w-full max-w-96 rounded-xl border border-gray-700 bg-gray-800/90 p-5 shadow-2xl backdrop-blur sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold text-white sm:text-3xl">
          Créer un compte
        </h1>
        <p className="text-gray-400 text-center mb-8">My Heroes</p>

        {error && (
          <div className="bg-red-900/50 text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-name" className="text-gray-300 text-sm block mb-1">Nom</label>
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
            <label htmlFor="register-email" className="text-gray-300 text-sm block mb-1">Email</label>
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
              Mot de passe
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
              Confirmer
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
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded font-bold transition disabled:opacity-50"
          >
            {loading ? "Création..." : "Créer le compte"}
          </button>
        </form>

        <p className="text-gray-400 text-center mt-4 text-sm">
          Déjà inscrit ?{" "}
          <a href="/auth/login" className="text-blue-400 hover:underline">
            Se connecter
          </a>
        </p>
      </div>
    </div>
  );
}
