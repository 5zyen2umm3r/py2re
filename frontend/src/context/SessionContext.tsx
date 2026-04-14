/**
 * SessionContext
 * Django セッション（ログインユーザー情報）を管理する。
 * /api/auth/session/ でセッション状態を取得し、
 * login / logout 関数を提供する。
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { apiFetch } from "../api/fetch";

const BASE = import.meta.env.VITE_API_BASE as string;
// /api/entities/... → /api に変換してベースURLを取得
const AUTH_BASE = BASE.replace(/\/entities\/?$/, "");

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isStaff: boolean;
}

interface SessionState {
  isAuthenticated: boolean;
  user: SessionUser | null;
  /** セッション確認中（初回ロード時） */
  loading: boolean;
  error: string | null;
}

interface SessionContextValue extends SessionState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** セッション状態を再取得する */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    isAuthenticated: false,
    user: null,
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ isAuthenticated: boolean; user?: SessionUser }>(
        `${AUTH_BASE}/auth/session/`,
        { credentials: "include" },
      );
      setState({
        isAuthenticated: data.isAuthenticated,
        user: data.user ?? null,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: String(e) }));
    }
  }, []);

  // 初回マウント時にセッション確認
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    setState((prev) => ({ ...prev, error: null }));
    const data = await apiFetch<{ isAuthenticated: boolean; user?: SessionUser; error?: string }>(
      `${AUTH_BASE}/auth/login/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      },
    );
    if (!data.isAuthenticated) {
      const msg = data.error ?? "ログインに失敗しました";
      setState((prev) => ({ ...prev, error: msg }));
      throw new Error(msg);
    }
    setState({
      isAuthenticated: true,
      user: data.user ?? null,
      loading: false,
      error: null,
    });
  }, []);

  const logout = useCallback(async () => {
    await apiFetch(`${AUTH_BASE}/auth/logout/`, {
      method: "POST",
      credentials: "include",
    });
    setState({ isAuthenticated: false, user: null, loading: false, error: null });
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, login, logout, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
