import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, saveSession } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("redhero_user");
    if (!stored) {
      setLoading(false);
      return;
    }
    api("/auth/me/")
      .then((data) => {
        setUser(data.user);
        setProfile(data.profile);
      })
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const payload = await api("/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveSession(payload);
    setUser(payload.user);
    const me = await api("/auth/me/");
    setProfile(me.profile);
    return payload.user;
  }

  function logout() {
    clearSession();
    setUser(null);
    setProfile(null);
  }

  const value = useMemo(() => ({ user, profile, loading, login, logout, setUser }), [user, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
