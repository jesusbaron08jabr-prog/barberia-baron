export interface GeminiVerificationResult {
  extractedAmount: number | null;
  extractedDate: string | null;
  referenceNumber: string | null;
  paymentPlatform: string;
  matchStatus: 'verified' | 'discrepancy' | 'unreadable';
  confidence: 'high' | 'medium' | 'low';
  analysisNotes: string;
}

export type PaymentMethod = 'Nequi' | 'Daviplata' | 'Bancolombia' | 'Efectivo';

export interface PaymentRecord {
  id: string;
  stationId: string;
  stationNumber: number;
  barberName: string;
  type: 'total' | 'abono';
  amount: number;
  previousBalance: number;
  remainingBalance: number;
  method: PaymentMethod;
  voucherBase64: string;
  timestamp: string;
  formattedDate: string;
  geminiVerification?: GeminiVerificationResult | null;
  status: 'aprobado' | 'pendiente' | 'pendiente_revision' | 'rechazado';
  notes?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  driveFileUrl?: string;
}

export interface BarberStation {
  id: string; // 'barbero1', 'barbero2', 'barbero3', 'barbero4'
  stationNumber: number; // 1, 2, 3, 4
  barberName: string;
  whatsapp: string;
  username: string;
  password: string;
  currentBalance: number;
  dailyRate: number;
  active: boolean;
  avatarSeed?: string;
}

export interface DailyChargeLog {
  id: string;
  timestamp: string;
  amountPerStation: number;
  totalCharged: number;
  stationsAffected: number[];
  note: string;
}

export interface AdminConfig {
  adminUsername: string;
  adminPassword: string;
  defaultDailyRate: number;
  scriptUrl: string; // Google Apps Script Web App URL
  lastSyncedAt: string | null;
  autoSync: boolean;
  appAuthorized: boolean; // Si el administrador ha autorizado el inicio oficial de la app
  authorizedAt: string | null; // Fecha y hora en que se autorizó el uso de la app
  authorizedBy: string | null;
}

export interface AppState {
  stations: BarberStation[];
  payments: PaymentRecord[];
  chargeLogs: DailyChargeLog[];
  config: AdminConfig;
  totalCollected: number;
}

export interface UserSession {
  role: 'admin' | 'barber';
  stationId?: string; // if role === 'barber'
  username: string;
  name: string;
}
