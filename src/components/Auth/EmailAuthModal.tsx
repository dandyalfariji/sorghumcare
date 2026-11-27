import React, { useEffect, useRef, useState } from 'react';
import { Mail, Lock, Loader2, X, User, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/AuthProvider';
import { MIN_PASSWORD_LENGTH, isValidEmail, isValidPassword, translateAuthError } from '../../lib/authErrors';

/**
 * Modal masuk / daftar dengan email + kata sandi.
 *
 * KENAPA DIBUAT SEBAGAI MODAL
 * ---------------------------
 * Sebelumnya satu-satunya cara masuk adalah tombol Google OAuth, dan tombol itu
 * langsung melempar pengguna keluar dari aplikasi ke accounts.google.com. Modal
 * ini menjaga pengguna tetap di halaman: form pendaftaran, form masuk, dan
 * pemulihan kata sandi semuanya terjadi di sini, tanpa kehilangan konteks.
 *
 * ALUR YANG DIDUKUNG
 * ------------------
 *  signin    : email + kata sandi -> masuk
 *  signup    : nama + email + kata sandi -> kirim email verifikasi
 *  forgot    : email -> kirim tautan reset kata sandi
 *  verify    : setelah daftar, tawarkan "kirim ulang email" atau langsung masuk
 *
 * PENTING
 * -------
 * Semua teks ditulis dalam Bahasa Indonesia TANPA terjemahan otomatis, karena
 * tombol/kalimat di sini mengandung nilai dinamis (email pengguna, sisa detik)
 * yang tidak cocok dengan kamus LanguageProvider.
 */
export type AuthModalMode = 'signin' | 'signup' | 'forgot';

interface EmailAuthModalProps {
  open: boolean;
  /** Mode awal saat modal dibuka. */
  initialMode?: AuthModalMode;
  onClose: () => void;
  /** Dipanggil setelah pengguna benar-benar masuk (sesi aktif). */
  onSuccess?: () => void;
}

export const EmailAuthModal: React.FC<EmailAuthModalProps> = ({
  open,
  initialMode = 'signin',
  onClose,
  onSuccess,
}) => {
  const {
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    hasAccount,
  } = useAuth();

  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Setelah pendaftaran yang butuh konfirmasi email kita tampilkan panel
  // "cek kotak masuk" alih-alih menutup modal — pengguna belum punya sesi.
  const [awaitingVerifyFor, setAwaitingVerifyFor] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // Setel ulang seluruh form setiap kali modal dibuka, supaya sisa isian
  // percobaan sebelumnya (termasuk pesan error) tidak ikut terbawa.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
    setShowPassword(false);
    setAwaitingVerifyFor(null);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open, initialMode]);

  // Tutup modal begitu sesi akun asli aktif (mis. pengguna menyelesaikan login
  // lewat tab lain, atau klik tautan verifikasi di tab yang sama).
  useEffect(() => {
    if (open && hasAccount) {
      onSuccess?.();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasAccount]);

  // Esc untuk menutup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const switchMode = (next: AuthModalMode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirm('');
  };

  // ---- Aksi --------------------------------------------------------------

  const handleSignin = async () => {
    if (!isValidEmail(email)) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (!password) {
      setError('Kata sandi belum diisi.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signInWithEmail(email, password);
    setBusy(false);
    if (!res.ok) {
      setError(translateAuthError(res.message));
      return;
    }
    onSuccess?.();
    onClose();
  };

  const handleSignup = async () => {
    if (!isValidEmail(email)) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    if (!isValidPassword(password)) {
      setError(`Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter.`);
      return;
    }
    if (password !== confirm) {
      setError('Konfirmasi kata sandi tidak sama.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await signUpWithEmail(email, password, fullName);
    setBusy(false);
    if (!res.ok) {
      setError(translateAuthError(res.message));
      return;
    }
    if (res.code === 'verify_email') {
      // Belum ada sesi: tampilkan instruksi, jangan tutup modal.
      setAwaitingVerifyFor(email.trim());
      setInfo(res.message);
      return;
    }
    onSuccess?.();
    onClose();
  };

  const handleForgot = async () => {
    if (!isValidEmail(email)) {
      setError('Masukkan alamat email yang valid.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sendPasswordReset(email);
    setBusy(false);
    if (!res.ok) {
      setError(translateAuthError(res.message));
      return;
    }
    setInfo(res.message);
  };

  const handleResend = async () => {
    if (!awaitingVerifyFor) return;
    setBusy(true);
    setError(null);
    const res = await resendVerificationEmail(awaitingVerifyFor);
    setBusy(false);
    if (!res.ok) {
      setError(translateAuthError(res.message));
      return;
    }
    setInfo(res.message);
  };

  // ---- Tampilan ----------------------------------------------------------

  const inputClass =
    'w-full pl-10 pr-10 py-3 bg-white border border-[#c2c8c0] rounded-xl text-sm text-[#1A1C1B] ' +
    'placeholder-[#727972] focus:outline-none focus:border-[#163422] focus:ring-1 focus:ring-[#163422]';

  const primaryBtn =
    'w-full py-3 rounded-xl bg-[#163422] text-white text-sm font-bold hover:bg-[#2d4b37] ' +
    'transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer';

  const heading =
    mode === 'signup' ? 'Daftar Akun Baru' : mode === 'forgot' ? 'Lupa Kata Sandi' : 'Masuk ke Akun';

  const subheading = awaitingVerifyFor
    ? 'Satu langkah lagi sebelum akun Anda aktif.'
    : mode === 'signup'
      ? 'Cukup email dan kata sandi — tanpa perlu akun Google.'
      : mode === 'forgot'
        ? 'Kami akan mengirim tautan untuk membuat kata sandi baru.'
        : 'Gunakan email dan kata sandi akun Anda.';

  /** Pesan error dijalankan lewat penerjemah supaya konsisten. */
  const errorBox = error ? (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-[#ffdad6]/60 text-[#8c1d18] text-xs leading-relaxed">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  ) : null;

  const infoBox = info ? (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-[#cbebc3]/50 text-[#324d30] text-xs leading-relaxed">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{info}</span>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-[#1a1c1b]/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-3">
          <div>
            <h3 className="font-bold text-lg text-[#163422] leading-tight">{heading}</h3>
            <p className="text-xs text-[#727972] mt-0.5">{subheading}</p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            aria-label="Tutup"
            className="w-7 h-7 rounded-full bg-[#f4f4f2] flex items-center justify-center text-[#424843] hover:bg-[#e2e3e1] disabled:opacity-50 flex-shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorBox}
        {infoBox}

        {/* ---------- Panel "cek email" setelah daftar ---------- */}
        {awaitingVerifyFor ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#f4f4f2] text-xs text-[#424843] leading-relaxed">
              Tautan verifikasi dikirim ke <span className="font-bold">{awaitingVerifyFor}</span>.
              Buka tautan tersebut, lalu kembali ke sini dan masuk.
            </div>
            <p className="text-[11px] text-[#727972] leading-relaxed">
              Tidak menemukan emailnya? Periksa folder <span className="font-semibold">Spam</span> atau
              <span className="font-semibold"> Promosi</span>, lalu kirim ulang.
            </p>
            <button type="button" onClick={handleResend} disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              <span>Kirim ulang email verifikasi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAwaitingVerifyFor(null);
                setInfo(null);
                switchMode('signin');
              }}
              disabled={busy}
              className="w-full py-2.5 rounded-xl border border-[#c2c8c0] text-xs font-bold text-[#163422] hover:bg-[#f4f4f2] disabled:opacity-60 cursor-pointer"
            >
              Sudah verifikasi — Masuk
            </button>
          </div>
        ) : mode === 'forgot' ? (
          /* ---------- Form lupa kata sandi ---------- */
          <div className="space-y-3">
            <div>
              <label htmlFor="auth-forgot-email" className="block text-xs font-bold text-[#424843] mb-1">
                Email
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                <input
                  id="auth-forgot-email"
                  ref={firstFieldRef}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleForgot()}
                  placeholder="nama@contoh.com"
                  className={inputClass}
                />
              </div>
            </div>
            <button type="button" onClick={handleForgot} disabled={busy} className={primaryBtn}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              <span>Kirim tautan reset</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              disabled={busy}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-[#424843] hover:text-[#163422] disabled:opacity-60 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke form masuk</span>
            </button>
          </div>
        ) : (
          /* ---------- Form masuk / daftar ---------- */
          <div className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-name" className="block text-xs font-bold text-[#424843] mb-1">
                  Nama Lengkap <span className="font-normal text-[#727972]">(opsional)</span>
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                  <input
                    id="auth-name"
                    ref={firstFieldRef}
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama Anda"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-bold text-[#424843] mb-1">
                Email
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                <input
                  id="auth-email"
                  ref={mode === 'signup' ? undefined : firstFieldRef}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (mode === 'signup' ? handleSignup() : handleSignin())}
                  placeholder="nama@contoh.com"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="auth-password" className="block text-xs font-bold text-[#424843]">
                  Kata Sandi
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-[11px] font-semibold text-[#163422] hover:underline cursor-pointer"
                  >
                    Lupa kata sandi?
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (mode === 'signup' ? handleSignup() : handleSignin())}
                  placeholder={mode === 'signup' ? `Minimal ${MIN_PASSWORD_LENGTH} karakter` : 'Kata sandi Anda'}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute right-3 text-[#727972] hover:text-[#163422] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="auth-confirm" className="block text-xs font-bold text-[#424843] mb-1">
                  Ulangi Kata Sandi
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                  <input
                    id="auth-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                    placeholder="Ulangi kata sandi"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={mode === 'signup' ? handleSignup : handleSignin}
              disabled={busy}
              className={primaryBtn}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{mode === 'signup' ? 'Daftar' : 'Masuk'}</span>
            </button>

            <div className="text-center text-xs text-[#727972]">
              {mode === 'signup' ? (
                <>
                  Sudah punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="font-bold text-[#163422] hover:underline cursor-pointer"
                  >
                    Masuk di sini
                  </button>
                </>
              ) : (
                <>
                  Belum punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="font-bold text-[#163422] hover:underline cursor-pointer"
                  >
                    Daftar sekarang
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailAuthModal;
