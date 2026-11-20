"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import type { AuthContextValue, AuthResult, PublicUser, Role } from "@/types/auth";

const SESSION_COOKIE = "donbigotes_session";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function syncSessionCookie(uid: string | null) {
  if (typeof document === "undefined") return;
  if (uid) {
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(uid)}; path=/; max-age=${60 * 60 * 24 * 7}`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  }
}

function normalizeRole(rawRole: unknown): Role {
  if (rawRole === "admin" || rawRole === "encargado" || rawRole === "cliente") {
    return rawRole;
  }
  return "cliente";
}

async function resolvePublicUser(fbUser: FirebaseUser): Promise<PublicUser> {
  const userRef = doc(db, "users", fbUser.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();
    return {
      id: fbUser.uid,
      nombre:
        typeof data.nombre === "string" && data.nombre.trim().length > 0
          ? data.nombre
          : fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Usuario",
      email: typeof data.email === "string" ? data.email : fbUser.email ?? "",
      role: normalizeRole(data.role),
    };
  }

  const fallbackNombre =
    fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "Usuario Don Bigotes";
  const fallbackEmail = fbUser.email ?? "";
  const defaultRole: Role = "cliente";

  await setDoc(userRef, {
    uid: fbUser.uid,
    nombre: fallbackNombre,
    email: fallbackEmail,
    role: defaultRole,
    createdAt: serverTimestamp(),
  });

  return {
    id: fbUser.uid,
    nombre: fallbackNombre,
    email: fallbackEmail,
    role: defaultRole,
  };
}

function mapAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Correo o contraseña incorrectos.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con ese correo.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/popup-closed-by-user":
      return "Se cerró la ventana de inicio de sesión de Google antes de completar el acceso.";
    case "auth/unauthorized-domain":
      return "Este dominio no está autorizado en Firebase Authentication.";
    default:
      return "No se pudo completar la autenticación. Intenta nuevamente.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      try {
        if (!fbUser) {
          syncSessionCookie(null);
          setUser(null);
          setIsLoading(false);
          return;
        }
        const profile = await resolvePublicUser(fbUser);
        syncSessionCookie(profile.id);
        setUser(profile);
      } catch {
        syncSessionCookie(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const profile = await resolvePublicUser(cred.user);
      syncSessionCookie(profile.id);
      setUser(profile);
      return { success: true };
    } catch (err) {
      return { success: false, error: mapAuthError(err) };
    }
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<AuthResult> => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await resolvePublicUser(cred.user);
      syncSessionCookie(profile.id);
      setUser(profile);
      return { success: true };
    } catch (err) {
      return { success: false, error: mapAuthError(err) };
    }
  }, []);

  const register = useCallback(
    async (
      nombre: string,
      email: string,
      password: string,
      role: Role
    ): Promise<AuthResult> => {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const cleanName = nombre.trim();
        const cleanEmail = email.trim().toLowerCase();

        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid,
          nombre: cleanName,
          email: cleanEmail,
          role,
          createdAt: serverTimestamp(),
        });

        return { success: true };
      } catch (err) {
        return { success: false, error: mapAuthError(err) };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await signOut(auth);
    syncSessionCookie(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isLoading,
      login,
      loginWithGoogle,
      register,
      logout,
    }),
    [user, isLoading, login, loginWithGoogle, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de un <AuthProvider>.");
  }
  return ctx;
}
