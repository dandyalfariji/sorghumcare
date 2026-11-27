/**
 * Penerjemah pesan error Supabase Auth -> Bahasa Indonesia.
 *
 * KENAPA FILE INI ADA
 * -------------------
 * Pesan dari GoTrue selalu berbahasa Inggris ("Invalid login credentials",
 * "Email not confirmed", dst). Menampilkannya apa adanya di modal login membuat
 * pengguna tidak tahu apa yang harus dilakukan — terutama pada dua kasus yang
 * paling sering terjadi: kata sandi salah, dan email belum dikonfirmasi.
 *
 * CATATAN
 * -------
 * Pesan dicocokkan dengan `includes` (bukan `===`) karena GoTrue kadang
 * menambahkan detail setelah pesan utamanya, mis.
 * "For security purposes, you can only request this after 47 seconds.".
 * Pesan asli tetap dicetak ke console oleh pemanggil, jadi debugging tidak
 * kehilangan informasi.
 */

/** Petakan pesan error Supabase Auth ke pesan yang bisa ditindaklanjuti. */
export function translateAuthError(rawMessage: string | null | undefined): string {
  const msg = (rawMessage || '').trim();
  if (!msg) return 'Terjadi kesalahan. Coba lagi.';
  const m = msg.toLowerCase();

  // --- Kredensial & sesi ---------------------------------------------------
  if (m.includes('invalid login credentials')) {
    return 'Email atau kata sandi salah. Periksa kembali, atau gunakan "Lupa kata sandi?".';
  }
  if (m.includes('auth session missing') || m.includes('session missing')) {
    return 'Sesi tidak ditemukan. Silakan masuk lagi.';
  }
  if (m.includes('invalid refresh token') || m.includes('refresh token not found')) {
    return 'Sesi sudah kedaluwarsa. Silakan masuk lagi.';
  }

  // --- Konfirmasi email ----------------------------------------------------
  if (m.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi. Buka tautan verifikasi di kotak masuk Anda, lalu masuk kembali.';
  }
  if (m.includes('email address not authorized')) {
    return 'Email ini tidak diizinkan mendaftar pada proyek ini.';
  }

  // --- Pendaftaran ---------------------------------------------------------
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'Email ini sudah terdaftar. Silakan masuk, atau gunakan "Lupa kata sandi?".';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'Pendaftaran akun baru sedang dinonaktifkan. Hubungi admin.';
  }
  if (m.includes('anonymous sign-ins are disabled')) {
    return 'Sesi tamu dinonaktifkan pada proyek ini.';
  }

  // --- Kata sandi ----------------------------------------------------------
  if (m.includes('password should be at least')) {
    // GoTrue menulis angkanya, mis. "...at least 6 characters".
    const n = /at least (\d+)/.exec(m);
    return `Kata sandi minimal ${n ? n[1] : '6'} karakter.`;
  }
  if (m.includes('weak password') || m.includes('password is too weak')) {
    return 'Kata sandi terlalu lemah. Gunakan kombinasi huruf dan angka yang lebih panjang.';
  }
  if (m.includes('new password should be different')) {
    return 'Kata sandi baru harus berbeda dari kata sandi lama.';
  }
  if (m.includes('same password')) {
    return 'Kata sandi baru sama dengan yang lama. Pilih kata sandi lain.';
  }

  // --- Email tidak valid ---------------------------------------------------
  if (m.includes('unable to validate email address') || m.includes('invalid format')) {
    return 'Format email tidak valid. Contoh yang benar: nama@contoh.com';
  }

  // --- Batas laju / kuota ---------------------------------------------------
  if (m.includes('rate limit') || m.includes('for security purposes') || m.includes('too many requests')) {
    const secs = /after (\d+) seconds?/.exec(m);
    return secs
      ? `Terlalu banyak percobaan. Coba lagi dalam ${secs[1]} detik.`
      : 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
  }
  if (m.includes('email rate limit exceeded')) {
    return 'Batas pengiriman email tercapai. Tunggu beberapa menit lalu coba lagi.';
  }

  // --- Konfigurasi / jaringan ----------------------------------------------
  if (m.includes('provider is not enabled')) {
    return 'Metode login ini belum diaktifkan pada proyek Supabase.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed')) {
    return 'Tidak bisa menghubungi server. Periksa koneksi internet Anda.';
  }

  // Fallback: tampilkan pesan aslinya supaya tidak ada informasi yang hilang.
  return msg;
}

/**
 * Validasi format email di sisi klien.
 * Supabase tetap memvalidasi ulang; ini hanya agar pengguna tidak menunggu
 * perjalanan bolak-balik jaringan untuk kesalahan ketik yang jelas.
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Panjang minimum kata sandi. Harus sama dengan setelan Supabase (default 6). */
export const MIN_PASSWORD_LENGTH = 6;

/** Apakah kata sandi memenuhi syarat minimum? */
export function isValidPassword(value: string): boolean {
  return value.length >= MIN_PASSWORD_LENGTH;
}
