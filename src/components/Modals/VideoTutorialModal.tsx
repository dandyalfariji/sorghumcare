import React, { useState, useEffect } from 'react';
import { VideoTutorialItem, FALLBACK_FOOD_IMAGE } from '../../data/homeData';
import { X, Play, Pause, RotateCcw, Volume2, CheckCircle2, BookOpen } from 'lucide-react';

interface VideoTutorialModalProps {
  tutorial: VideoTutorialItem | null;
  onClose: () => void;
}

export const VideoTutorialModal: React.FC<VideoTutorialModalProps> = ({
  tutorial,
  onClose,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progressSec, setProgressSec] = useState(0);

  if (!tutorial) return null;

  const totalSec = tutorial.videoDurationSec;

  useEffect(() => {
    let timer: any = null;
    if (isPlaying && progressSec < totalSec) {
      timer = setInterval(() => {
        setProgressSec((prev) => {
          if (prev >= totalSec) {
            setIsPlaying(false);
            return totalSec;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, progressSec, totalSec]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSpeak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1C1B]/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header & Video Player simulation */}
        <div className="relative h-56 bg-black flex items-center justify-center overflow-hidden">
          <img
            data-food
            src={tutorial.imageUrl}
            alt={tutorial.title}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = FALLBACK_FOOD_IMAGE;
            }}
            className="w-full h-full object-cover opacity-60"
          />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center z-10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Central Play/Pause button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="absolute z-10 w-16 h-16 rounded-full bg-[#163422]/90 hover:bg-[#163422] text-white flex items-center justify-center shadow-xl transform active:scale-95 transition-all border-2 border-white/40"
          >
            {isPlaying ? (
              <Pause className="w-8 h-8 fill-current text-[#fdc65c]" />
            ) : (
              <Play className="w-8 h-8 fill-current text-[#fdc65c] ml-1" />
            )}
          </button>

          {/* Video Timeline bar */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 flex flex-col gap-1 text-white text-xs">
            <div className="flex justify-between items-center text-[11px] font-mono font-bold">
              <span>{formatTime(progressSec)}</span>
              <span>{tutorial.duration}</span>
            </div>
            <div
              className="w-full bg-white/30 h-1.5 rounded-full cursor-pointer overflow-hidden"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = clickX / rect.width;
                setProgressSec(Math.floor(pct * totalSec));
              }}
            >
              <div
                className="bg-[#fdc65c] h-full transition-all"
                style={{ width: `${(progressSec / totalSec) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7c5800] bg-[#fdc65c]/25 px-2.5 py-0.5 rounded-full">
                Video Tutorial & Tips
              </span>
              <button
                onClick={() => handleSpeak(`${tutorial.title}. ${tutorial.description}`)}
                className="flex items-center gap-1 text-xs text-[#163422] font-semibold hover:underline"
              >
                <Volume2 className="w-4 h-4" />
                Dengarkan Suara
              </button>
            </div>
            <h2 className="text-xl font-bold text-[#163422] mt-1">
              {tutorial.title}
            </h2>
            <p className="text-xs sm:text-sm text-[#424843] mt-2 leading-relaxed">
              {tutorial.description}
            </p>
          </div>

          {/* Key Cooking Steps */}
          <div className="p-4 bg-[#f9f9f7] rounded-2xl border border-[#e2e3e1] space-y-2">
            <h3 className="text-xs font-bold text-[#163422] uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#7c5800]" />
              Langkah Kunci Memasak:
            </h3>
            <ul className="space-y-2">
              {tutorial.keySteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-[#1A1C1B]">
                  <CheckCircle2 className="w-4 h-4 text-[#163422] flex-shrink-0 mt-0.5" />
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-[#f4f4f2] border-t border-[#e2e3e1] flex justify-between items-center">
          <button
            onClick={() => {
              setProgressSec(0);
              setIsPlaying(true);
            }}
            className="flex items-center gap-1 text-xs font-bold text-[#424843] hover:text-[#163422]"
          >
            <RotateCcw className="w-4 h-4" />
            Putar Ulang
          </button>

          <button
            onClick={onClose}
            className="py-2.5 px-5 bg-[#163422] text-white font-bold text-xs rounded-xl hover:bg-[#2d4b37] transition-all"
          >
            Tutup Tutorial
          </button>
        </div>
      </div>
    </div>
  );
};
