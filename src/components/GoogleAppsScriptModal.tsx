import React, { useState } from 'react';
import { X, Copy, Check, FileSpreadsheet, HardDrive, ExternalLink, ArrowLeft } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const APPS_SCRIPT_CODE = `/**
 * ==============================================================
 * BARBERÍA BARÓN - SINCRONIZACIÓN GOOGLE SHEETS & GOOGLE DRIVE
 * ==============================================================
 * 
 * INSTRUCCIONES DE INSTALACIÓN (2 minutos):
 * 1. Abre https://script.google.com en tu navegador con tu cuenta de Google.
 *    (O bien abre tu Google Sheet > Extensiones > Apps Script).
 * 2. Borra todo el código existente y pega este script completo.
 * 3. Haz clic en "Implementar" (botón azul) > "Nueva implementación".
 * 4. Tipo: "Aplicación web".
 *    - Descripción: "Barbería Barón Sync"
 *    - Ejecutar como: "Yo" (tu cuenta de Google)
 *    - Quién tiene acceso: "Cualquier persona" (Anyone) -> OBLIGATORIO
 * 5. Haz clic en "Implementar", autoriza los permisos requeridos en Google.
 * 6. Copia la "URL de la aplicación web" (termina en /exec) y pégala en la Configuración de Barbería Barón.
 */

function doGet(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var stateJson = props.getProperty("BARON_APP_STATE");
    
    var response = {
      ok: true,
      status: "success",
      state: stateJson ? JSON.parse(stateJson) : null,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    
    // Extraer campos del comprobante (soporta tanto nivel raíz como objeto voucher)
    var vBase64 = payload.voucherBase64 || (payload.voucher && payload.voucher.voucherBase64) || "";
    var stationNumber = payload.stationNumber || (payload.voucher && payload.voucher.stationNumber) || 1;
    var barberName = payload.barberName || (payload.voucher && payload.voucher.barberName) || "Barbero";
    var amount = payload.amount || (payload.voucher && payload.voucher.amount) || 0;
    var method = payload.method || (payload.voucher && payload.voucher.method) || "Transferencia";
    var type = payload.type || (payload.voucher && payload.voucher.type) || "Pago";
    var notes = payload.notes || (payload.voucher && payload.voucher.notes) || "";
    var status = payload.status || (payload.voucher && payload.voucher.status) || "Pendiente de Aprobación";
    
    var driveUrl = "Sin bauche";
    
    // 1. Si viene imagen de bauche, guardarla en carpeta de Google Drive
    if (vBase64 && vBase64.length > 50) {
      try {
        driveUrl = saveVoucherToDrive(vBase64, stationNumber, barberName);
      } catch (driveErr) {
        Logger.log("Error guardando en Drive: " + driveErr.toString());
        driveUrl = "Error al guardar en Drive: " + driveErr.toString();
      }
    }
    
    // 2. Sincronizar en Google Sheets
    try {
      syncToSpreadsheet(payload.state, {
        stationNumber: stationNumber,
        barberName: barberName,
        amount: amount,
        method: method,
        type: type,
        notes: notes,
        status: status,
        driveUrl: driveUrl
      });
    } catch (sheetErr) {
      Logger.log("Error sincronizando Sheets: " + sheetErr.toString());
    }
    
    // 3. Guardar estado general ligero (sin base64 pesados) para persistencia
    if (payload.state) {
      try {
        var cleanState = JSON.parse(JSON.stringify(payload.state));
        if (cleanState.payments) {
          for (var i = 0; i < cleanState.payments.length; i++) {
            if (cleanState.payments[i].voucherBase64 && cleanState.payments[i].voucherBase64.length > 200) {
              cleanState.payments[i].voucherBase64 = "";
            }
          }
        }
        var stateStr = JSON.stringify(cleanState);
        if (stateStr.length < 8500) {
          props.setProperty("BARON_APP_STATE", stateStr);
        }
      } catch(e) {}
    }
    
    var response = {
      ok: true,
      status: "success",
      message: "Registrado exitosamente en Google Sheets y Google Drive",
      driveUrl: driveUrl,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSpreadsheet() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch(e) {}
  
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("SPREADSHEET_ID");
  var ss;
  
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch(e) {}
  }
  
  if (!ss) {
    ss = SpreadsheetApp.create("Barbería Barón - Control de Alquiler y Pagos");
    props.setProperty("SPREADSHEET_ID", ss.getId());
  }
  return ss;
}

function getOrCreateDriveFolder() {
  var folderName = "Barbería Barón - Bauches de Pago";
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function saveVoucherToDrive(base64Data, stationNumber, barberName) {
  var folder = getOrCreateDriveFolder();
  var contentType = "image/jpeg";
  var cleanBase64 = base64Data;
  
  if (base64Data.indexOf(";base64,") !== -1) {
    var parts = base64Data.split(";base64,");
    contentType = parts[0].replace("data:", "");
    cleanBase64 = parts[1];
  }
  
  var decoded = Utilities.base64Decode(cleanBase64);
  var fileName = "Bauche_Puesto_" + stationNumber + "_" + barberName.replace(/\\s+/g, "_") + "_" + Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd_HH-mm-ss") + ".jpg";
  var blob = Utilities.newBlob(decoded, contentType, fileName);
  var file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch(e) {}
  return file.getUrl();
}

function syncToSpreadsheet(state, voucherInfo) {
  var ss = getOrCreateSpreadsheet();
  
  // 1. Pestaña: Resumen de Puestos y Saldos
  var resumenSheet = ss.getSheetByName("Resumen_Puestos");
  if (!resumenSheet) {
    resumenSheet = ss.insertSheet("Resumen_Puestos");
    resumenSheet.appendRow(["PUESTO", "BARBERO", "SALDO PENDIENTE (COP)", "TARIFA DIARIA", "TEL WHATSAPP", "USUARIO", "ESTADO", "ÚLTIMA ACTUALIZACIÓN"]);
    resumenSheet.getRange(1, 1, 1, 8).setBackground("#18181B").setFontColor("#D4AF37").setFontWeight("bold");
  }
  
  if (state && state.stations && state.stations.length) {
    for (var i = 0; i < state.stations.length; i++) {
      var s = state.stations[i];
      var row = i + 2;
      resumenSheet.getRange(row, 1, 1, 8).setValues([[
        "Puesto #" + s.stationNumber,
        s.barberName,
        s.currentBalance,
        s.dailyRate,
        s.whatsapp,
        s.username,
        s.currentBalance > 0 ? "Pendiente" : "Al Día",
        Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd HH:mm:ss")
      ]]);
    }
  }
  
  // 2. Pestaña: Historial de Pagos
  var historialSheet = ss.getSheetByName("Historial_Pagos");
  if (!historialSheet) {
    historialSheet = ss.insertSheet("Historial_Pagos");
    historialSheet.appendRow(["FECHA/HORA", "PUESTO", "BARBERO", "TIPO", "VALOR (COP)", "MÉTODO", "ESTADO", "LINK FOTO DRIVE", "NOTAS"]);
    historialSheet.getRange(1, 1, 1, 9).setBackground("#18181B").setFontColor("#D4AF37").setFontWeight("bold");
  }
  
  // Si viene un pago o bauche, agregarlo a una nueva fila
  if (voucherInfo && voucherInfo.amount > 0) {
    historialSheet.appendRow([
      Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd HH:mm:ss"),
      "Puesto #" + voucherInfo.stationNumber,
      voucherInfo.barberName,
      voucherInfo.type,
      voucherInfo.amount,
      voucherInfo.method,
      voucherInfo.status,
      voucherInfo.driveUrl,
      voucherInfo.notes || ""
    ]);
  }
}
`;

