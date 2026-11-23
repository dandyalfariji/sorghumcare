import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Check, Play, Pause, Trash2, Send, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';

interface ChatInputBarProps {
  onSendMessage: (text: string) => void;
  isLoading?: boolean;
  dynamicPrompts?: string[];
  /**
   * Tampilkan baris chip "Inspirasi" (saran prompt).
   *
   * Hanya relevan saat percakapan masih kosong: setelah pengguna mengirim
   * prompt pertamanya, chip saran itu ikut "menempel" di atas kolom input dan
   * terlihat seperti bagian dari jawaban — teksnya jadi dobel dengan saran
   * lanjutan yang sudah ditulis AI di dalam balasannya. Karena itu baris ini
   * disembunyikan begitu ada pesan.
   */
  showSuggestions?: boolean;
}

/** Fase perekaman suara: diam, sedang merekam, atau sudah ada rekaman. */
type RecState = 'idle' | 'recording' | 'recorded';

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSendMessage,
  isLoading = false,
  dynamicPrompts,
  showSuggestions = true,
}) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  /** Pesan kegagalan voice input yang ditampilkan ke pengguna (null = tidak ada). */
  const [voiceError, setVoiceError] = useState<string | null>(null);
  /** Info netral (bukan error) — dipakai saat transkripsi tidak tersedia. */
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  // ── Perekaman audio (alur ala ChatGPT: rekam → putar ulang → kirim) ──
  const [recState, setRecState] = useState<RecState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  /** Instance SpeechRecognition aktif (jalur transkripsi otomatis). */
  const recognitionRef = useRef<any>(null);
  /**
   * Instance MediaRecorder aktif. Dipakai HANYA sebagai cadangan saat
   * transkripsi otomatis gagal, supaya mikrofon yang sudah diizinkan tidak
   * hangus dan pengguna tetap bisa memeriksa ucapannya.
   */
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  /** false = transkripsi otomatis tidak bisa dipakai -> rekam + putar ulang. */
  const [sttUnavailable, setSttUnavailable] = useState(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const fallbackPrompts = [
    'Apa itu sorgum?',
    'Manfaat sorgum untuk kesehatan',
    'Kandungan gizi sorgum vs nasi',
    'Kenapa sorgum cocok untuk diabetes?',
  ];

  const quickPrompts = (dynamicPrompts && dynamicPrompts.length >= 2) ? dynamicPrompts : fallbackPrompts;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  /** Bersihkan timer + stream mikrofon. */
  const cleanupRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    setSeconds(0);
    setIsPlaying(false);
  };

  // Bersihkan resource saat komponen dilepas supaya mikrofon tidak menyala terus.
  useEffect(() => {
    return () => {
      cleanupRecording();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Terjemahkan kode error SpeechRecognition menjadi kalimat yang bisa
   * ditindaklanjuti pengguna.
   *
   * Catatan penting: kode `network` TIDAK berarti internet pengguna bermasalah.
   * Brave memblokir layanan pengenalan suara Google, sehingga browser
   * melaporkan `network` walau koneksi normal. Pesan lama menyuruh pengguna
   * "periksa koneksi" — itu menyesatkan, jadi kasus itu ditangani terpisah di
   * onerror dan dialihkan ke perekaman.
   */
  const describeVoiceError = (code: string): string | null => {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Mikrofon tidak bisa diakses. Izinkan akses mikrofon untuk situs ini di pengaturan browser Anda.';
      case 'audio-capture':
        return 'Mikrofon tidak terdeteksi. Pastikan mikrofon terpasang dan tidak sedang dipakai aplikasi lain.';
      case 'no-speech':
        return 'Tidak ada suara yang terdeteksi. Silakan coba lagi dan bicara lebih dekat ke mikrofon.';
      case 'aborted':
        return null;
      default:
        return `Input suara gagal (${code}). Anda masih bisa mengetik pertanyaan secara langsung.`;
    }
  };

  /** Hentikan sesi pengenalan yang sedang berjalan. */
  const stopListening = () => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* sudah berhenti — abaikan */
      }
    }
    setIsListening(false);
  };

  // ─────────────────────────────────────────────────────────────────
  //  Perekaman audio (MediaRecorder)
  // ─────────────────────────────────────────────────────────────────

  /** Mulai merekam. Pengguna sendiri yang menekan stop saat selesai. */
  const startRecording = async () => {
    setVoiceError(null);
    setVoiceNotice(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Browser ini tidak mendukung perekaman audio. Silakan ketik pertanyaan langsung.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setVoiceError('Browser ini tidak mendukung perekaman audio. Silakan ketik pertanyaan langsung.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 0) {
          setAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          setRecState('recorded');
        } else {
          setRecState('idle');
          setVoiceError('Rekaman kosong — mikrofon tidak menangkap suara. Coba lagi.');
        }
        cleanupRecording();
      };

      recorder.start();
      setRecState('recording');
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      cleanupRecording();
      setRecState('idle');
      const name = err?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setVoiceError(
          'Akses mikrofon ditolak. Klik ikon kunci/mikrofon di address bar browser, izinkan mikrofon, lalu coba lagi.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setVoiceError('Mikrofon tidak ditemukan. Pastikan perangkat mikrofon terpasang.');
      } else if (name === 'NotReadableError') {
        setVoiceError('Mikrofon sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.');
      } else {
        setVoiceError(`Gagal memulai perekaman (${name || 'tidak diketahui'}). Coba lagi.`);
      }
    }
  };

  /** Hentikan perekaman; rekaman disimpan dan siap diputar ulang. */
  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop(); // onstop yang menyelesaikan penyimpanan blob
      } catch {
        cleanupRecording();
        setRecState('idle');
      }
    } else {
      cleanupRecording();
      setRecState('idle');
    }
  };

  /** Putar / hentikan pratinjau rekaman. */
  const togglePlayback = () => {
    const el = audioElRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.currentTime = 0;
      el.play().then(() => setIsPlaying(true)).catch(() => {
        setVoiceError('Rekaman tidak bisa diputar di browser ini.');
      });
    }
  };

  /** Buang rekaman, mulai dari awal. */
  const discardRecording = () => {
    if (audioElRef.current) audioElRef.current.pause();
    setAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setIsPlaying(false);
    setRecState('idle');
    setSeconds(0);
    setVoiceNotice(null);
  };

  const handleVoiceToggle = () => {
    setVoiceError(null);

    if (recState === 'recording') {
      stopRecording();
      return;
    }
    if (recState === 'recorded') return; // tunggu aksi di panel pratinjau

    // Audio sudah direkam -> tidak perlu transkripsi lagi; panel pratinjau aktif.
    if (sttUnavailable) {
      startRecording();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Tidak ada API transkripsi -> langsung ke perekaman, jangan menyerah.
      setSttUnavailable(true);
      setVoiceNotice(
        'Browser ini tidak punya transkripsi otomatis. Rekam suara Anda, putar ulang untuk memastikan, lalu kirim.'
      );
      startRecording();
      return;
    }
    startSpeechRecognition(SpeechRecognition);
  };

  /** Jalur transkripsi langsung (Chrome/Edge/Safari). */
  const startSpeechRecognition = (SpeechRecognition: any) => {
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript ?? '';
        if (transcript) {
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        recognitionRef.current = null;

        if (event?.error === 'network') {
          // Jangan salahkan koneksi pengguna: layanan suara Google tidak
          // terjangkau dari browser ini. Alihkan ke perekaman audio.
          setVoiceError(null);
          setSttUnavailable(true);
          setVoiceNotice(
            'Transkripsi otomatis tidak tersedia di browser ini, jadi suara akan direkam. ' +
              'Putar ulang untuk memeriksa, lalu kirim — atau buka di Chrome/Edge untuk transkripsi otomatis.'
          );
          startRecording();
          return;
        }

        const message = describeVoiceError(event?.error ?? 'unknown');
        if (message) setVoiceError(message);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceError(
        describeVoiceError(err?.name === 'InvalidStateError' ? 'aborted' : 'unknown') ??
          'Input suara tidak bisa dimulai. Coba lagi.'
      );
    }
  };

  /** Format detik -> mm:ss */
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const isRecording = recState === 'recording';
  const hasRecording = recState === 'recorded' && !!audioUrl;

  return (
    <div className="w-full bg-gradient-to-t from-[#F9F9F7] via-[#F9F9F7]/95 to-transparent pt-1.5 pb-2 sm:pt-2 sm:pb-2.5 px-3 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-1.5">
        {/* Quick prompt recommendations — hanya saat percakapan masih kosong
            (lihat catatan `showSuggestions` di atas). */}
        {showSuggestions && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar text-xs">
            <span className="flex items-center gap-1 text-[11px] font-bold text-[#7c5800] bg-[#fdc65c]/25 px-2 py-0.5 rounded-full flex-shrink-0">
              <Sparkles className="w-3 h-3 text-[#7c5800]" />
              Inspirasi:
            </span>
            {isLoading ? (
              <>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-6 bg-[#e2e3e1] rounded-full animate-pulse flex-shrink-0" style={{ width: `${55 + i * 18}px` }} />
                ))}
              </>
            ) : (
              quickPrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSendMessage(prompt)}
                  className="px-2.5 py-0.5 bg-white hover:bg-[#163422]/5 border border-[#c2c8c0]/70 hover:border-[#163422] text-[#424843] hover:text-[#163422] rounded-full whitespace-nowrap transition-all text-[11px] sm:text-xs font-medium shadow-xs active:scale-95"
                >
                  {prompt}
                </button>
              ))
            )}
          </div>
        )}

        {/* ── Panel perekaman: rekam → putar ulang → kirim ── */}
        {(isRecording || hasRecording) && (
          <div className="bg-white rounded-2xl border border-[#c2c8c0]/60 shadow-xs px-3 py-2.5">
            {isRecording ? (
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse flex-shrink-0" />
                <span className="text-xs font-bold text-rose-600 flex-shrink-0">Merekam</span>
                <span className="text-xs font-mono font-bold text-[#163422] tabular-nums">{fmt(seconds)}</span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] active:scale-95 transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Selesai
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <audio
                  ref={audioElRef}
                  src={audioUrl || undefined}
                  onEnded={() => setIsPlaying(false)}
                  onPause={() => setIsPlaying(false)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={togglePlayback}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f4f2] border border-[#c2c8c0] text-[#163422] text-xs font-bold hover:bg-white active:scale-95 transition-all cursor-pointer"
                  aria-label={isPlaying ? 'Jeda rekaman' : 'Putar ulang rekaman'}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Jeda' : 'Putar ulang'}
                </button>
                <button
                  type="button"
                  onClick={discardRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#c2c8c0] text-[#727972] text-xs font-bold hover:text-rose-600 hover:border-rose-300 active:scale-95 transition-all cursor-pointer"
                  aria-label="Hapus rekaman dan rekam ulang"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Rekam ulang
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    // Belum ada transkripsi otomatis di sini: rekaman disimpan
                    // sebagai pratinjau, pengguna menyalin ucapannya ke kolom
                    // teks lalu mengirim seperti biasa.
                    setVoiceNotice(
                      'Rekaman siap. Karena browser ini tidak menyediakan transkripsi otomatis, ' +
                        'silakan tulis ulang pertanyaan Anda di kolom teks lalu kirim — ' +
                        'atau buka di Chrome/Edge agar ucapan langsung berubah menjadi teks.'
                    );
                    discardRecording();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#163422] text-white text-xs font-bold hover:bg-[#2d4b37] active:scale-95 transition-all cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  Selesai
                </button>
              </div>
            )}
          </div>
        )}

        {/* Conversational Input Area container */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-full shadow-xs border border-[#c2c8c0]/60 p-1 sm:p-1.5 pl-2 sm:pl-3 flex items-center gap-1.5 sm:gap-2 focus-within:border-[#163422]/50 focus-within:ring-2 focus-within:ring-[#163422]/10 transition-all"
        >
          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Tanya resep atau ketik bahan..."
            disabled={isLoading}
            className="flex-grow bg-transparent border-none focus:ring-0 text-sm sm:text-base text-[#1a1c1b] placeholder-[#727972] py-1.5 sm:py-2 px-1 sm:px-2 outline-none min-w-0"
          />

          {/* Voice Input Mic */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer ${
              isListening || isRecording
                ? 'bg-rose-500 text-white animate-pulse'
                : hasRecording
                ? 'bg-[#fdc65c] text-[#745200]'
                : 'text-[#424843] hover:bg-[#f4f4f2] hover:text-[#163422]'
            }`}
            title={
              isRecording
                ? 'Ketuk untuk berhenti merekam'
                : isListening
                ? 'Mendengarkan suara...'
                : hasRecording
                ? 'Rekaman siap diputar ulang'
                : 'Input suara'
            }
          >
            {isListening || isRecording ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">mic</span>
            )}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#163422] flex items-center justify-center text-white hover:bg-[#304b2e] transition-colors shadow-xs flex-shrink-0 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Kirim"
          >
            <span className="material-symbols-outlined text-[18px] sm:text-[20px]">send</span>
          </button>
        </form>

        {/* Info netral (transkripsi tidak tersedia / rekaman siap) */}
        {voiceNotice && !voiceError && (
          <div
            role="status"
            className="flex items-start gap-2 px-3 py-2 rounded-xl bg-[#fdc65c]/15 border border-[#fdc65c]/50 text-[#745200] text-[11px] sm:text-xs leading-relaxed"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{voiceNotice}</span>
            <button
              type="button"
              onClick={() => setVoiceNotice(null)}
              className="flex-shrink-0 font-bold text-[#7c5800] hover:text-[#5c4200] cursor-pointer px-0.5"
              aria-label="Tutup pesan info input suara"
            >
              ×
            </button>
          </div>
        )}

        {/* Pesan kegagalan input suara. */}
        {voiceError && (
          <div
            role="alert"
            className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] sm:text-xs leading-relaxed"
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{voiceError}</span>
            <button
              type="button"
              onClick={() => setVoiceError(null)}
              className="flex-shrink-0 font-bold text-rose-500 hover:text-rose-700 cursor-pointer px-0.5"
              aria-label="Tutup pesan kesalahan input suara"
            >
              ×
            </button>
          </div>
        )}

        {/* Disclaimer Text */}
        <div className="text-center pt-0.5">
          <span className="text-[10px] sm:text-[11px] text-[#424843]/60 font-medium leading-none inline-block">
            SorghumCare AI dapat membuat kesalahan. Harap periksa info penting.
          </span>
        </div>
      </div>
    </div>
  );
};
