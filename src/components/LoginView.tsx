import React, { useState } from 'react';
import { Logo } from './Logo';
import { AppState, UserSession } from '../types/barberia';
import { KeyRound, User, Eye, EyeOff } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface Props {
  appState: AppState;
  onLogin: (session: UserSession) => void;
}

export const LoginView: React.FC<Props> = ({ appState, onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const u = username.trim();
    const p = password.trim();

    if (!u || !p) {
      setErrorMessage('Por favor ingresa usuario y contraseña');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      // 1. Check Admin credentials
      if (
        u.toLowerCase() === appState.config.adminUsername.toLowerCase() &&
        p === appState.config.adminPassword
      ) {
        setIsLoading(false);
        onLogin({
          role: 'admin',
          username: appState.config.adminUsername,
          name: 'Administrador (Dueño)',
        });
        return;
      }

      // 2. Check Barber stations credentials
      const matchedStation = appState.stations.find(
        (s) => s.username.toLowerCase() === u.toLowerCase() && s.password === p
      );

      if (matchedStation) {
        setIsLoading(false);
        onLogin({
          role: 'barber',
          stationId: matchedStation.id,
          username: matchedStation.username,
          name: matchedStation.barberName,
        });
        return;
      }

      setIsLoading(false);
      setErrorMessage('Credenciales incorrectas. Verifica tu usuario y contraseña.');
    }, 250);
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden">
      {/* Background Decorative Gold Light Glow */}
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar with PWA install button */}
      <div className="w-full max-w-md mx-auto flex items-center justify-end z-10">
        <PWAInstallButton compact />
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md mx-auto my-auto z-10">
        <div className="rounded-3xl bg-[#18181B] border border-[#27272A] p-6 sm:p-8 shadow-2xl relative gold-card-glow">
          {/* Logo with Imperial Crown, Crossed Shears & Mustache */}
          <Logo size="lg" showText={true} className="mb-6" />

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                Usuario
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. admin o barbero1"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#09090B] border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold tracking-wider text-zinc-300 uppercase">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-[#09090B] border border-zinc-700/80 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-700/50 text-red-200 text-xs text-center font-medium">
                {errorMessage}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl gold-button-gradient font-bold text-sm tracking-wider uppercase transition shadow-lg mt-2 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <span>Ingresar al Sistema</span>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="w-full max-w-md mx-auto text-center text-[11px] text-zinc-400 py-2 z-10">
        <span>Barbería Barón • Sistema de Gestión de Alquiler</span>
      </div>
    </div>
  );
};
