import React, { useRef, useState } from 'react';
import { Mic, MicOff, Send, Sparkles, AlertCircle } from 'lucide-react';

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
  /** Instance SpeechRecognition aktif, supaya tombol bisa benar-benar menghentikannya. */
  const recognitionRef = useRef<any>(null);

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

  /**
   * Terjemahkan kode error SpeechRecognition menjadi kalimat yang bisa
   * ditindaklanjuti pengguna.
   *
   * Sebelumnya `onerror` hanya melakukan setIsListening(false) tanpa pesan
   * apa pun, sehingga tombol mic tampak "tidak berfungsi" tanpa penjelasan.
   * Padahal penyebabnya bisa sangat berbeda dan hanya sebagian bisa diperbaiki
   * dari sisi aplikasi:
   *   - not-allowed / service-not-allowed: izin mikrofon ditolak, ATAU browser
   *     memang tidak menyediakan layanan pengenalan suara (Brave memblokir
   *     Web Speech API karena butuh kunci Google Speech berbayar).
   *   - audio-capture: tidak ada mikrofon terpasang / dipakai proses lain.
   *   - network: layanan pengenalan suara tidak terjangkau.
   *   - no-speech: tidak ada suara terdeteksi.
   *   - aborted: pengguna menghentikan sendiri (bukan error, jangan dilaporkan).
   */
  const describeVoiceError = (code: string): string | null => {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Mikrofon tidak bisa diakses. Izinkan akses mikrofon untuk situs ini di pengaturan browser Anda. Catatan: browser Brave tidak mendukung fitur pengenalan suara ini — gunakan Chrome, Edge, atau Safari.';
      case 'audio-capture':
        return 'Mikrofon tidak terdeteksi. Pastikan mikrofon terpasang dan tidak sedang dipakai aplikasi lain.';
      case 'network':
        return 'Layanan pengenalan suara tidak terjangkau. Periksa koneksi internet Anda, lalu coba lagi.';
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

  const handleVoiceToggle = () => {
    setVoiceError(null);

    // Sudah mendengarkan -> hentikan.
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Tidak ada API sama sekali. DULU di sini ada "simulasi" yang mengisi
      // kolom dengan teks contoh palsu setelah 1,8 detik — pengguna mengira
      // suaranya dikenali padahal tidak ada mikrofon yang dibuka. Itu
      // menyesatkan, jadi sekarang kita beri tahu apa adanya.
      setVoiceError(
        'Browser Anda tidak mendukung input suara. Gunakan Chrome, Edge, atau Safari — atau ketik pertanyaan langsung.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      // Satu ucapan saja per klik; tanpa ini sebagian browser terus
      // mendengarkan dan tombol tampak "macet" di status listening.
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
        const message = describeVoiceError(event?.error ?? 'unknown');
        setIsListening(false);
        recognitionRef.current = null;
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
              isListening
                ? 'bg-rose-500 text-white animate-pulse'
                : 'text-[#424843] hover:bg-[#f4f4f2] hover:text-[#163422]'
            }`}
            title={isListening ? 'Mendengarkan suara...' : 'Input Suara'}
          >
            {isListening ? (
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

        {/* Pesan kegagalan input suara. Dulu error SpeechRecognition ditelan
            tanpa jejak, jadi pengguna hanya melihat tombol mic "tidak bereaksi".
            Sekarang penyebabnya dijelaskan, dan pesan bisa ditutup. */}
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
