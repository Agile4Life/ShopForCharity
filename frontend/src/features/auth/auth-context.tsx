import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { apiFetch } from "../../lib/api-client";
import type { Profile, Role } from "../../types/api";
import { userErrorMessage } from "../../lib/user-errors";
import { notifyError } from "../../lib/feedback";
import { withRequestDeadline } from "../../lib/request-state";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: Role | null;
  isAuthenticated: boolean;
  isSeller: boolean;
  isLoading: boolean;
  profileError: unknown;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    password: string,
    fullName: string,
    phone: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (
    email: string,
  ) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<unknown>(null);
  const profileRequest = useRef(0);

  const fetchProfile = async (accessToken?: string) => {
    const request = ++profileRequest.current;
    try {
      const data = await apiFetch<Profile>("/me", {
        skipIdempotency: true,
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
      });
      if (request === profileRequest.current) { setProfile(data); setProfileError(null); }
      return true;
    } catch (err) {
      if (request === profileRequest.current) {
        setProfileError(err);
        notifyError(err, "Chưa tải được thông tin tài khoản. Vui lòng thử lại.");
      }
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Check initial session
    withRequestDeadline(() => supabase.auth.getSession()).then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error) throw error;
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        fetchProfile(session.access_token).finally(() => {
          if (mounted) setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    }).catch(error => {
      if (mounted) { setProfileError(error); setIsLoading(false); notifyError(error); }
    });

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession) {
        void fetchProfile(newSession.access_token).finally(() => {
          if (mounted) setIsLoading(false);
        });
      } else {
        ++profileRequest.current;
        setProfile(null);
        setProfileError(null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      ++profileRequest.current;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await withRequestDeadline(() => supabase.auth.signInWithPassword({
      email,
      password,
    }), { write: true });
    if (error) {
      return { success: false, error: userErrorMessage(error, "Đăng nhập chưa thành công. Kiểm tra email và mật khẩu.") };
    }
    if (!await fetchProfile(data.session?.access_token)) {
      return { success: false, error: "Đã đăng nhập nhưng chưa tải được tài khoản. Vui lòng thử đăng nhập lại." };
    }
    return { success: true };
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
    phone: string,
  ) => {
    const { data, error } = await withRequestDeadline(() => supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
        },
      },
    }), { write: true });

    if (error) {
      return { success: false, error: userErrorMessage(error, "Chưa tạo được tài khoản. Vui lòng thử lại.") };
    }

    if (data.session) {
      await fetchProfile();
    }

    return { success: true };
  };

  const logout = async () => {
    const { error } = await withRequestDeadline(() => supabase.auth.signOut(), { write: true });
    if (error) throw error;
    ++profileRequest.current;
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileError(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await withRequestDeadline(() => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    }), { write: true });
    if (error) {
      return { success: false, error: userErrorMessage(error, "Chưa gửi được email khôi phục. Vui lòng thử lại.") };
    }
    return { success: true };
  };

  const role = profile?.role ?? null;
  const isAuthenticated = !!user;
  const isSeller = role === "SELLER";

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role,
        isAuthenticated,
        isSeller,
        isLoading,
        profileError,
        login,
        register,
        logout,
        resetPassword,
        refreshProfile: async () => {
          if (!profile || profileError) setIsLoading(true);
          try {
            const { data, error } = await withRequestDeadline(() => supabase.auth.getSession());
            if (error) throw error;
            setSession(data.session);
            setUser(data.session?.user ?? null);
            if (data.session) await fetchProfile(data.session.access_token);
            else { setProfile(null); setProfileError(null); }
          } catch (error) { setProfileError(error); notifyError(error); }
          finally { setIsLoading(false); }
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
