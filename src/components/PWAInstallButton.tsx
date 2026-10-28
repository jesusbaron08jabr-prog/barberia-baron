import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, X, Smartphone } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  // If already installed as a standalone PWA, suppress
  if (isInstalled) {
    return null;
  }

  // Chromium / Android flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-2 rounded-xl gold-badge-gradient text-[#D4AF37] hover:bg-[#D4AF37]/20 border border-[#D4AF37]/40 px-3 py-1.5 text-xs font-semibold tracking-wide transition shadow-sm ${
          compact ? '' : 'sm:px-4 sm:py-2'
        }`}
        title="Instalar App Barbería Barón en tu Android"
      >
        <Download className="w-4 h-4 text-[#D4AF37] animate-bounce" />
        <span>Instalar App PWA</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSModal(true)}
          className="flex items-center gap-2 rounded-xl gold-badge-gradient text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-semibold tracking-wide transition hover:bg-[#D4AF37]/20"
        >
          <Smartphone className="w-4 h-4 text-[#D4AF37]" />
          <span>Instalar en iPhone</span>
        </button>

        {showIOSModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#18181B] border border-[#D4AF37]/40 p-6 shadow-2xl relative">
              <button
                onClick={() => setShowIOSModal(false)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#27272A] border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-cinzel font-bold text-white text-base">Instalar en tu iPhone</h3>
                  <p className="text-xs text-zinc-400">Acceso directo como App Nativa</p>
                </div>
              </div>

              <ol className="space-y-3 text-xs text-zinc-300">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center font-bold">1</span>
                  <span>Toca el botón <strong className="text-white">Compartir</strong> (<Share2 className="inline w-3.5 h-3.5 text-blue-400" />) en la barra inferior de Safari.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center font-bold">2</span>
                  <span>Baja y selecciona <strong className="text-white">"Agregar a pantalla de inicio"</strong> (<PlusSquare className="inline w-3.5 h-3.5 text-[#D4AF37]" />).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center font-bold">3</span>
                  <span>Toca <strong className="text-[#D4AF37]">"Agregar"</strong> arriba a la derecha. ¡Listo!</span>
                </li>
              </ol>

              <button
                onClick={() => setShowIOSModal(false)}
                className="mt-5 w-full py-2.5 rounded-xl bg-[#27272A] hover:bg-[#323238] text-white text-xs font-semibold tracking-wider transition"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for desktop/other browsers: show install instructions or subtle badge
  return (
    <button
      onClick={() => alert('Para instalar en tu celular Android, abre el menú de opciones de Chrome (los 3 puntos ⋮) y presiona "Instalar aplicación" o "Agregar a la pantalla principal".')}
      className="hidden sm:flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-[#18181B] px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
      title="Instrucciones para instalar en Android"
    >
      <Smartphone className="w-3.5 h-3.5 text-[#D4AF37]" />
      <span>App Móvil PWA</span>
    </button>
  );
};
