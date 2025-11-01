import { supabase } from "@/lib/supabaseClient";
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

interface AuthContextValue {
  user: Awaited<ReturnType<NonNullable<typeof supabase>["auth"]["getUser"]>>["data"]["user"] | null;
  loading: boolean;
  signInWithGithub: () => Promise<void>;
  signInWithAzure: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isConfigured = Boolean(supabase);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isConfigured,
      signInWithGithub: async () => {
        if (!supabase) throw new Error("Supabase not configured");
        await supabase.auth.signInWithOAuth({
          provider: "github",
          options: { redirectTo: window.location.origin },
        });
      },
      signInWithAzure: async () => {
        if (!supabase) throw new Error("Supabase not configured");
        await supabase.auth.signInWithOAuth({
          provider: "azure",
          options: { redirectTo: window.location.origin },
        });
      },
      signInWithEmail: async (email: string) => {
        if (!supabase) throw new Error("Supabase not configured");
        await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [user, loading, isConfigured]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
};
