"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { login as apiLogin } from "./api-client";

type Role = "bd_executive" | "manager" | "admin";

interface AuthState {
  token: string | null;
  role: Role | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = "leadintel_token";
const ROLE_KEY = "leadintel_role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setRole(window.localStorage.getItem(ROLE_KEY) as Role | null);
    setIsLoading(false);
  }, []);

  async function login(email: string, password: string) {
    const response = await apiLogin(email, password);
    window.localStorage.setItem(TOKEN_KEY, response.access_token);
    window.localStorage.setItem(ROLE_KEY, response.role);
    setToken(response.access_token);
    setRole(response.role);
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ROLE_KEY);
    setToken(null);
    setRole(null);
    router.push("/");
  }

  return (
    <AuthContext.Provider value={{ token, role, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
