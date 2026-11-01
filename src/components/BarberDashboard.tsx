import React, { useState, useRef, useEffect } from 'react';
import { AppState, BarberStation, PaymentRecord, PaymentMethod, GeminiVerificationResult } from '../types/barberia';
import { formatCOP, parseCOPInput, formatNumberWithDots } from '../services/storage';
import { Logo } from './Logo';
import { PWAInstallButton } from './PWAInstallButton';
import { VoucherDetailModal } from './VoucherDetailModal';
import {
  ArrowLeft,
  LogOut,
  Camera,
  Upload,
  CheckCircle2,
  Clock,
  Sparkles,
  CreditCard,
  AlertCircle,
  FileText,
  DollarSign,
  Send,
  Eye,
  RefreshCw
} from 'lucide-react';

interface Props {
  station: BarberStation;
  appState: AppState;
  onUpdateState: (newState: AppState, latestVoucher?: any) => void;
  onLogout: () => void;
}

export const BarberDashboard: React.FC<Props> = ({
  station,
  appState,
  onUpdateState,
  onLogout,
}) => {
  // Form State
  const [paymentType, setPaymentType] = useState<'total' | 'abono'>('total');
  const [amountInput, setAmountInput] = useState<string>(
    station.currentBalance > 0 ? formatNumberWithDots(station.currentBalance) : ''
  );
  const [method, setMethod] = useState<PaymentMethod>('Nequi');
  const [notes, setNotes] = useState('');
  
  // Voucher Image & AI State
  const [voucherBase64, setVoucherBase64] = useState<string>('');
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [aiResult, setAiResult] = useState<GeminiVerificationResult | null>(null);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal inspection
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Filter only this barber's personal history
  const personalPayments = appState.payments.filter((p) => p.stationId === station.id);

  // Handle mobile / Android hardware Back button so user returns to previous screen instead of exiting app
  useEffect(() => {
    const handlePopState = () => {
      if (selectedPayment) {
        setSelectedPayment(null);
      } else {
        onLogout();
      }
    };

    window.history.pushState({ screen: 'barber', stationId: station.id }, '');
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedPayment, onLogout, station.id]);

  // Handle payment type change
  const handleTypeChange = (type: 'total' | 'abono') => {
    setPaymentType(type);
    if (type === 'total') {
      setAmountInput(station.currentBalance > 0 ? formatNumberWithDots(station.currentBalance) : '');
    } else {
      setAmountInput('');
    }
  };

  // Compress image helper using HTML5 Canvas
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Export compressed JPEG
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Image upload handler
  const handleImageSelected = async (file: File) => {
    try {
      setFormError('');
      const compressed = await compressImage(file);
      setVoucherBase64(compressed);
    } catch (e) {
      console.warn('Error al procesar la imagen:', e);
      setFormError('No se pudo procesar la imagen seleccionada');
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMessage('');

    if (!appState.config.appAuthorized) {
      setFormError('El Administrador aún no ha iniciado el cobro oficial de la app. Tu saldo actual es $0 COP y estás al día.');
      return;
    }

    const parsedAmount = parseCOPInput(amountInput);
    if (!parsedAmount || parsedAmount <= 0) {
      setFormError('Por favor ingresa un monto válido en pesos colombianos (COP).');
      return;
    }

    if (!voucherBase64) {
      setFormError('Es obligatorio adjuntar la foto del comprobante o bauche.');
      return;
    }

    setIsSubmitting(true);

    try {
      const prevBal = station.currentBalance;
      const newBal = Math.max(0, prevBal - parsedAmount);

      const newRecord: PaymentRecord = {
        id: 'pay-' + Date.now(),
        stationId: station.id,
        stationNumber: station.stationNumber,
        barberName: station.barberName,
        type: paymentType,
        amount: parsedAmount,
        previousBalance: prevBal,
        remainingBalance: newBal,
        method,
        voucherBase64,
        timestamp: new Date().toISOString(),
        formattedDate: new Date().toLocaleDateString('es-CO', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: 'pendiente',
        notes: notes.trim(),
      };

      // Update state: adjust barber balance, append payment, update totalCollected
      const updatedStations = appState.stations.map((s) => {
        if (s.id === station.id) {
          return { ...s, currentBalance: newBal };
        }
        return s;
      });

      const updatedAppState: AppState = {
        ...appState,
        stations: updatedStations,
        payments: [newRecord, ...appState.payments],
        totalCollected: appState.totalCollected + parsedAmount,
      };

      onUpdateState(updatedAppState, {
        barberName: station.barberName,
        stationNumber: station.stationNumber,
        type: paymentType === 'total' ? 'Pago Total' : 'Abono Parcial',
        amount: parsedAmount,
        method,
        notes: notes.trim(),
        status: 'Pendiente de Aprobación',
        timestamp: newRecord.timestamp,
        voucherBase64,
      });

      // Reset form
      setSuccessMessage(
        `¡Comprobante enviado exitosamente! Tu reporte de ${formatCOP(parsedAmount)} quedó registrado. El administrador verificará el ingreso en su cuenta bancaria.`
      );
      setVoucherBase64('');
      setNotes('');
      if (paymentType === 'total') {
        setAmountInput(newBal > 0 ? formatNumberWithDots(newBal) : '');
      } else {
        setAmountInput('');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Error al procesar el pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col pb-16">
      {/* Top Header with Prominent Back Button */}
      <header className="sticky top-0 z-30 bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back button to return to login / switch screen */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] border border-[#D4AF37]/35 text-zinc-200 hover:text-white transition text-xs font-bold shadow-sm"
              title="Volver a la pantalla de Login"
            >
              <ArrowLeft className="w-4 h-4 text-[#D4AF37]" />
              <span>Volver</span>
            </button>

            <Logo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                  Puesto #{station.stationNumber}
                </span>
                <span className="text-xs text-zinc-400 font-medium">Barbería Barón</span>
              </div>
              <h2 className="text-sm font-bold text-white tracking-wide truncate max-w-[150px] sm:max-w-none">
                {station.barberName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              onClick={onLogout}
              className="p-2 rounded-xl bg-[#18181B] hover:bg-[#27272A] border border-zinc-800 text-zinc-400 hover:text-white transition"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto w-full px-4 pt-5 space-y-6 flex-1">
        {/* Banner de Estado de Autorización */}
        {!appState.config.appAuthorized ? (
          <div className="rounded-3xl bg-gradient-to-r from-amber-950/80 via-[#1E1B13] to-[#18181B] border-2 border-amber-600/60 p-5 shadow-2xl space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-900/40 border border-amber-500/50 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                <Clock className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  En Espera de Autorización
                </span>
                <h3 className="font-cinzel text-base font-bold text-white mt-1">
                  El Administrador aún no ha iniciado el cobro
                </h3>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  Tu saldo de alquiler actual es de <strong className="text-emerald-400">$0 COP</strong> y estás al día. El conteo diario y el formulario de pagos comenzarán a correr en cuanto el Administrador autorice el inicio oficial de la app.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-950/40 border border-emerald-600/40 px-4 py-2.5 flex items-center gap-2.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-semibold">Sistema Activo y Autorizado</span>
            <span className="text-zinc-500">•</span>
            <span className="text-zinc-400">Desde: {appState.config.authorizedAt || 'Hoy'}</span>
          </div>
        )}

        {/* Hero Card: Saldo Pendiente Actual */}
        <div className="rounded-3xl bg-gradient-to-br from-[#1E1E24] via-[#18181B] to-[#0E0E10] border border-[#D4AF37]/40 p-6 shadow-2xl relative overflow-hidden gold-card-glow">
          <div className="absolute top-0 right-0 w-44 h-44 bg-[#D4AF37]/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-widest text-zinc-400 font-semibold block mb-1">
                Tu Saldo Pendiente de Alquiler
              </span>
              <div className="flex items-baseline gap-2">
                <h1 className="font-cinzel text-3xl sm:text-4xl font-black gold-text-gradient tracking-tight">
                  {formatCOP(station.currentBalance)}
                </h1>
                <span className="text-xs font-bold text-zinc-400">COP</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Tarifa diaria de alquiler: <strong className="text-zinc-200">{formatCOP(station.dailyRate)}</strong>
              </p>
            </div>

            <div className="flex-shrink-0">
              {station.currentBalance === 0 ? (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-600/50 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>¡Estás al día!</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-950/80 border border-amber-600/50 text-amber-300 text-xs font-bold">
                  <Clock className="w-4 h-4" />
                  <span>Pendiente de pago</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Form Card: Reportar Pago o Abono */}
        <div className="rounded-3xl bg-[#18181B] border border-zinc-800 p-6 shadow-xl">
          <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-zinc-800">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-cinzel text-base font-bold text-white">Reportar Pago o Abono</h2>
              <p className="text-xs text-zinc-400">Adjunta tu bauche y registra tu pago en segundos</p>
            </div>
          </div>

          <form onSubmit={handleSubmitPayment} className="space-y-5">
            {/* Type Selector: Total vs Abono */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Tipo de Transacción
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleTypeChange('total')}
                  className={`py-3 px-3 rounded-2xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentType === 'total'
                      ? 'gold-badge-gradient border-[#D4AF37] text-[#D4AF37]'
                      : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span>Pago Total</span>
                  <span className="text-[11px] font-normal text-zinc-300">
                    {formatCOP(station.currentBalance)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTypeChange('abono')}
                  className={`py-3 px-3 rounded-2xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                    paymentType === 'abono'
                      ? 'gold-badge-gradient border-[#D4AF37] text-[#D4AF37]'
                      : 'bg-[#09090B] border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span>Abono Parcial</span>
                  <span className="text-[11px] font-normal text-zinc-300">Monto libre</span>
                </button>
              </div>
            </div>

            {/* Monto en COP */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Valor del Pago (COP)
                </label>
                {amountInput && parseCOPInput(amountInput) > 0 && (
                  <span className="text-[11px] font-bold text-[#D4AF37]">
                    {formatCOP(parseCOPInput(amountInput))}
                  </span>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400 font-bold text-sm">
                  $
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9.]*"
                  value={amountInput}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw.trim()) {
                      setAmountInput('');
                      return;
                    }
                    const num = parseCOPInput(raw);
                    setAmountInput(num > 0 ? formatNumberWithDots(num) : '');
                  }}
                  placeholder="ej. 40.000"
                  className="w-full pl-8 pr-16 py-3 rounded-xl bg-[#09090B] border border-zinc-700 text-white font-mono text-lg font-bold focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition"
                />
                <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs font-bold text-zinc-400 pointer-events-none">
                  COP
                </span>
              </div>

              {/* Botones de Montos Rápidos / Enteros */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-zinc-500 mr-0.5">Rápidos:</span>
                {[10000, 20000, 40000, 45000, 50000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setPaymentType('abono');
                      setAmountInput(formatNumberWithDots(amt));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#27272A] hover:bg-[#323238] border border-zinc-700 text-[11px] font-bold text-zinc-200 transition"
                  >
                    ${formatNumberWithDots(amt)}
                  </button>
                ))}
                {station.currentBalance > 0 && (
                  <button
                    key="total"
                    type="button"
                    onClick={() => {
                      setPaymentType('total');
                      setAmountInput(formatNumberWithDots(station.currentBalance));
                    }}
                    className="px-2.5 py-1 rounded-lg gold-badge-gradient text-[11px] font-bold text-[#D4AF37] border border-[#D4AF37]/40 transition"
                  >
                    Total (${formatNumberWithDots(station.currentBalance)})
                  </button>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Método de Pago
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['Nequi', 'Daviplata', 'Bancolombia', 'Efectivo'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition text-center ${
                      method === m
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]'
                        : 'border-zinc-800 bg-[#09090B] text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Mandatory Voucher Photo Upload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Foto del Bauche o Comprobante <span className="text-[#D4AF37]">*Obligatorio</span>
                </label>
                {voucherBase64 && (
                  <span className="text-[11px] text-emerald-400 font-medium">✓ Imagen cargada</span>
                )}
              </div>

              {/* Hidden file inputs for Camera & Gallery */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleImageSelected(e.target.files[0]);
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleImageSelected(e.target.files[0]);
                }}
              />

              {!voucherBase64 ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="p-4 rounded-2xl bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37]/60 flex flex-col items-center justify-center gap-2 text-zinc-300 hover:text-white transition group"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#18181B] group-hover:bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] transition">
                      <Camera className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Tomar Foto con Cámara</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-2xl bg-[#09090B] border border-zinc-800 hover:border-[#D4AF37]/60 flex flex-col items-center justify-center gap-2 text-zinc-300 hover:text-white transition group"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#18181B] group-hover:bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] transition">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold">Subir de Galería</span>
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#D4AF37]/40 bg-[#09090B] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-medium">Vista previa del bauche</span>
                    <button
                      type="button"
                      onClick={() => {
                        setVoucherBase64('');
                        setAiResult(null);
                      }}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Cambiar foto
                    </button>
                  </div>

                  <div className="relative rounded-xl overflow-hidden bg-black max-h-56 flex items-center justify-center border border-zinc-800">
                    <img
                      src={voucherBase64}
                      alt="Bauche preview"
                      className="w-full h-full object-contain max-h-56"
                    />

                    {isAnalyzingAI && (
                      <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white">
                        <Sparkles className="w-6 h-6 text-[#D4AF37] animate-spin" />
                        <span className="text-xs font-semibold text-[#D4AF37]">
                          Gemini IA analizando comprobante...
                        </span>
                      </div>
                    )}
                  </div>

                  {/* AI Verification Live Card */}
                  {aiResult && (
                    <div className="p-3 rounded-xl bg-[#18181B] border border-[#D4AF37]/30 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between text-[#D4AF37] font-bold">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Lectura Inteligente Gemini AI:
                        </span>
                        <span className="text-[10px] uppercase font-bold text-emerald-400">
                          {aiResult.matchStatus === 'verified' ? 'Coincide' : 'Revisar'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-zinc-300 text-[11px]">
                        <div>
                          Monto detectado:{' '}
                          <strong className="text-white">
                            {aiResult.extractedAmount ? formatCOP(aiResult.extractedAmount) : 'N/A'}
                          </strong>
                        </div>
                        <div>
                          Plataforma:{' '}
                          <strong className="text-white">{aiResult.paymentPlatform}</strong>
                        </div>
                      </div>
                      {aiResult.analysisNotes && (
                        <p className="text-[11px] text-zinc-400 italic">
                          "{aiResult.analysisNotes}"
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Optional Notes */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Nota o Comentario (Opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ej. Pago completo jornada martes"
                className="w-full px-4 py-2.5 rounded-xl bg-[#09090B] border border-zinc-800 text-zinc-200 placeholder-zinc-600 text-xs focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            {/* Error or Success Alerts */}
            {formError && (
              <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-700/50 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-700/50 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            {!appState.config.appAuthorized ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={true}
                  className="w-full py-4 rounded-2xl bg-zinc-800 border border-zinc-700/80 text-zinc-400 font-extrabold text-xs sm:text-sm tracking-wider uppercase cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>En Espera de Autorización del Administrador</span>
                </button>
                <p className="text-[11px] text-zinc-500 text-center">
                  Tu saldo es $0 COP. Podrás enviar pagos cuando el Administrador inicie el ciclo de alquiler.
                </p>
              </div>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-2xl gold-button-gradient font-extrabold text-sm tracking-wider uppercase transition shadow-xl flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Registrando y Sincronizando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Reportar Pago de Alquiler</span>
                  </>
                )}
              </button>
            )}
          </form>
        </div>

        {/* Section: Historial Personal del Barbero */}
        <div className="rounded-3xl bg-[#18181B] border border-zinc-800 p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[#D4AF37]">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-cinzel text-base font-bold text-white">Mi Historial Personal</h3>
                <p className="text-xs text-zinc-400">Tus pagos y abonos reportados</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-zinc-400">
              {personalPayments.length} registros
            </span>
          </div>

          {personalPayments.length === 0 ? (
            <div className="py-8 text-center text-zinc-500 text-xs">
              No tienes pagos reportados aún.
            </div>
          ) : (
            <div className="space-y-2.5">
              {personalPayments.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="p-3.5 rounded-2xl bg-[#09090B] border border-zinc-850 hover:border-[#D4AF37]/50 transition cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3">
                    {/* Uniform Gold Coin Icon */}
                    <div className="w-12 h-12 rounded-2xl bg-[#09090B] border border-[#D4AF37]/35 flex-shrink-0 flex items-center justify-center text-[#D4AF37] shadow-inner">
                      <DollarSign className="w-6 h-6 text-[#D4AF37]" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {formatCOP(p.amount)}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                          {p.method}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                        <span>{p.formattedDate}</span>
                        <span>•</span>
                        <span>{p.type === 'total' ? 'Pago Total' : 'Abono'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-2">
                    {p.status === 'aprobado' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-700/50">
                        <CheckCircle2 className="w-3 h-3" />
                        Aprobado
                      </span>
                    ) : p.status === 'rechazado' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-950/60 px-2.5 py-0.5 rounded-full border border-red-700/50">
                        ✕ Rechazado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-950/60 px-2.5 py-0.5 rounded-full border border-amber-700/50">
                        <Clock className="w-3 h-3 animate-pulse" />
                        Pendiente
                      </span>
                    )}
                    <Eye className="w-4 h-4 text-zinc-500 group-hover:text-[#D4AF37] transition" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Voucher Detail Modal */}
      <VoucherDetailModal
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
      />
    </div>
  );
};
