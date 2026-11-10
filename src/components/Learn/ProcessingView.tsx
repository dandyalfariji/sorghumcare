import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Clock, Lightbulb, TriangleAlert } from 'lucide-react';
import { SORGHUM_FORMS } from '../../data/learnData';

interface ProcessingViewProps {
  formId?: string;
  onSelectForm: (formId: string) => void;
  onNext: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ formId, onSelectForm, onNext }) => {
  const form = SORGHUM_FORMS.find((f) => f.id === formId) || SORGHUM_FORMS[0];
  const panelRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  /**
   * Gulirkan pandangan ke panel detail setiap kali bentuk olahan berganti.
   *
   * Kenapa perlu: saat halaman dibuka tanpa id (`/belajar/pengolahan`) panelnya
   * sudah menampilkan "Beras Sorgum", jadi menekan chip "Beras Sorgum" tidak
   * mengubah apa pun di layar dan terasa seperti tombol mati. Dengan menggeser
   * fokus ke panel, setiap pilihan memberi umpan balik yang terlihat.
   */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [form.id]);

  const handleSelect = (id: string) => {
    onSelectForm(id);
    // Sudah di bentuk yang sama -> URL tidak berubah -> tetap beri umpan balik.
    if (id === form.id) {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-[#163422] tracking-tight">Pengolahan Sorgum</h2>
        <p className="text-sm text-[#424843] mt-1">Pilih bentuk olahan yang ingin kamu buat dari biji sorgum.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        {SORGHUM_FORMS.map((f) => {
          const active = f.id === form.id;
          return (
            <button
              key={f.id}
              onClick={() => handleSelect(f.id)}
              aria-pressed={active}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#2d4b37] border-[#2d4b37] text-white'
                  : 'bg-white border-[#c2c8c0]/60 text-[#424843] hover:bg-[#e2e3e1]'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{f.icon}</span>
              {f.name}
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-12 gap-5 items-start">
        <section ref={panelRef} className="md:col-span-8 bg-white rounded-2xl border border-[#c2c8c0]/60 p-5 shadow-earthy-glow scroll-mt-32">
          <h3 className="text-lg font-bold text-[#163422]">{form.name}</h3>
          <p className="text-sm text-[#424843] mt-0.5">{form.tagline}</p>

          {form.warning && (
            <div role="alert" className="mt-4 flex gap-2.5 bg-[#ffdad6]/60 border border-[#ba1a1a]/25 rounded-xl p-3 text-[#7d1a13]">
              <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed font-semibold">{form.warning}</p>
            </div>
          )}

          <ol className="mt-5">
            {form.steps.map((step, idx) => {
              const isLast = idx === form.steps.length - 1;
              return (
                <motion.li
                  key={`${form.id}-${step.title}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="flex gap-3.5"
                >
                  <div className="flex flex-col items-center">
                    <span className="w-8 h-8 rounded-full bg-[#2d4b37] text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    {!isLast && <span data-keep className="w-px flex-1 bg-[#c2c8c0] my-1" />}
                  </div>
                  <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-5'}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-h-8">
                      <h4 className="text-sm font-bold text-[#1a1c1b]">{step.title}</h4>
                      {step.duration && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7c5800] bg-[#fdc65c]/30 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          {step.duration}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#424843] leading-relaxed mt-0.5">{step.instruction}</p>
                    {step.tip && (
                      <p className="mt-2 flex gap-1.5 text-xs text-[#2d4b37] bg-[#eef3ec] rounded-lg px-2.5 py-2 leading-relaxed">
                        <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {step.tip}
                      </p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </section>

        <aside className="md:col-span-4 space-y-3 md:sticky md:top-32">
          <dl className="bg-white rounded-2xl border border-[#c2c8c0]/60 p-4 shadow-earthy-glow space-y-3 text-sm">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-[#727972]">Tingkat</dt>
              <dd className="font-bold text-[#163422] mt-0.5">{form.level}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-[#727972]">Perkiraan waktu</dt>
              <dd className="font-bold text-[#163422] mt-0.5">{form.totalTime}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-[#727972]">Cocok untuk</dt>
              <dd className="flex flex-wrap gap-1.5 mt-1.5">
                {form.usedFor.map((use) => (
                  <span key={use} className="text-[11px] font-semibold text-[#2d4b37] bg-[#eef3ec] px-2 py-0.5 rounded-full">
                    {use}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wide text-[#727972]">Penyimpanan</dt>
              <dd className="text-xs text-[#424843] leading-relaxed mt-1">{form.storage}</dd>
            </div>
          </dl>

          <button
            onClick={onNext}
            className="w-full py-3 px-4 bg-[#2d4b37] hover:bg-[#163422] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            Lanjut ke Persiapan
            <ArrowRight className="w-4 h-4" />
          </button>
        </aside>
      </div>
    </div>
  );
};
