import React, { useEffect } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Hash,
  CreditCard,
  User,
  ArrowLeft,
  ExternalLink,
  ShieldCheck,
  Check,
  Ban
} from 'lucide-react';
import { PaymentRecord } from '../types/barberia';
import { formatCOP } from '../services/storage';

interface Props {
  payment: PaymentRecord | null;
  onClose: () => void;
  isAdmin?: boolean;
  onApprove?: (paymentId: string) => void;
  onReject?: (paymentId: string) => void;
}

export const VoucherDetailModal: React.FC<Props> = ({
  payment,
  onClose,
  isAdmin = false,
  onApprove,
  onReject,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!payment) return null;

  const isPending = !payment.status || payment.status === 'pendiente' || payment.status === 'pendiente_revision';
  const isApproved = payment.status === 'aprobado';
  const isRejected = payment.status === 'rechazado';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl bg-[#18181B] border border-[#D4AF37]/40 shadow-2xl overflow-hidden my-4 cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-[#09090B]">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 -ml-1 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-[#D4AF37] transition flex items-center gap-1 text-xs font-bold"
              title="Volver"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver</span>
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-cinzel text-sm sm:text-base font-bold text-white">
                Comprobante Puesto #{payment.stationNumber}
              </h3>
              <p className="text-xs text-zinc-400">{payment.barberName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
              isApproved
                ? 'bg-emerald-950/40 border-emerald-600/50 text-emerald-300'
                : isRejected
                ? 'bg-red-950/40 border-red-600/50 text-red-300'
                : 'bg-amber-950/30 border-amber-600/40 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isApproved
                    ? 'bg-emerald-900/60 text-emerald-400'
                    : isRejected
                    ? 'bg-red-900/60 text-red-400'
                    : 'bg-amber-900/60 text-amber-400'
                }`}
              >
                {isApproved ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : isRejected ? (
                  <XCircle className="w-5 h-5" />
                ) : (
                  <Clock className="w-5 h-5 animate-pulse" />
                )}
              </div>
              <div>
                <span className="font-bold text-sm block">
                  {isApproved
                    ? 'Aprobado por el Administrador'
                    : isRejected
                    ? 'Rechazado por el Administrador'
                    : 'Pendiente de Aprobación en Cuenta'}
                </span>
                <span className="text-[11px] opacity-80 block">
                  {isApproved
                    ? 'El administrador verificó y confirmó el ingreso en su cuenta bancaria.'
                    : isRejected
                    ? 'El dinero no se encontró en la cuenta bancaria. Saldo no acreditado.'
                    : 'Esperando que el administrador confirme que el dinero ya está en su cuenta.'}
                </span>
              </div>
            </div>
          </div>

          {/* Voucher Image */}
          <div className="rounded-2xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center min-h-[220px] max-h-[360px] relative group">
            {payment.voucherBase64 ? (
              <img
                src={payment.voucherBase64}
                alt="Comprobante de pago"
                className="w-full h-full object-contain max-h-[360px]"
              />
            ) : (
              <div className="text-center p-6 text-zinc-500 text-xs">
                <CreditCard className="w-10 h-10 mx-auto mb-2 text-zinc-600" />
                <span>Comprobante registrado en efectivo / sin imagen adjunta</span>
              </div>
            )}
          </div>

          {/* Google Drive Link if uploaded */}
          {payment.driveFileUrl && (
            <a
              href={payment.driveFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#09090B] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition text-xs font-semibold"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Ver imagen original en Google Drive</span>
            </a>
          )}

          {/* Payment Summary Box */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#09090B] border border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-zinc-400">Monto Reportado</span>
              <p className="text-xl font-black text-[#D4AF37] font-cinzel mt-0.5">
                {formatCOP(payment.amount)}
              </p>
              <span className="text-[11px] text-zinc-400">
                {payment.type === 'total' ? 'Pago Total de Alquiler' : 'Abono Parcial'}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#09090B] border border-zinc-800">
              <span className="text-[10px] uppercase font-bold text-zinc-400">Método de Pago</span>
              <p className="text-base font-bold text-white mt-0.5">{payment.method}</p>
              <span className="text-[11px] text-zinc-400">{payment.formattedDate}</span>
            </div>
          </div>

          {/* Notes and Balances */}
          <div className="p-3.5 rounded-2xl bg-[#09090B] border border-zinc-800 space-y-2 text-xs">
            {payment.notes && (
              <div className="text-zinc-300">
                <span className="text-zinc-500 font-semibold block text-[10px] uppercase">Nota del Barbero:</span>
                <p className="italic text-zinc-200 mt-0.5">"{payment.notes}"</p>
              </div>
            )}
            <div className="flex items-center justify-between text-zinc-400 pt-1 border-t border-zinc-850">
              <span>Saldo antes del pago: {formatCOP(payment.previousBalance)}</span>
              <span>Saldo restante: <strong className="text-white">{formatCOP(payment.remainingBalance)}</strong></span>
            </div>
          </div>

          {/* Admin Action Box (Only visible if Admin) */}
          {isAdmin && (
            <div className="p-4 rounded-2xl bg-[#09090B] border border-[#D4AF37]/40 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#D4AF37] uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4" />
                <span>Control de Verificación del Administrador</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Revisa primero en tu app bancaria ({payment.method}) que el dinero de{' '}
                <strong className="text-white">{formatCOP(payment.amount)}</strong> ya figure en tu cuenta.
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onApprove?.(payment.id);
                    onClose();
                  }}
                  className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 shadow-lg ${
                    isApproved
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-600/40 cursor-default'
                      : 'gold-button-gradient hover:opacity-95'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{isApproved ? 'Aprobado ✓' : 'Aprobar en Cuenta'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onReject?.(payment.id);
                    onClose();
                  }}
                  className={`px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-1.5 ${
                    isRejected
                      ? 'bg-red-950/60 text-red-300 border border-red-600/40 cursor-default'
                      : 'bg-zinc-850 hover:bg-red-950/80 hover:text-red-300 hover:border-red-800 border border-zinc-700 text-zinc-300'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  <span>{isRejected ? 'Rechazado ✕' : 'Rechazar Pago'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3.5 border-t border-zinc-800 bg-[#09090B]">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#27272A] hover:bg-[#323238] text-white text-xs font-bold tracking-wide transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
