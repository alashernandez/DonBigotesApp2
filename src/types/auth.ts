export type Role = "admin" | "encargado" | "cliente";

export interface User {
  id: string;
  nombre: string;
  email: string;
  password?: string;
  role: Role;
}

export type PublicUser = Omit<User, "password">;

export interface AuthResult {
  success: boolean;
  error?: string;
}

export interface AuthContextValue {
  user: PublicUser | null;
  role: Role | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  loginWithGoogle: () => Promise<AuthResult>;
  register: (
    nombre: string,
    email: string,
    password: string,
    role: Role
  ) => Promise<AuthResult>;
  logout: () => Promise<void> | void;
}
