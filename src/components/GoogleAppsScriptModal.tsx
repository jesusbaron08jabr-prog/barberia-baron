import React, { useState } from 'react';
import { X, Copy, Check, FileSpreadsheet, HardDrive, ExternalLink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const APPS_SCRIPT_CODE = `/**
 * ==============================================================
 * BARBERÍA BARÓN - SINCRONIZACIÓN GOOGLE SHEETS & GOOGLE DRIVE
 * ==============================================================
 * 
 * INSTRUCCIONES DE INSTALACIÓN (3 minutos):
 * 1. Abre https://script.google.com en tu navegador con tu cuenta de Google.
 * 2. Haz clic en "Nuevo proyecto" y nómbralo "Barbería Barón Sync".
 * 3. Borra todo el código existente y pega este script completo.
 * 4. Haz clic en "Implementar" (botón azul arriba a la derecha) > "Nueva implementación".
 * 5. Haz clic en el ícono de engranaje (⚙️) junto a "Seleccionar tipo" y elige "Aplicación web".
 * 6. Configuración obligatoria:
 *    - Descripción: "Sync Barberia Baron"
 *    - Ejecutar como: "Yo" (tu cuenta de Google)
 *    - Quién tiene acceso: "Cualquier persona" (Anyone) -> ¡IMPORTANTE PARA QUE LA APP PUEDA ENVIAR DATOS!
 * 7. Haz clic en "Implementar", autoriza los permisos requeridos.
 * 8. Copia la "URL de la aplicación web" (termina en /exec) y pégala en la Configuración de Barbería Barón.
 */

function doGet(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var stateJson = props.getProperty("BARON_APP_STATE");
    
    var response = {
      status: "success",
      state: stateJson ? JSON.parse(stateJson) : null,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    
    // 1. Guardar estado completo para persistencia multi-dispositivo
    if (payload.state) {
      props.setProperty("BARON_APP_STATE", JSON.stringify(payload.state));
      syncToSpreadsheet(payload.state, payload.voucher);
    }
    
    // 2. Si se adjuntó un bauche en base64, guardarlo en Google Drive
    var driveFileUrl = "";
    if (payload.voucher && payload.voucher.voucherBase64) {
      driveFileUrl = saveVoucherToDrive(payload.voucher);
    }
    
    var response = {
      status: "success",
      message: "Sincronización completada con éxito en Google Sheets & Drive",
      driveFileUrl: driveFileUrl,
      timestamp: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSpreadsheet() {
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

function saveVoucherToDrive(voucher) {
  try {
    var folder = getOrCreateDriveFolder();
    var base64Data = voucher.voucherBase64;
    var contentType = "image/jpeg";
    
    if (base64Data.indexOf(";base64,") !== -1) {
      var parts = base64Data.split(";base64,");
      contentType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }
    
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, contentType, "Bauche_Puesto_" + voucher.stationNumber + "_" + voucher.barberName.replace(/\\s+/g, "_") + "_" + Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd_HH-mm") + ".jpg");
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    Logger.log("Error guardando en Drive: " + e.toString());
    return "";
  }
}

function syncToSpreadsheet(state, latestVoucher) {
  var ss = getOrCreateSpreadsheet();
  
  // Pestaña 1: Resumen de Puestos
  var resumenSheet = ss.getSheetByName("Resumen_Puestos");
  if (!resumenSheet) {
    resumenSheet = ss.insertSheet("Resumen_Puestos");
    resumenSheet.appendRow(["PUESTO", "BARBERO", "SALDO PENDIENTE (COP)", "TARIFA DIARIA", "TEL WHATSAPP", "USUARIO", "ESTADO"]);
    resumenSheet.getRange(1, 1, 1, 7).setBackground("#18181B").setFontColor("#D4AF37").setFontWeight("bold");
  }
  
  // Actualizar las 4 filas de puestos
  if (state.stations && state.stations.length) {
    for (var i = 0; i < state.stations.length; i++) {
      var s = state.stations[i];
      var row = i + 2;
      resumenSheet.getRange(row, 1, 1, 7).setValues([[
        "Puesto #" + s.stationNumber,
        s.barberName,
        s.currentBalance,
        s.dailyRate,
        s.whatsapp,
        s.username,
        s.currentBalance > 0 ? "Pendiente" : "Al Día"
      ]]);
    }
  }
  
  // Pestaña 2: Historial de Pagos
  var historialSheet = ss.getSheetByName("Historial_Pagos");
  if (!historialSheet) {
    historialSheet = ss.insertSheet("Historial_Pagos");
    historialSheet.appendRow(["FECHA/HORA", "PUESTO", "BARBERO", "TIPO", "VALOR PAGADO", "MÉTODO", "VERIFICACIÓN IA", "REF BANCARIA", "ESTADO"]);
    historialSheet.getRange(1, 1, 1, 9).setBackground("#18181B").setFontColor("#D4AF37").setFontWeight("bold");
  }
  
  // Si hay un voucher recién enviado, agregarlo
  if (latestVoucher) {
    var iaStatus = "Pendiente";
    var ref = "";
    if (latestVoucher.geminiResult) {
      iaStatus = latestVoucher.geminiResult.matchStatus === "verified" ? "Verificado por Gemini IA" : "Discrepancia detectada";
      ref = latestVoucher.geminiResult.referenceNumber || "";
    }
    
    historialSheet.appendRow([
      Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd HH:mm:ss"),
      "Puesto #" + latestVoucher.stationNumber,
      latestVoucher.barberName,
      latestVoucher.type || "Pago",
      latestVoucher.amount,
      latestVoucher.method,
      iaStatus,
      ref,
      "Aprobado"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-[#18181B] border border-[#D4AF37]/40 shadow-2xl overflow-hidden my-6">
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
            className="px-5 py-2 rounded-xl bg-[#27272A] hover:bg-[#323238] text-white text-xs font-semibold tracking-wide transition"
          >
            Cerrar Guía
          </button>
        </div>
      </div>
    </div>
  );
};