export const GoogleAppsScriptModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[#18181B] border border-[#D4AF37]/40 shadow-2xl overflow-hidden my-6 cursor-default"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-[#09090B]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-cinzel text-base font-bold text-white">Sincronización con Google Sheets & Drive</h3>
              <p className="text-xs text-zinc-400">Código de Apps Script listo para copiar y pegar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs text-zinc-300 max-h-[75vh] overflow-y-auto">
          {/* Quick Explanation */}
          <div className="p-4 rounded-xl bg-[#09090B] border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-[#D4AF37] font-semibold text-sm">
              <HardDrive className="w-4 h-4" />
              <span>¿Cómo funciona la sincronización automática?</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              Google Apps Script crea automáticamente un archivo de <strong className="text-zinc-200">Google Sheets</strong> con los saldos de los 4 puestos y el historial de pagos, y una carpeta en <strong className="text-zinc-200">Google Drive</strong> donde almacena las fotos de los bauches subidos por los barberos.
            </p>
          </div>

          {/* Steps */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2 text-[#D4AF37]">
              Pasos para activar en 2 minutos:
            </h4>
            <ol className="space-y-2.5 text-zinc-300 pl-1">
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">1</span>
                <span>
                  Abre{' '}
                  <a
                    href="https://script.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#D4AF37] underline inline-flex items-center gap-1 font-medium hover:text-[#FFF3B0]"
                  >
                    Google Apps Script <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  con tu cuenta de Google y haz clic en <strong>"Nuevo proyecto"</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">2</span>
                <span>Borra todo el texto en el editor y pega el código que se encuentra abajo.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
                <span>
                  Haz clic en el botón azul <strong>"Implementar"</strong> &gt; <strong>"Nueva implementación"</strong> &gt; selecciona tipo <strong>"Aplicación web"</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">4</span>
                <span>
                  En <strong>"Quién tiene acceso"</strong> selecciona <strong className="text-white">"Cualquier persona" (Anyone)</strong> y pulsa Implementar.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">5</span>
                <span>Copia la URL de la aplicación web y pégala en el campo <strong>SCRIPT_URL</strong> de la Configuración.</span>
              </li>
            </ol>
          </div>

          {/* Code Viewer with Copy Button */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-zinc-400">Código Google Apps Script (Código.gs)</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg gold-badge-gradient text-[#D4AF37] text-xs font-semibold hover:bg-[#D4AF37]/20 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '¡Copiado al portapapeles!' : 'Copiar Código'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-[#09090B] border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-56 overflow-y-auto selection:bg-[#D4AF37] selection:text-black">
              <code>{APPS_SCRIPT_CODE}</code>
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-zinc-800 bg-[#09090B] gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#27272A] hover:bg-[#323238] text-white text-xs font-semibold tracking-wide transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a la App</span>
          </button>
        </div>
      </div>
    </div>
  );
};
