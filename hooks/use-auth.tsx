"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Profile } from "@/types/database";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  resendVerificationEmail: (targetEmail?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = React.createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>("loading");
  const [error, setError] = React.useState<string | null>(null);

  const supabase = React.useMemo(() => createClient(), []);

  const fetchProfile = React.useCallback(
    async (userId: string) => {
      try {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (profileError) {
          console.warn("Could not load user profile:", profileError.message);
          return null;
        }
        return data as Profile;
      } catch (err) {
        console.error("Error fetching profile:", err);
        return null;
      }
    },
    [supabase]
  );

  const refreshProfile = React.useCallback(async () => {
    if (user?.id) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  }, [user?.id, fetchProfile]);

  const refreshUser = React.useCallback(async () => {
    try {
      const {
        data: { user: freshUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !freshUser) {
        return null;
      }

      setUser(freshUser);
      if (freshUser.email_confirmed_at && freshUser.id) {
        const p = await fetchProfile(freshUser.id);
        setProfile(p);
      }
      return freshUser;
    } catch (err) {
      console.error("Error refreshing user:", err);
      return null;
    }
  }, [supabase, fetchProfile]);

  const resendVerificationEmail = React.useCallback(
    async (targetEmail?: string) => {
      const emailToSend = (targetEmail || user?.email || "").trim();
      if (!emailToSend) {
        return { success: false, error: "No email address provided." };
      }
      try {
        const siteUrl =
          typeof window !== "undefined"
            ? window.location.origin
            : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email: emailToSend,
          options: {
            emailRedirectTo: `${siteUrl}/auth/callback`,
          },
        });

        if (resendError) {
          return { success: false, error: resendError.message };
        }
        return { success: true };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || "Failed to resend verification email.",
        };
      }
    },
    [supabase, user?.email]
  );

  React.useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      try {
        const {
          data: { session: initialSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError && isMounted) {
          setError(sessionError.message);
        }

        if (!isMounted) return;

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);
          setStatus("authenticated");

          const userProfile = await fetchProfile(initialSession.user.id);
          if (isMounted) setProfile(userProfile);
        } else {
          setSession(null);
          setUser(null);
          setProfile(null);
          setStatus("unauthenticated");
        }
      } catch {
        if (isMounted) {
          setError("Authentication initialization failed");
          setStatus("unauthenticated");
        }
      }
    }

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !newSession?.user) {
        setSession(null);
        setUser(null);
        setProfile(null);
        setStatus("unauthenticated");
        return;
      }

      setSession(newSession);
      setUser(newSession.user);
      setStatus("authenticated");

      const userProfile = await fetchProfile(newSession.user.id);
      if (isMounted) setProfile(userProfile);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const signOut = React.useCallback(async () => {
    setStatus("loading");
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    } finally {
      setUser(null);
      setProfile(null);
      setSession(null);
      setStatus("unauthenticated");
    }
  }, [supabase]);

  const isLoading = status === "loading";
  const isAuthenticated = status === "authenticated";
  const isEmailVerified = Boolean(user?.email_confirmed_at);

  const contextValue = React.useMemo<AuthState>(
    () => ({
      user,
      profile,
      session,
      status,
      isLoading,
      isAuthenticated,
      isEmailVerified,
      error,
      signOut,
      refreshProfile,
      refreshUser,
      resendVerificationEmail,
    }),
    [
      user,
      profile,
      session,
      status,
      isLoading,
      isAuthenticated,
      isEmailVerified,
      error,
      signOut,
      refreshProfile,
      refreshUser,
      resendVerificationEmail,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
