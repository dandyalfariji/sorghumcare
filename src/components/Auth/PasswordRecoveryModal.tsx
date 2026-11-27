import React, { useEffect, useRef, useState } from 'react';
import { Lock, Loader2, Eye, EyeOff, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/AuthProvider';
import { MIN_PASSWORD_LENGTH, isValidPassword, translateAuthError } from '../../lib/authErrors';

/**
 * Modal "Buat Kata Sandi Baru".
 *
 * Muncul otomatis ketika Supabase mengirim event PASSWORD_RECOVERY — yaitu saat
 * pengguna membuka tautan reset dari email. Pada titik itu pengguna SUDAH punya
 * sesi sementara, tetapi belum mengganti kata sandinya; kalau modal ini tidak
 * ditampilkan, tautan reset tidak terasa berefek apa pun bagi pengguna.
 *
 * Teks ditulis langsung (tanpa kamus LanguageProvider) karena memuat panjang
 * minimum kata sandi sebagai nilai dinamis.
 */
export const PasswordRecoveryModal: React.FC = () => {
  const { isPasswordRecovery, updatePassword, clearPasswordRecovery, displayName } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isPasswordRecovery) {
      // Bersihkan saat modal tidak aktif supaya sesi pemulihan berikutnya mulai
      // dari form kosong, bukan sisa isian sebelumnya.
      setPassword('');
      setConfirm('');
      setError(null);
      setDone(false);
      setShow(false);
      return;
    }
    const t = setTimeout(() => firstRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [isPasswordRecovery]);

  if (!isPasswordRecovery) return null;

  const handleSubmit = async () => {
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
    const res = await updatePassword(password);
    setBusy(false);
    if (!res.ok) {
      setError(translateAuthError(res.message));
      return;
    }
    setDone(true);
  };

  const inputClass =
    'w-full pl-10 pr-10 py-3 bg-white border border-[#c2c8c0] rounded-xl text-sm text-[#1A1C1B] ' +
    'placeholder-[#727972] focus:outline-none focus:border-[#163422] focus:ring-1 focus:ring-[#163422]';

  return (
    <div className="fixed inset-0 z-[70] bg-[#1a1c1b]/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buat kata sandi baru"
        className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl"
      >
        {done ? (
          <>
            <div className="flex flex-col items-center text-center gap-2 pt-2">
              <div className="w-12 h-12 rounded-full bg-[#cbebc3] text-[#324d30] flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-[#163422]">Kata sandi diperbarui</h3>
              <p className="text-xs text-[#727972] leading-relaxed">
                Kata sandi baru sudah aktif. Anda tetap masuk sebagai{' '}
                <span className="font-bold">{displayName}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={clearPasswordRecovery}
              className="w-full py-3 rounded-xl bg-[#163422] text-white text-sm font-bold hover:bg-[#2d4b37] transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-[#fdc65c]" />
              <span>Mulai jelajahi</span>
            </button>
          </>
        ) : (
          <>
            <div>
              <h3 className="font-bold text-lg text-[#163422] leading-tight">Buat Kata Sandi Baru</h3>
              <p className="text-xs text-[#727972] mt-0.5">
                Anda membuka tautan reset. Tentukan kata sandi baru untuk akun Anda.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[#ffdad6]/60 text-[#8c1d18] text-xs leading-relaxed">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="recovery-password" className="block text-xs font-bold text-[#424843] mb-1">
                  Kata Sandi Baru
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                  <input
                    id="recovery-password"
                    ref={firstRef}
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Minimal ${MIN_PASSWORD_LENGTH} karakter`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                    className="absolute right-3 text-[#727972] hover:text-[#163422] cursor-pointer"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="recovery-confirm" className="block text-xs font-bold text-[#424843] mb-1">
                  Ulangi Kata Sandi Baru
                </label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-[#727972] absolute left-3.5 pointer-events-none" />
                  <input
                    id="recovery-confirm"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Ulangi kata sandi baru"
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy}
                className="w-full py-3 rounded-xl bg-[#163422] text-white text-sm font-bold hover:bg-[#2d4b37] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Simpan kata sandi baru</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PasswordRecoveryModal;
