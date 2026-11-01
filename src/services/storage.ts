import { AppState, BarberStation, PaymentRecord } from '../types/barberia';

const STORAGE_KEY = 'barberia_baron_state_v3';
const PREV_KEYS = ['barberia_baron_state_v2', 'barberia_baron_state_v1'];

export const INITIAL_STATIONS: BarberStation[] = [
  {
    id: 'barbero1',
    stationNumber: 1,
    barberName: 'Carlos Mendoza',
    whatsapp: '573124567890',
    username: 'barbero1',
    password: '123',
    currentBalance: 0,
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
    currentBalance: 0,
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
    currentBalance: 0,
    dailyRate: 45000,
    active: true,
  },
];

export const INITIAL_STATE: AppState = {
  stations: INITIAL_STATIONS,
  payments: [],
  chargeLogs: [],
  config: {
    adminUsername: 'admin',
    adminPassword: 'baron2026',
    defaultDailyRate: 45000,
    scriptUrl: 'https://script.google.com/macros/s/AKfycbxGFjtNNYgWf91FZOhZHZjMfx5zXpnPVd1nNtCyJ-gwYMc5DPecLvj06W_RCJKZB-wM/exec',
    lastSyncedAt: null,
    autoSync: true,
    appAuthorized: false,
    authorizedAt: null,
    authorizedBy: null,
  },
  totalCollected: 0,
};

const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxGFjtNNYgWf91FZOhZHZjMfx5zXpnPVd1nNtCyJ-gwYMc5DPecLvj06W_RCJKZB-wM/exec';

