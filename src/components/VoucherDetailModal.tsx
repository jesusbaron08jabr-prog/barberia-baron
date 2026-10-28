import React from 'react';
import { X, CheckCircle2, AlertTriangle, HelpCircle, Calendar, Hash, CreditCard, Sparkles, User } from 'lucide-react';
import { PaymentRecord } from '../types/barberia';
import { formatCOP } from '../services/storage';

interface Props {
  payment: PaymentRecord | null;
  onClose: () => void;
}

export const VoucherDetailModal: React.FC<Props> = ({ payment, onClose }) => {
  if (!payment) return null;

  const v = payment.geminiVerification;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-[#18181B] border border-[#D4AF37]/40 shadow-2xl overflow-hidden my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-[#09090B]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-cinzel text-sm sm:text-base font-bold text-white">
                Comprobante de Pago — Puesto #{payment.stationNumber}
              </h3>
              <p className="text-[11px] text-zinc-400">{payment.barberName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Voucher Image */}
          <div className="rounded-xl overflow-hidden bg-black border border-zinc-800 flex items-center justify-center min-h-[220px] max-h-[360px] relative group">
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

          {/* Payment Summary Box */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800">
              <span className="text-[10px] uppercase font-semibold text-zinc-400">Monto Reportado</span>
              <p className="text-lg font-bold text-[#D4AF37] font-cinzel mt-0.5">
                {formatCOP(payment.amount)}
              </p>
              <span className="text-[10px] text-zinc-400">
                {payment.type === 'total' ? 'Pago Total de Alquiler' : 'Abono Parcial'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800">
              <span className="text-[10px] uppercase font-semibold text-zinc-400">Método de Pago</span>
              <p className="text-base font-bold text-white mt-0.5">{payment.method}</p>
              <span className="text-[10px] text-zinc-400">{payment.formattedDate}</span>
            </div>
          </div>

          {/* Gemini AI Verification Card */}
          <div className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#D4AF37]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auditoría Inteligente Gemini AI</span>
              </div>
              {v ? (
                v.matchStatus === 'verified' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Verificado
                  </span>
                ) : v.matchStatus === 'discrepancy' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" />
                    Discrepancia
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-full">
                    <HelpCircle className="w-3 h-3" />
                    No concluyente
                  </span>
                )
              ) : (
                <span className="text-[10px] text-zinc-500">Pendiente de análisis</span>
              )}
            </div>

            {v ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 text-zinc-300">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500">Valor leído:</span>
                    <strong className="text-white">
                      {v.extractedAmount ? formatCOP(v.extractedAmount) : 'No detectado'}
                    </strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500">Plataforma:</span>
                    <strong className="text-white">{v.paymentPlatform || 'Transferencia'}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-400 truncate">
                      Ref: <strong className="text-white">{v.referenceNumber || 'N/A'}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-400 truncate">
                      {v.extractedDate || 'Fecha no visible'}
                    </span>
                  </div>
                </div>

                {v.analysisNotes && (
                  <div className="p-2.5 rounded-lg bg-[#18181B] text-[11px] text-zinc-300 border border-zinc-800">
                    <p className="italic">"{v.analysisNotes}"</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                Comprobante sin datos de auditoría automática.
              </p>
            )}
          </div>

          {/* Balances Context */}
          <div className="flex items-center justify-between text-xs text-zinc-400 px-1 pt-1">
            <span>Saldo previo: {formatCOP(payment.previousBalance)}</span>
            <span>Saldo restante: <strong className="text-zinc-200">{formatCOP(payment.remainingBalance)}</strong></span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-zinc-800 bg-[#09090B]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#27272A] hover:bg-[#323238] text-white text-xs font-semibold tracking-wide transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
