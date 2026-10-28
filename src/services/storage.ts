import { AppState, BarberStation, PaymentRecord } from '../types/barberia';

const STORAGE_KEY = 'barberia_baron_state_v1';

export const INITIAL_STATIONS: BarberStation[] = [
  {
    id: 'barbero1',
    stationNumber: 1,
    barberName: 'Carlos Mendoza',
    whatsapp: '573124567890',
    username: 'barbero1',
    password: '123',
    currentBalance: 45000,
    dailyRate: 45000,
    active: true,
  },
  {
    id: 'barbero2',
    stationNumber: 2,
    barberName: 'Andrés Silva',
    whatsapp: '573158901234',
    username: 'barbero2',
    password: '123',
    currentBalance: 0,
    dailyRate: 45000,
    active: true,
  },
  {
    id: 'barbero3',
    stationNumber: 3,
    barberName: 'Mateo Gómez',
    whatsapp: '573202345678',
    username: 'barbero3',
    password: '123',
    currentBalance: 90000,
    dailyRate: 45000,
    active: true,
  },
  {
    id: 'barbero4',
    stationNumber: 4,
    barberName: 'David Herrera',
    whatsapp: '573017654321',
    username: 'barbero4',
    password: '123',
    currentBalance: 45000,
    dailyRate: 45000,
    active: true,
  },
];

export const INITIAL_STATE: AppState = {
  stations: INITIAL_STATIONS,
  payments: [
    {
      id: 'pay-sample-1',
      stationId: 'barbero2',
      stationNumber: 2,
      barberName: 'Andrés Silva',
      type: 'total',
      amount: 45000,
      previousBalance: 45000,
      remainingBalance: 0,
      method: 'Nequi',
      voucherBase64: '',
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
      formattedDate: 'Hoy, 09:30 AM',
      geminiVerification: {
        extractedAmount: 45000,
        extractedDate: 'Hoy, 09:29 AM',
        referenceNumber: 'M829104',
        paymentPlatform: 'Nequi',
        matchStatus: 'verified',
        confidence: 'high',
        analysisNotes: 'Comprobante digital verificado por IA. Coincide exactamente con el valor de alquiler.',
      },
      status: 'aprobado',
      notes: 'Pago de alquiler puntual',
    },
    {
      id: 'pay-sample-2',
      stationId: 'barbero3',
      stationNumber: 3,
      barberName: 'Mateo Gómez',
      type: 'abono',
      amount: 25000,
      previousBalance: 115000,
      remainingBalance: 90000,
      method: 'Daviplata',
      voucherBase64: '',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      formattedDate: 'Ayer, 05:45 PM',
      geminiVerification: {
        extractedAmount: 25000,
        extractedDate: 'Ayer, 05:44 PM',
        referenceNumber: 'D938102',
        paymentPlatform: 'Daviplata',
        matchStatus: 'verified',
        confidence: 'high',
        analysisNotes: 'Abono parcial verificado en Daviplata. Queda saldo pendiente restante.',
      },
      status: 'aprobado',
      notes: 'Abono a cuenta',
    },
  ],
  chargeLogs: [
    {
      id: 'charge-sample-1',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      amountPerStation: 45000,
      totalCharged: 180000,
      stationsAffected: [1, 2, 3, 4],
      note: 'Carga diaria general de alquiler a los 4 puestos',
    },
  ],
  config: {
    adminUsername: 'admin',
    adminPassword: 'baron2026',
    defaultDailyRate: 45000,
    scriptUrl: 'https://script.google.com/macros/s/AKfycbxGFjtNNYgWf91FZOhZHZjMfx5zXpnPVd1nNtCyJ-gwYMc5DPecLvj06W_RCJKZB-wM/exec',
    lastSyncedAt: null,
    autoSync: true,
  },
  totalCollected: 70000,
};

const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxGFjtNNYgWf91FZOhZHZjMfx5zXpnPVd1nNtCyJ-gwYMc5DPecLvj06W_RCJKZB-wM/exec';

export function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw);
    const existingUrl = parsed.config?.scriptUrl;
    const resolvedUrl = !existingUrl || existingUrl.trim() === '' || existingUrl.includes('PEGA_AQUI')
      ? DEFAULT_SCRIPT_URL
      : existingUrl;

    return {
      ...INITIAL_STATE,
      ...parsed,
      stations: parsed.stations || INITIAL_STATIONS,
      config: {
        ...INITIAL_STATE.config,
        ...(parsed.config || {}),
        scriptUrl: resolvedUrl,
      },
    };
  } catch (e) {
    console.error('Error loading state from localStorage:', e);
    return INITIAL_STATE;
  }
}

export function saveLocalState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Error saving state to localStorage:', e);
  }
}

// Google Sheets & Drive Web App Sync API
export async function fetchStateFromGoogleSheets(scriptUrl: string): Promise<AppState | null> {
  if (!scriptUrl || !scriptUrl.trim() || scriptUrl.includes('PEGA_AQUI')) return null;
  try {
    const cleanUrl = scriptUrl.trim();
    const url = cleanUrl.includes('?') ? `${cleanUrl}&action=getState` : `${cleanUrl}?action=getState`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }
    const data = await res.json();
    if (data && data.state) {
      return data.state as AppState;
    }
    return null;
  } catch (error) {
    console.warn('Error fetching state from Google Sheets:', error);
    return null;
  }
}

export async function pushStateToGoogleSheets(
  scriptUrl: string,
  state: AppState,
  latestVoucher?: {
    barberName: string;
    stationNumber: number;
    amount: number;
    method: string;
    timestamp: string;
    voucherBase64?: string;
    geminiResult?: any;
  }
): Promise<{ success: boolean; message: string }> {
  if (!scriptUrl || !scriptUrl.trim()) {
    return { success: false, message: 'No hay URL de Google Script configurada' };
  }

  if (scriptUrl.includes('PEGA_AQUI')) {
    return {
      success: false,
      message: 'Reemplaza PEGA_AQUI_TU_LINK_TERMINADO_EN_EXEC por tu enlace real terminado en /exec para sincronizar con Google Sheets y Drive',
    };
  }

  try {
    const payload = {
      action: 'syncState',
      timestamp: new Date().toISOString(),
      state,
      voucher: latestVoucher || null,
    };

    // Google Apps Script requires Content-Type text/plain to avoid CORS preflight failures
    const res = await fetch(scriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Error en servidor de Google: ${res.status}`);
    }

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { status: 'success', message: text };
    }

    return {
      success: true,
      message: json.message || 'Sincronizado exitosamente con Google Sheets y Drive',
    };
  } catch (error: any) {
    console.error('Error pushing to Google Sheets:', error);
    return {
      success: false,
      message: error?.message || 'Fallo de conexión con Google Sheets',
    };
  }
}

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}
