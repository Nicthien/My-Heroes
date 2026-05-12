"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function LoginForm() {
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
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: identifier,
        password,
      });

      if (signInError) {
        setError("Email ou mot de passe incorrect");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      console.error("Supabase auth network error:", error);
      setError(
        "Impossible de contacter le serveur d'authentification. Vérifiez votre connexion réseau ou la configuration de Supabase."
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800">
      <div className="bg-gray-800/90 backdrop-blur p-8 rounded-xl shadow-2xl w-96 border border-gray-700">
        <h1 className="text-3xl font-bold text-white text-center mb-2">
          My Heroes
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Heroes of Might and Magic
        </p>

        {error && (
          <div className="bg-red-900/50 text-red-300 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="text-gray-300 text-sm block mb-1">
              Email
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
              Mot de passe
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
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        <p className="text-gray-400 text-center mt-4 text-sm">
          Pas de compte ?{" "}
          <a href="/auth/register" className="text-blue-400 hover:underline">
            Créer un compte
          </a>
        </p>
      </div>
    </div>
  );
}
