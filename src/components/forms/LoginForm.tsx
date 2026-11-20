"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { validateEmail, validatePassword } from "@/lib/validation";

export default function LoginForm() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const anySubmitting = isSubmitting || isGoogleSubmitting;

  function redirectAfterLogin() {
    const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
    router.push(redirectTo);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    if (emailError || passwordError) {
      setErrors({ email: emailError ?? undefined, password: passwordError ?? undefined });
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    const result = await login(email, password);
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "No se pudo iniciar sesión.");
      return;
    }

    redirectAfterLogin();
  }

  async function handleGoogleLogin() {
    setFormError(null);
    setErrors({});
    setIsGoogleSubmitting(true);
    const result = await loginWithGoogle();
    setIsGoogleSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "No se pudo iniciar sesión con Google.");
      return;
    }

    redirectAfterLogin();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-madera">
            Correo
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={anySubmitting}
            className="w-full rounded-md border border-madera/30 bg-white px-3 py-2 text-sm text-stone-900 focus:border-vino focus:outline-none focus:ring-2 focus:ring-vino/30 disabled:opacity-60"
            placeholder="rosa@donbigotes.com"
          />
          {errors.email && <p className="mt-1 text-sm text-red-700">{errors.email}</p>}
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-madera">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={anySubmitting}
            className="w-full rounded-md border border-madera/30 bg-white px-3 py-2 text-sm text-stone-900 focus:border-vino focus:outline-none focus:ring-2 focus:ring-vino/30 disabled:opacity-60"
            placeholder="••••••••"
          />
          {errors.password && <p className="mt-1 text-sm text-red-700">{errors.password}</p>}
        </div>

        {formError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
        )}

        <button
          type="submit"
          disabled={anySubmitting}
          className="mt-1 rounded-md bg-vino px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-vino/90 disabled:opacity-60"
        >
          {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
        </button>
      </form>

      <div className="relative my-1 flex items-center justify-center">
        <div className="w-full border-t border-madera/20" />
        <span className="bg-crema px-2 text-xs text-madera/80">o</span>
        <div className="w-full border-t border-madera/20" />
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={anySubmitting}
        className="flex items-center justify-center gap-2 rounded-md border border-madera/30 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition-colors hover:bg-hueso disabled:opacity-60"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.54-1.14 2.85-2.4 3.72v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.21z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
          />
        </svg>
        {isGoogleSubmitting ? "Conectando con Google..." : "Continuar con Google"}
      </button>
    </div>
  );
}