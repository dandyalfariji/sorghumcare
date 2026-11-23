import React, { useState } from 'react';
import { Mic, MicOff, Send, Sparkles } from 'lucide-react';

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

  const handleVoiceToggle = () => {
    // Check SpeechRecognition support in browser
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // If not supported in browser environment, simulate voice input nicely
      setIsListening(true);
      setTimeout(() => {
        setInputText('Berikan saya resep camilan sorgum renyah untuk santai sore');
        setIsListening(false);
      }, 1800);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'id-ID';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch {
      setIsListening(false);
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
