import React, { useState } from 'react';
import {
  AppState,
  BarberStation,
  PaymentRecord,
  DailyChargeLog,
  AdminConfig,
} from '../types/barberia';
import { formatCOP, pushStateToGoogleSheets, fetchStateFromGoogleSheets } from '../services/storage';
import { Logo } from './Logo';
import { PWAInstallButton } from './PWAInstallButton';
import { VoucherDetailModal } from './VoucherDetailModal';
import { GoogleAppsScriptModal } from './GoogleAppsScriptModal';
import {
  LogOut,
  Scissors,
  DollarSign,
  TrendingUp,
  MessageCircle,
  SlidersHorizontal,
  FileSpreadsheet,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  HardDrive,
  Sparkles,
  ExternalLink,
  Save,
  Layers,
  CalendarCheck,
  UserCheck
} from 'lucide-react';

interface Props {
  appState: AppState;
  onUpdateState: (newState: AppState, latestVoucher?: any) => void;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<Props> = ({
  appState,
  onUpdateState,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'puestos' | 'bauches' | 'config'>('puestos');
  
  // Selected voucher for inspection
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);

  // Modals
  const [showAppsScriptModal, setShowAppsScriptModal] = useState(false);
  const [showChargeConfirmModal, setShowChargeConfirmModal] = useState(false);
  const [adjustingStation, setAdjustingStation] = useState<BarberStation | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('');

  // Direct cash payment modal for admin
  const [payingStation, setPayingStation] = useState<BarberStation | null>(null);
  const [directPayAmount, setDirectPayAmount] = useState('');
  const [directPayMethod, setDirectPayMethod] = useState<'Efectivo' | 'Nequi' | 'Daviplata' | 'Bancolombia'>('Efectivo');

  // Filter in Bauches tab
  const [filterStation, setFilterStation] = useState<string>('all');

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Configuration edit state
  const [configStations, setConfigStations] = useState<BarberStation[]>(appState.stations);
  const [scriptUrlInput, setScriptUrlInput] = useState(appState.config.scriptUrl || '');
  const [adminPasswordInput, setAdminPasswordInput] = useState(appState.config.adminPassword);
  const [configSavedNotice, setConfigSavedNotice] = useState(false);

  // Calculate totals
  const totalPendingBalances = appState.stations.reduce((acc, s) => acc + s.currentBalance, 0);

  // 1. Cargar Día de Alquiler a los 4 Barberos
  const handleChargeDailyRent = () => {
    const updatedStations = appState.stations.map((s) => ({
      ...s,
      currentBalance: s.currentBalance + s.dailyRate,
    }));

    const totalAdded = updatedStations.reduce((sum, s) => sum + s.dailyRate, 0);

    const chargeLog: DailyChargeLog = {
      id: 'charge-' + Date.now(),
      timestamp: new Date().toISOString(),
      amountPerStation: appState.config.defaultDailyRate,
      totalCharged: totalAdded,
      stationsAffected: [1, 2, 3, 4],
      note: `Carga diaria de alquiler efectuada a los 4 puestos ($${formatCOP(totalAdded)} total)`,
    };

    const newState: AppState = {
      ...appState,
      stations: updatedStations,
      chargeLogs: [chargeLog, ...appState.chargeLogs],
    };

    onUpdateState(newState);
    setShowChargeConfirmModal(false);
  };

  // 2. Ajustar Saldo Manual
  const handleSaveManualAdjustment = () => {
    if (!adjustingStation) return;
    const val = parseInt(adjustAmount, 10);
    if (!val || isNaN(val) || val <= 0) return;

    const updatedStations = appState.stations.map((s) => {
      if (s.id === adjustingStation.id) {
        const newBal = adjustType === 'add'
          ? s.currentBalance + val
          : Math.max(0, s.currentBalance - val);
        return { ...s, currentBalance: newBal };
      }
      return s;
    });

    const newState: AppState = {
      ...appState,
      stations: updatedStations,
    };

    onUpdateState(newState);
    setAdjustingStation(null);
    setAdjustAmount('');
    setAdjustReason('');
  };

  // 3. Registrar Pago Directo en Efectivo o en mano
  const handleRegisterDirectPayment = () => {
    if (!payingStation) return;
    const val = parseInt(directPayAmount, 10);
    if (!val || isNaN(val) || val <= 0) return;

    const prevBal = payingStation.currentBalance;
    const newBal = Math.max(0, prevBal - val);

    const newPayment: PaymentRecord = {
      id: 'pay-dir-' + Date.now(),
      stationId: payingStation.id,
      stationNumber: payingStation.stationNumber,
      barberName: payingStation.barberName,
      type: val >= prevBal ? 'total' : 'abono',
      amount: val,
      previousBalance: prevBal,
      remainingBalance: newBal,
      method: directPayMethod,
      voucherBase64: '',
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      geminiVerification: {
        extractedAmount: val,
        extractedDate: new Date().toLocaleDateString('es-CO'),
        referenceNumber: 'DIR-' + Math.floor(100000 + Math.random() * 900000),
        paymentPlatform: directPayMethod,
        matchStatus: 'verified',
        confidence: 'high',
        analysisNotes: 'Pago directo registrado en caja por el Administrador.',
      },
      status: 'aprobado',
      notes: 'Pago recibido directamente en barbería',
    };

    const updatedStations = appState.stations.map((s) => {
      if (s.id === payingStation.id) {
        return { ...s, currentBalance: newBal };
      }
      return s;
    });

    const newState: AppState = {
      ...appState,
      stations: updatedStations,
      payments: [newPayment, ...appState.payments],
      totalCollected: appState.totalCollected + val,
    };

    onUpdateState(newState, {
      barberName: payingStation.barberName,
      stationNumber: payingStation.stationNumber,
      type: newPayment.type === 'total' ? 'Pago Total' : 'Abono Parcial',
      amount: val,
      method: directPayMethod,
      timestamp: newPayment.timestamp,
    });

    setPayingStation(null);
    setDirectPayAmount('');
  };

  // 4. Recordatorio WhatsApp
  const handleSendWhatsAppReminder = (station: BarberStation) => {
    // Clean phone number (strip spaces, symbols; ensure 57 prefix)
    let clean = station.whatsapp.replace(/[^0-9]/g, '');
    if (!clean.startsWith('57') && clean.length === 10) {
      clean = '57' + clean;
    }

    const message = `Hola ${station.barberName}, te saludamos de Barbería Barón. Te recordamos que en tu Puesto #${station.stationNumber} tienes un saldo pendiente de alquiler de ${formatCOP(station.currentBalance)} COP. Por favor reportar tu comprobante en la aplicación. ¡Gracias y éxitos en la jornada!`;

    const encoded = encodeURIComponent(message);
    const waUrl = `https://wa.me/${clean}?text=${encoded}`;
    window.open(waUrl, '_blank');
  };

  // 5. Sincronizar manualmente con Google Sheets
  const handleManualSync = async () => {
    if (!appState.config.scriptUrl) {
      setSyncStatusMsg({
        type: 'error',
        text: 'Debes configurar primero la URL de Google Apps Script en Configuración.',
      });
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg(null);

    try {
      // Push state
      const res = await pushStateToGoogleSheets(appState.config.scriptUrl, appState);
      if (res.success) {
        const updatedConfig: AdminConfig = {
          ...appState.config,
          lastSyncedAt: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        };
        onUpdateState({ ...appState, config: updatedConfig });
        setSyncStatusMsg({ type: 'success', text: '¡Sincronizado con Google Sheets y Google Drive con éxito!' });
      } else {
        setSyncStatusMsg({ type: 'error', text: res.message });
      }
    } catch (e: any) {
      setSyncStatusMsg({ type: 'error', text: e?.message || 'Error de sincronización' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 6. Guardar cambios en la Pestaña de Configuración
  const handleSaveConfiguration = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedConfig: AdminConfig = {
      ...appState.config,
      scriptUrl: scriptUrlInput.trim(),
      adminPassword: adminPasswordInput.trim() || appState.config.adminPassword,
    };

    const newState: AppState = {
      ...appState,
      stations: configStations,
      config: updatedConfig,
    };

    onUpdateState(newState);
    setConfigSavedNotice(true);
    setTimeout(() => setConfigSavedNotice(false), 3000);
  };

  const updateStationField = (index: number, field: keyof BarberStation, value: any) => {
    const next = [...configStations];
    next[index] = { ...next[index], [field]: value };
    setConfigStations(next);
  };

  // Filter payments
  const filteredPayments = filterStation === 'all'
    ? appState.payments
    : appState.payments.filter((p) => p.stationId === filterStation);

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#09090B]/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40">
                  Panel Administrador
                </span>
                <span className="text-xs text-zinc-400 font-medium hidden sm:inline">Dueño</span>
              </div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Barbería Barón
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-[#18181B] hover:border-[#D4AF37]/50 text-xs text-zinc-300 hover:text-white transition"
              title="Sincronizar con Google Sheets"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#D4AF37] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
            </button>

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

      {/* Tabs Navigation */}
      <div className="max-w-5xl mx-auto w-full px-4 pt-4">
        <div className="flex rounded-2xl bg-[#18181B] border border-zinc-800 p-1">
          <button
            onClick={() => setActiveTab('puestos')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'puestos'
                ? 'gold-button-gradient text-black shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Scissors className="w-4 h-4" />
            <span>4 Puestos & Saldos</span>
          </button>

          <button
            onClick={() => setActiveTab('bauches')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'bauches'
                ? 'gold-button-gradient text-black shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Historial Bauches ({appState.payments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
              activeTab === 'config'
                ? 'gold-button-gradient text-black shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Configuración</span>
          </button>
        </div>
      </div>

      {/* Sync Status Toast */}
      {syncStatusMsg && (
        <div className="max-w-5xl mx-auto w-full px-4 pt-3">
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              syncStatusMsg.type === 'success'
                ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-200'
                : 'bg-red-950/70 border-red-600/50 text-red-200'
            }`}
          >
            <span>{syncStatusMsg.text}</span>
            <button
              onClick={() => setSyncStatusMsg(null)}
              className="text-zinc-400 hover:text-white text-xs font-bold px-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      <main className="max-w-5xl mx-auto w-full px-4 pt-5 flex-1 space-y-6">
        {/* ============================================================== */}
        {/* TAB 1: PUESTOS & CONTROL                                       */}
        {/* ============================================================== */}
        {activeTab === 'puestos' && (
          <>
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Total Recaudado */}
              <div className="p-5 rounded-3xl bg-[#18181B] border border-zinc-800 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">
                  <span>Total Recaudado</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-950/60 text-emerald-400 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <h3 className="font-cinzel text-2xl sm:text-3xl font-black text-emerald-400">
                    {formatCOP(appState.totalCollected)}
                  </h3>
                  <span className="text-[11px] font-bold text-zinc-500">COP</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Ingresos totales de alquiler acumulados</p>
              </div>

              {/* Total Saldos Pendientes */}
              <div className="p-5 rounded-3xl bg-[#18181B] border border-[#D4AF37]/30 shadow-xl relative overflow-hidden gold-card-glow">
                <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">
                  <span>Saldos Pendientes</span>
                  <div className="w-7 h-7 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <h3 className="font-cinzel text-2xl sm:text-3xl font-black gold-text-gradient">
                    {formatCOP(totalPendingBalances)}
                  </h3>
                  <span className="text-[11px] font-bold text-zinc-500">COP</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">Deuda acumulada de los 4 puestos</p>
              </div>

              {/* Puestos y Sincronización */}
              <div className="p-5 rounded-3xl bg-[#18181B] border border-zinc-800 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">
                    <span>Estado en Nube</span>
                    <HardDrive className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-bold text-white">
                      {appState.config.scriptUrl ? 'Google Sheets Conectado' : 'Modo Local'}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1 truncate">
                    {appState.config.lastSyncedAt
                      ? `Último sync: ${appState.config.lastSyncedAt}`
                      : 'Listo para sincronizar'}
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => setShowAppsScriptModal(true)}
                    className="text-xs text-[#D4AF37] hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    <span>Configurar Drive/Sheets</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Global Action Banner: Cargar Día de Alquiler */}
            <div className="rounded-3xl bg-gradient-to-r from-[#2A2311] via-[#1E1B13] to-[#18181B] border border-[#D4AF37]/50 p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 text-center sm:text-left">
                <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] flex-shrink-0">
                  <CalendarCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-cinzel text-base font-bold text-white">
                    Cargar Día de Alquiler a los 4 Barberos
                  </h3>
                  <p className="text-xs text-zinc-300">
                    Suma la tarifa diaria configurada al saldo pendiente de cada uno de los 4 puestos simultáneamente.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowChargeConfirmModal(true)}
                className="w-full sm:w-auto px-5 py-3 rounded-2xl gold-button-gradient text-xs sm:text-sm font-black uppercase tracking-wider transition whitespace-nowrap shadow-lg flex items-center justify-center gap-2 flex-shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Cargar Día a los 4</span>
              </button>
            </div>

            {/* 4 Barber Stations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {appState.stations.map((st) => (
                <div
                  key={st.id}
                  className="rounded-3xl bg-[#18181B] border border-zinc-800 hover:border-[#D4AF37]/40 p-5 shadow-xl transition space-y-4"
                >
                  {/* Card Top */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#09090B] border border-[#D4AF37]/30 flex items-center justify-center font-cinzel font-extrabold text-[#D4AF37] text-lg">
                        #{st.stationNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-base">{st.barberName}</h4>
                          <span className="text-[10px] text-zinc-400 font-mono">@{st.username}</span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Tarifa diaria: <strong className="text-zinc-200">{formatCOP(st.dailyRate)}</strong>
                        </p>
                      </div>
                    </div>

                    <div>
                      {st.currentBalance === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-700/60 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Al Día
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-950/70 border border-amber-700/60 px-2.5 py-1 rounded-full">
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Saldo Pendiente Big Number */}
                  <div className="p-3.5 rounded-2xl bg-[#09090B] border border-zinc-850 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        Saldo Pendiente Actual
                      </span>
                      <div className="text-2xl font-black font-cinzel text-white mt-0.5">
                        {formatCOP(st.currentBalance)}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setPayingStation(st);
                        setDirectPayAmount(st.currentBalance > 0 ? st.currentBalance.toString() : st.dailyRate.toString());
                      }}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-[#D4AF37] border border-[#D4AF37]/30 transition"
                      title="Registrar pago recibido en mano/efectivo"
                    >
                      + Registrar Pago
                    </button>
                  </div>

                  {/* Actions: Recordatorio WhatsApp & Ajustar Saldo Manual */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleSendWhatsAppReminder(st)}
                      className="py-2.5 px-3 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 text-emerald-300 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      <span>Recordatorio WhatsApp</span>
                    </button>

                    <button
                      onClick={() => {
                        setAdjustingStation(st);
                        setAdjustAmount('');
                        setAdjustType('add');
                        setAdjustReason('');
                      }}
                      className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-200 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span>Ajustar Saldo Manual</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ============================================================== */}
        {/* TAB 2: HISTORIAL DE BAUCHES Y COMPROBANTES                     */}
        {/* ============================================================== */}
        {activeTab === 'bauches' && (
          <div className="space-y-4">
            {/* Header & Filter */}
            <div className="p-4 rounded-3xl bg-[#18181B] border border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="font-cinzel text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                  <span>Historial de Comprobantes & Auditoría IA</span>
                </h3>
                <p className="text-xs text-zinc-400">
                  Verificación de comprobantes leídos por Gemini AI
                </p>
              </div>

              {/* Station Filter */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-zinc-400 font-medium">Filtrar:</span>
                <select
                  value={filterStation}
                  onChange={(e) => setFilterStation(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-[#09090B] border border-zinc-750 text-xs font-medium text-white focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="all">Todos los 4 Puestos</option>
                  <option value="barbero1">Puesto #1 (Carlos Mendoza)</option>
                  <option value="barbero2">Puesto #2 (Andrés Silva)</option>
                  <option value="barbero3">Puesto #3 (Mateo Gómez)</option>
                  <option value="barbero4">Puesto #4 (David Herrera)</option>
                </select>
              </div>
            </div>

            {/* List of Payments */}
            {filteredPayments.length === 0 ? (
              <div className="p-12 rounded-3xl bg-[#18181B] border border-zinc-800 text-center text-zinc-500 text-xs">
                No hay pagos registrados bajo este filtro.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPayments.map((p) => {
                  const v = p.geminiVerification;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPayment(p)}
                      className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800 hover:border-[#D4AF37]/50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group shadow-md"
                    >
                      {/* Left side: thumbnail + info */}
                      <div className="flex items-center gap-3.5">
                        <div className="w-14 h-14 rounded-2xl bg-black border border-zinc-800 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                          {p.voucherBase64 ? (
                            <img
                              src={p.voucherBase64}
                              alt="Voucher"
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          ) : (
                            <DollarSign className="w-6 h-6 text-[#D4AF37]" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase font-extrabold px-2 py-0.5 rounded-md bg-[#09090B] text-[#D4AF37] border border-[#D4AF37]/30">
                              Puesto #{p.stationNumber}
                            </span>
                            <span className="font-bold text-white text-sm">{p.barberName}</span>
                          </div>

                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="font-cinzel text-base font-extrabold text-white">
                              {formatCOP(p.amount)}
                            </span>
                            <span className="text-xs text-zinc-400">
                              ({p.type === 'total' ? 'Pago Total' : 'Abono Parcial'} • {p.method})
                            </span>
                          </div>

                          <div className="text-[11px] text-zinc-400 mt-0.5">
                            <span>{p.formattedDate}</span>
                            {p.notes && <span> • Nota: "{p.notes}"</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Gemini AI Tag & View button */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-850">
                        {v ? (
                          <div className="flex flex-col items-start sm:items-end">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                v.matchStatus === 'verified'
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                                  : v.matchStatus === 'discrepancy'
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                                  : 'bg-zinc-900 text-zinc-300 border-zinc-750'
                              }`}
                            >
                              <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                              <span>
                                {v.matchStatus === 'verified' ? 'Verificado por IA' : 'Revisión IA'}
                              </span>
                            </span>
                            <span className="text-[10px] text-zinc-400 mt-1 font-mono">
                              Ref: {v.referenceNumber || 'N/A'} • {v.paymentPlatform || p.method}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-500">En efectivo / Directo</span>
                        )}

                        <button
                          type="button"
                          className="p-2 rounded-xl bg-[#09090B] border border-zinc-800 text-zinc-400 group-hover:text-[#D4AF37] group-hover:border-[#D4AF37]/50 transition"
                          title="Inspeccionar Bauche"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: CONFIGURACIÓN                                           */}
        {/* ============================================================== */}
        {activeTab === 'config' && (
          <form onSubmit={handleSaveConfiguration} className="space-y-6">
            {/* Google Apps Script & Drive Integration */}
            <div className="rounded-3xl bg-[#18181B] border border-[#D4AF37]/40 p-6 shadow-xl space-y-4 gold-card-glow">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-cinzel text-base font-bold text-white">
                      Sincronización Google Sheets & Google Drive
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Guarda los saldos, pagos y bauches automáticamente en tu cuenta de Google
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAppsScriptModal(true)}
                  className="px-3 py-1.5 rounded-xl gold-badge-gradient text-[#D4AF37] text-xs font-bold hover:bg-[#D4AF37]/20 transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ver Código Apps Script</span>
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  URL del Web App de Google Apps Script (SCRIPT_URL)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={scriptUrlInput}
                    onChange={(e) => setScriptUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-4 py-3 rounded-xl bg-[#09090B] border border-zinc-700 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
                  />
                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Probar Conexión</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Al configurar esta URL, cada pago o cambio se enviará vía POST (Content-Type: text/plain) y guardará la imagen en Google Drive.
                </p>
              </div>
            </div>

            {/* Configuración de los 4 Barberos */}
            <div className="rounded-3xl bg-[#18181B] border border-zinc-800 p-6 shadow-xl space-y-5">
              <div className="pb-3 border-b border-zinc-800">
                <h3 className="font-cinzel text-base font-bold text-white">
                  Configuración de los 4 Puestos y Barberos
                </h3>
                <p className="text-xs text-zinc-400">
                  Modifica nombres, teléfonos WhatsApp, tarifas diarias de alquiler, usuarios y contraseñas.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {configStations.map((st, idx) => (
                  <div
                    key={st.id}
                    className="p-4 rounded-2xl bg-[#09090B] border border-zinc-800 space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-850">
                      <span className="font-cinzel font-bold text-sm text-[#D4AF37]">
                        PUESTO #{st.stationNumber}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">ID: {st.id}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Barber Name */}
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-medium">Nombre Barbero</label>
                        <input
                          type="text"
                          value={st.barberName}
                          onChange={(e) => updateStationField(idx, 'barberName', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-zinc-700 text-white font-medium"
                        />
                      </div>

                      {/* WhatsApp */}
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-medium">WhatsApp (con código)</label>
                        <input
                          type="tel"
                          value={st.whatsapp}
                          onChange={(e) => updateStationField(idx, 'whatsapp', e.target.value)}
                          placeholder="ej. 573124567890"
                          className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-zinc-700 text-white font-medium font-mono"
                        />
                      </div>

                      {/* Tarifa Diaria */}
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-medium">Tarifa Diaria (COP)</label>
                        <input
                          type="number"
                          step="1000"
                          value={st.dailyRate}
                          onChange={(e) => updateStationField(idx, 'dailyRate', parseInt(e.target.value, 10) || 0)}
                          className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-zinc-700 text-white font-bold"
                        />
                      </div>

                      {/* Username */}
                      <div className="space-y-1">
                        <label className="text-zinc-400 font-medium">Usuario Login</label>
                        <input
                          type="text"
                          value={st.username}
                          onChange={(e) => updateStationField(idx, 'username', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-zinc-700 text-white font-medium font-mono"
                        />
                      </div>

                      {/* Password */}
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-zinc-400 font-medium">Contraseña Barbero</label>
                        <input
                          type="text"
                          value={st.password}
                          onChange={(e) => updateStationField(idx, 'password', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#18181B] border border-zinc-700 text-white font-medium font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Administrador Password */}
            <div className="rounded-3xl bg-[#18181B] border border-zinc-800 p-6 shadow-xl space-y-3">
              <h3 className="font-cinzel text-base font-bold text-white">
                Seguridad del Administrador
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-zinc-400 font-medium">Usuario Administrador</label>
                  <input
                    type="text"
                    disabled
                    value={appState.config.adminUsername}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#09090B] border border-zinc-800 text-zinc-400 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-zinc-400 font-medium">Contraseña Administrador</label>
                  <input
                    type="text"
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[#09090B] border border-zinc-700 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Save Buttons & Confirmation */}
            {configSavedNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 text-xs flex items-center justify-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>¡Configuración guardada y sincronizada exitosamente!</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 rounded-2xl gold-button-gradient font-black text-sm uppercase tracking-wider transition shadow-xl flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Guardar Todos los Cambios</span>
            </button>
          </form>
        )}
      </main>

      {/* ============================================================== */}
      {/* MODAL: CONFIRMAR CARGA DE DÍA DE ALQUILER                      */}
      {/* ============================================================== */}
      {showChargeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#18181B] border border-[#D4AF37]/50 p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] mx-auto mb-4">
              <CalendarCheck className="w-6 h-6" />
            </div>

            <h3 className="font-cinzel text-lg font-bold text-white text-center">
              ¿Cargar Día de Alquiler a los 4 Barberos?
            </h3>
            <p className="text-xs text-zinc-300 text-center mt-2 leading-relaxed">
              Esta acción sumará la tarifa diaria a cada uno de los 4 puestos.
            </p>

            <div className="my-4 p-3.5 rounded-2xl bg-[#09090B] border border-zinc-800 space-y-1.5 text-xs">
              {appState.stations.map((s) => (
                <div key={s.id} className="flex justify-between text-zinc-300">
                  <span>Puesto #{s.stationNumber} ({s.barberName})</span>
                  <strong className="text-[#D4AF37]">+{formatCOP(s.dailyRate)}</strong>
                </div>
              ))}
              <div className="border-t border-zinc-800 pt-1.5 flex justify-between font-bold text-white">
                <span>Total a cargar:</span>
                <span className="text-emerald-400">
                  +{formatCOP(appState.stations.reduce((sum, s) => sum + s.dailyRate, 0))}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowChargeConfirmModal(false)}
                className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleChargeDailyRent}
                className="flex-1 py-3 rounded-xl gold-button-gradient text-xs font-black uppercase tracking-wider transition shadow-lg"
              >
                Confirmar Carga
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: AJUSTAR SALDO MANUAL                                    */}
      {/* ============================================================== */}
      {adjustingStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#18181B] border border-[#D4AF37]/50 p-6 shadow-2xl relative">
            <h3 className="font-cinzel text-base font-bold text-white">
              Ajustar Saldo Manual — Puesto #{adjustingStation.stationNumber}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">{adjustingStation.barberName}</p>

            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800 flex justify-between items-center text-xs">
                <span className="text-zinc-400">Saldo Actual:</span>
                <strong className="text-base text-white font-cinzel">
                  {formatCOP(adjustingStation.currentBalance)}
                </strong>
              </div>

              {/* Adjust Type */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAdjustType('add')}
                  className={`py-2 px-3 rounded-xl font-bold border transition ${
                    adjustType === 'add'
                      ? 'bg-amber-950/70 border-amber-600 text-amber-300'
                      : 'bg-[#09090B] border-zinc-800 text-zinc-400'
                  }`}
                >
                  + Sumar Deuda
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('subtract')}
                  className={`py-2 px-3 rounded-xl font-bold border transition ${
                    adjustType === 'subtract'
                      ? 'bg-emerald-950/70 border-emerald-600 text-emerald-300'
                      : 'bg-[#09090B] border-zinc-800 text-zinc-400'
                  }`}
                >
                  - Descontar Saldo
                </button>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-300 font-semibold">Monto del Ajuste (COP)</label>
                <input
                  type="number"
                  step="1000"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="ej. 20000"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#09090B] border border-zinc-700 text-white font-bold"
                />
              </div>

              {/* Reason */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-300 font-semibold">Motivo del Ajuste (Opcional)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="ej. Descuento día libre, ajuste fin de semana"
                  className="w-full px-3 py-2 rounded-xl bg-[#09090B] border border-zinc-800 text-xs text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingStation(null)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-white text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveManualAdjustment}
                  className="flex-1 py-2.5 rounded-xl gold-button-gradient text-xs font-bold uppercase tracking-wider"
                >
                  Guardar Ajuste
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: REGISTRAR PAGO DIRECTO EN CAJA                          */}
      {/* ============================================================== */}
      {payingStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[#18181B] border border-[#D4AF37]/50 p-6 shadow-2xl relative">
            <h3 className="font-cinzel text-base font-bold text-white">
              Registrar Pago Directo — Puesto #{payingStation.stationNumber}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">{payingStation.barberName}</p>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800 flex justify-between items-center">
                <span className="text-zinc-400">Saldo Pendiente:</span>
                <strong className="text-base text-white font-cinzel">
                  {formatCOP(payingStation.currentBalance)}
                </strong>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-semibold">Valor Recibido (COP)</label>
                <input
                  type="number"
                  step="1000"
                  value={directPayAmount}
                  onChange={(e) => setDirectPayAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#09090B] border border-zinc-700 text-white font-bold text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-semibold">Método</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['Efectivo', 'Nequi', 'Daviplata', 'Bancolombia'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDirectPayMethod(m)}
                      className={`py-2 rounded-lg font-semibold border ${
                        directPayMethod === m
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]'
                          : 'border-zinc-800 bg-[#09090B] text-zinc-400'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingStation(null)}
                  className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-white font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRegisterDirectPayment}
                  className="flex-1 py-2.5 rounded-xl gold-button-gradient font-bold uppercase tracking-wider"
                >
                  Registrar Pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voucher Detail Modal */}
      <VoucherDetailModal
        payment={selectedPayment}
        onClose={() => setSelectedPayment(null)}
      />

      {/* Google Apps Script Modal */}
      <GoogleAppsScriptModal
        isOpen={showAppsScriptModal}
        onClose={() => setShowAppsScriptModal(false)}
      />
    </div>
  );
};
