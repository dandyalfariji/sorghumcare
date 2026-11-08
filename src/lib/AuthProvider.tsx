import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, fetchProfile } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGoogleUser: boolean;
  displayName: string;
  avatarUrl: string | null;
  role: string | null;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  isGoogleUser: false,
  displayName: 'Guest',
  avatarUrl: null,
  role: null,
  isAdmin: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    // Penting: role harus selesai dibaca SEBELUM `loading` dimatikan.
    // Kalau tidak, AdminGuard ter-render lebih dulu dengan isAdmin=false dan
    // langsung melempar admin ke halaman utama (bug masuk /#/admin).
    // Ada batas 5 detik supaya aplikasi tidak menggantung kalau jaringan lambat.
    const loadProfileThen = async (_s: Session | null) => {
      try {
        const profile: any = await Promise.race([
          fetchProfile(),
          new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        setRole(profile?.role ?? null);
      } catch {
        setRole(null);
      } finally {
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      void loadProfileThen(s);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
        void loadProfileThen(s);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      console.error('Google sign-in error:', error.message);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign-out error:', error.message);
      throw error;
    }
  }, []);

  const isGoogleUser = !!user && user.app_metadata?.provider === 'google';

  const isAdmin = role === 'admin';

  // Extract display info from Google user metadata
  const displayName = isGoogleUser
    ? (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User')
    : 'Guest';

  const avatarUrl = isGoogleUser
    ? (user.user_metadata?.avatar_url || user.user_metadata?.picture || null)
    : null;

  return (
    <AuthContext.Provider
      value={{ user, session, loading, isGoogleUser, displayName, avatarUrl, role, isAdmin, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