export function loadLocalState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Si no existe v3, buscar configuración de versiones anteriores pero reiniciar todos los saldos y contadores a $0
      let priorScriptUrl = DEFAULT_SCRIPT_URL;
      let priorAdminPass = 'baron2026';
      for (const pk of PREV_KEYS) {
        const prev = localStorage.getItem(pk);
        if (prev) {
          try {
            const p = JSON.parse(prev);
            if (p.config?.scriptUrl && !p.config.scriptUrl.includes('PEGA_AQUI')) {
              priorScriptUrl = p.config.scriptUrl;
            }
            if (p.config?.adminPassword) {
              priorAdminPass = p.config.adminPassword;
            }
          } catch {}
        }
      }

      const freshZeroState: AppState = {
        ...INITIAL_STATE,
        stations: INITIAL_STATIONS.map((s) => ({ ...s, currentBalance: 0 })),
        payments: [],
        chargeLogs: [],
        totalCollected: 0,
        config: {
          ...INITIAL_STATE.config,
          adminPassword: priorAdminPass,
          scriptUrl: priorScriptUrl,
          appAuthorized: false,
          authorizedAt: null,
          authorizedBy: null,
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(freshZeroState));
      return freshZeroState;
    }

    const parsed = JSON.parse(raw);
    const existingUrl = parsed.config?.scriptUrl;
    const resolvedUrl = !existingUrl || existingUrl.trim() === '' || existingUrl.includes('PEGA_AQUI')
      ? DEFAULT_SCRIPT_URL
      : existingUrl;

    return {
      ...INITIAL_STATE,
      ...parsed,
      stations: (parsed.stations || INITIAL_STATIONS).map((s: BarberStation, idx: number) => ({
        ...(INITIAL_STATIONS[idx] || s),
        ...s,
        currentBalance: typeof s.currentBalance === 'number' ? s.currentBalance : 0,
      })),
      config: {
        ...INITIAL_STATE.config,
        ...(parsed.config || {}),
        scriptUrl: resolvedUrl,
        appAuthorized: Boolean(parsed.config?.appAuthorized),
        authorizedAt: parsed.config?.authorizedAt || null,
        authorizedBy: parsed.config?.authorizedBy || null,
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
export async function fetchStateFromGoogleSheets(scriptUrl: string, barberId?: string): Promise<AppState | null> {
  if (!scriptUrl || !scriptUrl.trim() || scriptUrl.includes('PEGA_AQUI')) return null;
  const cleanUrl = scriptUrl.trim();

  // Try proxy first
  try {
    const proxyUrl = `/api/sync/sheets?scriptUrl=${encodeURIComponent(cleanUrl)}&action=getState${barberId ? `&barberId=${encodeURIComponent(barberId)}` : ''}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data && data.success && data.data && data.data.state) {
        return data.data.state as AppState;
      }
    }
  } catch (proxyErr) {
    console.warn('Proxy GET fetch failed, attempting direct fetch:', proxyErr);
  }

  // Fallback direct fetch
  try {
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
    console.warn('Error fetching state directly from Google Sheets:', error);
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
    type?: string;
    notes?: string;
    status?: string;
    timestamp: string;
    voucherBase64?: string;
    geminiResult?: any;
  }
): Promise<{ success: boolean; message: string; driveUrl?: string }> {
  if (!scriptUrl || !scriptUrl.trim()) {
    return { success: false, message: 'No hay URL de Google Script configurada' };
  }

  if (scriptUrl.includes('PEGA_AQUI')) {
    return {
      success: false,
      message: 'Configura la URL de Google Apps Script para sincronizar con Google Sheets y Drive',
    };
  }

  try {
    // Sanitize state: keep payments clean without repeating giant base64s of previous history
    const sanitizedPayments = (state.payments || []).map((p) => ({
      ...p,
      voucherBase64: p.voucherBase64 && p.voucherBase64.length > 500 ? '' : p.voucherBase64,
    }));

    const sanitizedState = {
      ...state,
      payments: sanitizedPayments,
    };

    // Format payload with BOTH root fields (expected by user's Google Apps Script) and nested objects
    const payload: any = {
      action: 'syncState',
      timestamp: new Date().toISOString(),
      state: sanitizedState,
      voucher: latestVoucher || null,
    };

    if (latestVoucher) {
      if (latestVoucher.voucherBase64) {
        payload.voucherBase64 = latestVoucher.voucherBase64;
      }
      payload.stationNumber = latestVoucher.stationNumber;
      payload.barberName = latestVoucher.barberName;
      payload.amount = latestVoucher.amount;
      payload.method = latestVoucher.method;
      payload.type = latestVoucher.type || 'Pago Total';
      payload.notes = latestVoucher.notes || '';
      payload.status = latestVoucher.status || 'Pendiente de Aprobación';
    }

    // Try first via our server-side proxy route to avoid CORS & redirect issues
    try {
      const proxyRes = await fetch('/api/sync/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptUrl: scriptUrl.trim(),
          payload,
        }),
      });

      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData.success) {
          return {
            success: true,
            message: proxyData.message || 'Sincronizado exitosamente con Google Sheets y Google Drive',
            driveUrl: proxyData.driveUrl,
          };
        }
      }
    } catch (proxyErr) {
      console.warn('Proxy sync fallback to direct fetch:', proxyErr);
    }

    // Fallback: direct fetch from browser
    const res = await fetch(scriptUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let json: any = {};
    try {
      json = JSON.parse(text);
    } catch {
      json = { status: 'success', message: text };
    }

    const driveUrl = json.driveUrl || json.driveFileUrl || '';

    return {
      success: true,
      message: 'Sincronizado exitosamente con Google Sheets y Google Drive',
      driveUrl: driveUrl !== 'Sin bauche' ? driveUrl : undefined,
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

/**
 * Parsea cualquier valor ingresado a entero limpio en COP.
 * Permite números enteros directos (ej: 40000) o con puntos/comas de miles (ej: 40.000, 40,000, $40.000).
 * Evita bugs donde el navegador interpreta el punto como decimal convirtiendo 40.000 a 39.999 o 40.
 */
export function parseCOPInput(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Math.round(val);
  
  const rawStr = val.toString().trim();
  // Elimina cualquier carácter que no sea un dígito numérico (0-9)
  const digitsOnly = rawStr.replace(/[^0-9]/g, '');
  if (!digitsOnly) return 0;
  
  return parseInt(digitsOnly, 10) || 0;
}

/**
 * Formatea un número como texto con separador de miles con puntos (ej. 40000 -> "40.000")
 */
export function formatNumberWithDots(val: string | number | undefined | null): string {
  const num = typeof val === 'number' ? val : parseCOPInput(val);
  if (!num) return '';
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(num);
}
