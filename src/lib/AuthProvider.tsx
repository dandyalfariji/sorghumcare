import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, fetchProfile } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGoogleUser: boolean;
  displayName: string;
  /** Nama lengkap yang disimpan pengguna di halaman Profil (profiles.full_name). */
  profileName: string | null;
  /** Status / bio singkat (profiles.bio). */
  profileBio: string | null;
  avatarUrl: string | null;
  role: string | null;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Muat ulang profil dari DB — dipanggil setelah menyimpan edit profil,
   *  supaya semua halaman (Home, Profile, Sidebar) ikut berubah tanpa reload. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  isGoogleUser: false,
  displayName: 'Guest',
  profileName: null,
  profileBio: null,
  avatarUrl: null,
  role: null,
  isAdmin: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileBio, setProfileBio] = useState<string | null>(null);

  /** Ambil profil (role + nama + bio) dari DB. Dipakai saat login DAN saat
   *  pengguna menyimpan edit profil — dulu tidak ada `refreshProfile`,
   *  sehingga perubahan hanya hidup di state lokal dan hilang saat reload. */
  const refreshProfile = useCallback(async () => {
    try {
      const profile: any = await Promise.race([
        fetchProfile(),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      setRole(profile?.role ?? null);
      setProfileName(profile?.full_name ?? null);
      setProfileBio(profile?.bio ?? null);
    } catch {
      setRole(null);
    }
  }, []);

  useEffect(() => {
    // Penting: role harus selesai dibaca SEBELUM `loading` dimatikan.
    // Kalau tidak, AdminGuard ter-render lebih dulu dengan isAdmin=false dan
    // langsung melempar admin ke halaman utama (bug masuk /#/admin).
    // Ada batas 5 detik supaya aplikasi tidak menggantung kalau jaringan lambat.
    const loadProfileThen = async (_s: Session | null) => {
      try {
        await refreshProfile();
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

  // Nama dari akun Google (kalau login lewat Google).
  const googleName = isGoogleUser
    ? (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '')
    : '';

  // Nama tampilan = nama yang DIISI pengguna di halaman Profil, baru fallback
  // ke nama Google, lalu 'Guest'. Dulu nilainya selalu 'Guest' untuk anonim
  // dan nama Google untuk akun Google — sehingga hasil edit profil tidak pernah
  // muncul di Home/Profil/Sidebar.
  const displayName = profileName?.trim() || googleName || 'Guest';

  const avatarUrl = isGoogleUser
    ? (user.user_metadata?.avatar_url || user.user_metadata?.picture || null)
    : null;

  return (
    <AuthContext.Provider
      value={{ user, session, loading, isGoogleUser, displayName, profileName, profileBio, avatarUrl, role, isAdmin, signInWithGoogle, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
