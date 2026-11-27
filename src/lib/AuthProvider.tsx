import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, fetchProfile } from './supabase';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Hasil operasi auth yang bisa ditindaklanjuti UI.
 *
 * `code: 'verify_email'` dipakai saat pendaftaran berhasil tetapi Supabase masih
 * menuntut konfirmasi email — pengguna BELUM punya sesi pada titik itu, jadi UI
 * harus menampilkan layar "cek kotak masuk", bukan langsung menganggapnya masuk.
 */
export interface AuthActionResult {
  ok: boolean;
  /** Pesan siap tampil (sudah Bahasa Indonesia). */
  message: string;
  code?: 'verify_email' | 'signed_in';
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isGoogleUser: boolean;
  /** Punya email + kata sandi (bukan Google, bukan tamu). */
  isEmailUser: boolean;
  /** Pengguna asli (bukan sesi anonim "tamu"). Ini yang membuka fitur terkunci. */
  hasAccount: boolean;
  /** Sudah konfirmasi email? Akun Google selalu dianggap terverifikasi. */
  emailVerified: boolean;
  displayName: string;
  /** Nama lengkap yang disimpan pengguna di halaman Profil (profiles.full_name). */
  profileName: string | null;
  /** Status / bio singkat (profiles.bio). */
  profileBio: string | null;
  avatarUrl: string | null;
  role: string | null;
  isAdmin: boolean;
  /** True saat pengguna baru saja kembali dari tautan reset kata sandi. */
  isPasswordRecovery: boolean;
  signInWithGoogle: () => Promise<void>;
  /** Daftar akun baru dengan email + kata sandi. */
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<AuthActionResult>;
  /** Masuk dengan email + kata sandi. */
  signInWithEmail: (email: string, password: string) => Promise<AuthActionResult>;
  /** Kirim tautan reset kata sandi ke email. */
  sendPasswordReset: (email: string) => Promise<AuthActionResult>;
  /** Set kata sandi baru (dipakai setelah tautan reset). */
  updatePassword: (newPassword: string) => Promise<AuthActionResult>;
  /** Kirim ulang email verifikasi untuk akun yang belum dikonfirmasi. */
  resendVerificationEmail: (email: string) => Promise<AuthActionResult>;
  /** Tutup mode pemulihan setelah pengguna selesai mengganti kata sandi. */
  clearPasswordRecovery: () => void;
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
  isEmailUser: false,
  hasAccount: false,
  emailVerified: false,
  displayName: 'Guest',
  profileName: null,
  profileBio: null,
  avatarUrl: null,
  role: null,
  isAdmin: false,
  isPasswordRecovery: false,
  signInWithGoogle: async () => {},
  signUpWithEmail: async () => ({ ok: false, message: '' }),
  signInWithEmail: async () => ({ ok: false, message: '' }),
  sendPasswordReset: async () => ({ ok: false, message: '' }),
  updatePassword: async () => ({ ok: false, message: '' }),
  resendVerificationEmail: async () => ({ ok: false, message: '' }),
  clearPasswordRecovery: () => {},
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

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
      (event, s) => {
        // Supabase memakai event PASSWORD_RECOVERY untuk menandai bahwa sesi ini
        // berasal dari tautan "lupa kata sandi" — bukan login biasa. UI harus
        // menampilkan form kata sandi baru, bukan menganggap pengguna sudah masuk.
        if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
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

  /** Daftar akun baru dengan email + kata sandi. */
  const signUpWithEmail = useCallback(
    async (email: string, password: string, fullName?: string): Promise<AuthActionResult> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Dibaca trigger `handle_new_user` untuk mengisi profiles.full_name,
          // jadi nama pengguna langsung tersedia tanpa perlu mengisi ulang
          // di halaman Profil.
          data: fullName?.trim() ? { full_name: fullName.trim() } : undefined,
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) {
        console.error('Email sign-up error:', error.message);
        return { ok: false, message: error.message };
      }
      // Dua kemungkinan yang harus dibedakan:
      //  - identities kosong  -> email SUDAH terdaftar (Supabase menyembunyikan
      //    ini sebagai "sukses" demi keamanan, agar tidak bisa dipakai menebak
      //    email mana yang punya akun).
      //  - session null       -> akun dibuat, tetapi menunggu konfirmasi email.
      const alreadyRegistered = Array.isArray(data?.user?.identities) && data.user!.identities!.length === 0;
      if (alreadyRegistered) {
        return {
          ok: false,
          message: 'Email ini sudah terdaftar. Silakan masuk, atau gunakan "Lupa kata sandi?".',
        };
      }
      if (!data?.session) {
        return {
          ok: true,
          code: 'verify_email',
          message: 'Akun dibuat. Kami mengirim tautan verifikasi ke email Anda — buka tautan itu sebelum masuk.',
        };
      }
      return { ok: true, code: 'signed_in', message: 'Akun berhasil dibuat dan Anda sudah masuk.' };
    },
    [],
  );

  /** Masuk dengan email + kata sandi. */
  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        console.error('Email sign-in error:', error.message);
        return { ok: false, message: error.message };
      }
      return { ok: true, code: 'signed_in', message: 'Berhasil masuk.' };
    },
    [],
  );

  /** Kirim tautan reset kata sandi. */
  const sendPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      console.error('Password reset error:', error.message);
      return { ok: false, message: error.message };
    }
    // Selalu balas "terkirim" walau emailnya tidak terdaftar: Supabase berperilaku
    // sama, dan memberi tahu mana yang terdaftar akan membocorkan daftar pengguna.
    return {
      ok: true,
      message: 'Kalau email itu terdaftar, kami sudah mengirim tautan untuk mengganti kata sandi.',
    };
  }, []);

  /** Set kata sandi baru (setelah tautan reset). */
  const updatePassword = useCallback(async (newPassword: string): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      console.error('Password update error:', error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Kata sandi berhasil diperbarui. Anda sudah masuk dengan kata sandi baru.' };
  }, []);

  /** Kirim ulang email verifikasi. */
  const resendVerificationEmail = useCallback(async (email: string): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      console.error('Resend verification error:', error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Email verifikasi dikirim ulang. Periksa kotak masuk dan folder spam.' };
  }, []);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign-out error:', error.message);
      throw error;
    }
  }, []);

  const isGoogleUser = !!user && user.app_metadata?.provider === 'google';
  const isEmailUser = !!user && user.app_metadata?.provider === 'email';
  // Sesi anonim Supabase membawa flag `is_anonymous`. Pengguna anonim punya
  // `user`, tapi bukan akun — dan hanya akun asli yang boleh menyimpan resep
  // (koleksi anonim hidup di localStorage dan hilang saat browser dibersihkan).
  const isAnonymousUser = !!user && (user as unknown as { is_anonymous?: boolean }).is_anonymous === true;
  const hasAccount = !!user && !isAnonymousUser;
  // Google tidak punya langkah konfirmasi email; email/password punya.
  const emailVerified = isGoogleUser || !!user?.email_confirmed_at;

  const isAdmin = role === 'admin';

  // Nama dari akun Google (kalau login lewat Google).
  const googleName = isGoogleUser
    ? (user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '')
    : '';

  // Nama tampilan = nama yang DIISI pengguna di halaman Profil, baru fallback
  // ke nama Google/meta pendaftaran, lalu 'Guest'.
  const metaName = (user?.user_metadata?.full_name || user?.user_metadata?.name || '') as string;
  const displayName = profileName?.trim() || googleName || metaName || 'Guest';

  const avatarUrl = isGoogleUser
    ? (user.user_metadata?.avatar_url || user.user_metadata?.picture || null)
    : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isGoogleUser,
        isEmailUser,
        hasAccount,
        emailVerified,
        displayName,
        profileName,
        profileBio,
        avatarUrl,
        role,
        isAdmin,
        isPasswordRecovery,
        signInWithGoogle,
        signUpWithEmail,
        signInWithEmail,
        sendPasswordReset,
        updatePassword,
        resendVerificationEmail,
        clearPasswordRecovery,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
