import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { customFetch, setAuthTokenGetter } from "@workspace/api-client-react";

export const APP_ROLES = [
  "guest",
  "waiter",
  "kitchen",
  "cashier",
  "supervisor",
  "manager",
  "owner",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

type AppPermission =
  | "dashboard"
  | "floorPlan"
  | "tableSettings"
  | "orders"
  | "kds"
  | "cashier"
  | "menu"
  | "inventory"
  | "staff"
  | "finance"
  | "settings";

export type AuthUser = {
  role: AppRole;
  name?: string;
  staffId?: number | null;
  tableId?: number | null;
  tableNumber?: string | null;
  exp: number;
};

type StaffLoginPayload = {
  identifier: string;
  pin: string;
};

type GuestLoginPayload = {
  tableId?: number;
  tableNumber?: string;
};

type AuthApiResponse = {
  token: string;
  user: AuthUser;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  token: string | null;
  loginStaff: (payload: StaffLoginPayload) => Promise<AuthUser>;
  loginGuest: (payload: GuestLoginPayload) => Promise<AuthUser>;
  logout: () => void;
  hasPermission: (permission: AppPermission) => boolean;
  getDefaultPath: () => string;
};

const AUTH_STORAGE_KEY = "teahouse_auth_token";

const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  guest: ["orders"],
  waiter: ["dashboard", "floorPlan", "orders"],
  kitchen: ["kds", "orders"],
  cashier: ["dashboard", "orders", "cashier", "finance"],
  supervisor: ["dashboard", "floorPlan", "tableSettings", "orders", "kds", "cashier", "menu", "inventory", "finance"],
  manager: ["dashboard", "floorPlan", "tableSettings", "orders", "kds", "cashier", "menu", "inventory", "staff", "finance", "settings"],
  owner: ["dashboard", "floorPlan", "tableSettings", "orders", "kds", "cashier", "menu", "inventory", "staff", "finance", "settings"],
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

function normalizeUser(input: unknown): AuthUser | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<AuthUser>;
  if (!isRole(raw.role) || typeof raw.exp !== "number") return null;
  return {
    role: raw.role,
    name: typeof raw.name === "string" ? raw.name : undefined,
    staffId: typeof raw.staffId === "number" ? raw.staffId : null,
    tableId: typeof raw.tableId === "number" ? raw.tableId : null,
    tableNumber: typeof raw.tableNumber === "string" ? raw.tableNumber : null,
    exp: raw.exp,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuth = useCallback((authToken: string, authUser: AuthUser) => {
    setToken(authToken);
    setUser(authUser);
    window.localStorage.setItem(AUTH_STORAGE_KEY, authToken);
  }, []);

  const clearAuth = useCallback(() => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!storedToken) {
      setLoading(false);
      return;
    }

    setToken(storedToken);
    setAuthTokenGetter(() => storedToken);

    void customFetch<{ user: AuthUser }>("/api/auth/me", { method: "GET", responseType: "json" })
      .then((response) => {
        const normalized = normalizeUser(response.user);
        if (!normalized) {
          clearAuth();
          return;
        }
        setUser(normalized);
      })
      .catch(() => {
        clearAuth();
      })
      .finally(() => {
        setLoading(false);
      });
  }, [clearAuth]);

  const loginStaff = useCallback(
    async (payload: StaffLoginPayload): Promise<AuthUser> => {
      const response = await customFetch<AuthApiResponse>("/api/auth/staff-login", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(payload),
      });
      const normalized = normalizeUser(response.user);
      if (!normalized) {
        throw new Error("Invalid auth response.");
      }
      applyAuth(response.token, normalized);
      return normalized;
    },
    [applyAuth],
  );

  const loginGuest = useCallback(
    async (payload: GuestLoginPayload): Promise<AuthUser> => {
      const response = await customFetch<AuthApiResponse>("/api/auth/guest-login", {
        method: "POST",
        responseType: "json",
        body: JSON.stringify(payload),
      });
      const normalized = normalizeUser(response.user);
      if (!normalized) {
        throw new Error("Invalid auth response.");
      }
      applyAuth(response.token, normalized);
      return normalized;
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    clearAuth();
    setAuthTokenGetter(null);
  }, [clearAuth]);

  const hasPermission = useCallback(
    (permission: AppPermission): boolean => {
      if (!user) return false;
      return ROLE_PERMISSIONS[user.role].includes(permission);
    },
    [user],
  );

  const getDefaultPath = useCallback((): string => {
    if (!user) return "/login";
    if (user.role === "guest") {
      if (user.tableId) return `/orders?tableId=${user.tableId}&scan=1`;
      return "/orders";
    }
    if (user.role === "kitchen") return "/kds?station=kitchen";
    if (user.role === "cashier") return "/cashier";
    return "/";
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      token,
      loginStaff,
      loginGuest,
      logout,
      hasPermission,
      getDefaultPath,
    }),
    [getDefaultPath, hasPermission, loading, loginGuest, loginStaff, logout, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
