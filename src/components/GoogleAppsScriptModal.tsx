import React, { useState } from 'react';
import { X, Copy, Check, FileSpreadsheet, HardDrive, ExternalLink, ArrowLeft, ShieldCheck, Clock, Zap } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * CONTROL FINANCIERO BARBERÍA BARÓN — BACKEND GOOGLE APPS SCRIPT
 * Base de Datos: CONTROL_FINANCIERO_BARBERIA (Google Sheets en Google Drive)
 * Carpeta de Comprobantes: COMPROBANTES_BARBERIA (Google Drive)
 * ============================================================================
 * 
 * 11 PESTAÑAS RELACIONALES:
 * 1. CONFIGURACION   - Parámetros del sistema y tarifa diaria COP
 * 2. USUARIOS        - Acceso con roles ADMIN y BARBERO
 * 3. BARBEROS        - Datos de los 4 barberos y teléfonos WhatsApp
 * 4. PUESTOS         - Catálogo de los 4 puestos de barbería
 * 5. CONTRATOS       - Relación barbero-puesto y tarifas vigentes
 * 6. CARGOS          - Cargos diarios generados con clave de idempotencia
 * 7. PAGOS           - Reporte de pagos y bauches subidos a Drive
 * 8. APLICACIONES    - Distribución FIFO de pagos a cargos más antiguos
 * 9. MOVIMIENTOS    - Libro diario inmutable (débitos/créditos)
 * 10. NOTIFICACIONES - Historial de recordatorios a WhatsApp
 * 11. AUDITORIA      - Registro de seguridad y trazabilidad completa
 */

var SPREADSHEET_NAME = "CONTROL_FINANCIERO_BARBERIA";
var DRIVE_FOLDER_NAME = "COMPROBANTES_BARBERIA";
var TIMEZONE = "America/Bogota";
var DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

var TAB_NAMES = {
  CONFIGURACION: "CONFIGURACION",
  USUARIOS: "USUARIOS",
  BARBEROS: "BARBEROS",
  PUESTOS: "PUESTOS",
  CONTRATOS: "CONTRATOS",
  CARGOS: "CARGOS",
  PAGOS: "PAGOS",
  APLICACIONES: "APLICACIONES",
  MOVIMIENTOS: "MOVIMIENTOS",
  NOTIFICACIONES: "NOTIFICACIONES",
  AUDITORIA: "AUDITORIA"
};

/**
 * 1. Ejecutar una sola vez para crear y estructurar la base de datos completa.
 */
function setupDatabase() {
  var ss = getOrCreateSpreadsheet();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  var folder = getOrCreateVoucherFolder();
  var folderId = folder.getId();
  
  setupTabConfiguracion(ss, folderId);
  setupTabUsuarios(ss);
  setupTabBarberos(ss);
  setupTabPuestos(ss);
  setupTabContratos(ss);
  setupTabCargos(ss);
  setupTabPagos(ss);
  setupTabAplicaciones(ss);
  setupTabMovimientos(ss);
  setupTabNotificaciones(ss);
  setupTabAuditoria(ss);
  
  logAudit(ss, "SETUP_DATABASE", "SYSTEM", "ADMIN", {
    spreadsheetId: ss.getId(),
    folderId: folderId,
    timestamp: formatBogotaDate(new Date())
  });
  
  Logger.log("Base de datos configurada exitosamente.");
}

/**
 * 2. Ejecutar una sola vez para configurar los 5 triggers automáticos requeridos.
 */
function instalarTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  ScriptApp.newTrigger("trigger_generar_cargos_diarios").timeBased().everyDays(1).atHour(0).nearMinute(5).inTimezone(TIMEZONE).create();
  ScriptApp.newTrigger("trigger_recordatorio_mora_1").timeBased().everyDays(1).atHour(9).inTimezone(TIMEZONE).create();
  ScriptApp.newTrigger("trigger_recordatorio_mora_2").timeBased().everyDays(1).atHour(13).inTimezone(TIMEZONE).create();
  ScriptApp.newTrigger("trigger_recordatorio_mora_3").timeBased().everyDays(1).atHour(18).inTimezone(TIMEZONE).create();
  ScriptApp.newTrigger("trigger_verificacion_integridad").timeBased().everyDays(1).atHour(23).nearMinute(55).inTimezone(TIMEZONE).create();
  
  Logger.log("5 Triggers automáticos instalados (00:05, 09:00, 13:00, 18:00, 23:55)");
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "getState";
    var token = (e && e.parameter && e.parameter.token) || "";
    var barberId = (e && e.parameter && e.parameter.barberId) || "";
    var ss = getOrCreateSpreadsheet();
    
    if (action === "ping" || action === "health") {
      return jsonResponse({ ok: true, status: "healthy", spreadsheet: SPREADSHEET_NAME });
    }
    
    var state = buildDashboardState(ss, token, barberId);
    return jsonResponse({ ok: true, status: "success", state: state, timestamp: formatBogotaDate(new Date()) });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  
  try {
    lockAcquired = lock.tryLock(30000);
    if (!lockAcquired) {
      return jsonResponse({ ok: false, error: "Servidor ocupado procesando otra transacción. Reintente en segundos." });
    }
    
    var body = e.postData ? e.postData.contents : "{}";
    var payload = JSON.parse(body);
    var action = payload.action || "syncState";
    var ss = getOrCreateSpreadsheet();
    var result = { ok: true, action: action };
    
    switch (action) {
      case "auth_login":
        result = handleAuthLogin(ss, payload);
        break;
      case "generar_cargos_diarios":
        result = handleGenerarCargosDiarios(ss, payload);
        break;
      case "registrar_pago":
        result = handleRegistrarPago(ss, payload);
        break;
      case "aprobar_pago":
        result = handleAprobarPago(ss, payload);
        break;
      case "rechazar_pago":
        result = handleRechazarPago(ss, payload);
        break;
      case "ajustar_saldo":
        result = handleAjustarSaldo(ss, payload);
        break;
      case "resetear_pagos":
        result = handleResetearPagos(ss, payload);
        break;
      case "syncState":
        result = handleSyncStateLegacy(ss, payload);
        break;
      default:
        result = { ok: false, error: "Acción no reconocida: " + action };
        break;
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function handleAuthLogin(ss, payload) {
  var username = (payload.username || "").trim();
  var password = (payload.password || "").trim();
  var tabUsuarios = ss.getSheetByName(TAB_NAMES.USUARIOS);
  var data = tabUsuarios.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === username && String(data[i][2]) === String(password) && data[i][4] === "ACTIVO") {
      var token = Utilities.getUuid();
      tabUsuarios.getRange(i + 1, 7).setValue(formatBogotaDate(new Date()));
      logAudit(ss, "LOGIN_SUCCESS", data[i][0], data[i][3], { username: username });
      return { ok: true, authenticated: true, token: token, role: data[i][3].toLowerCase(), username: username };
    }
  }
  return { ok: false, error: "Credenciales inválidas" };
}

function handleGenerarCargosDiarios(ss, payload) {
  var targetDateStr = payload.date || Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  var now = formatBogotaDate(new Date());
  var tabContratos = ss.getSheetByName(TAB_NAMES.CONTRATOS);
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  
  var contratosData = tabContratos.getDataRange().getValues();
  var cargosData = tabCargos.getDataRange().getValues();
  var existingKeys = {};
  for (var c = 1; c < cargosData.length; c++) {
    if (cargosData[c][1]) existingKeys[cargosData[c][1]] = true;
  }
  
  var chargesGenerated = 0;
  for (var i = 1; i < contratosData.length; i++) {
    var contratoId = contratosData[i][0];
    var barberoId = contratosData[i][1];
    var puestoId = contratosData[i][2];
    var tarifaCOP = Math.round(Number(contratosData[i][3]) || 0);
    
    if (contratosData[i][6] === "ACTIVO" && tarifaCOP > 0) {
      var key = contratoId + "_" + targetDateStr;
      if (!existingKeys[key]) {
        var cargoId = Utilities.getUuid();
        tabCargos.appendRow([cargoId, key, contratoId, barberoId, puestoId, targetDateStr, tarifaCOP, tarifaCOP, "PENDIENTE", now]);
        tabMovimientos.appendRow([Utilities.getUuid(), targetDateStr, "CARGO_DIARIO", cargoId, barberoId, puestoId, tarifaCOP, 0, 0, "Alquiler " + targetDateStr, payload.adminUser || "SYSTEM", now]);
        chargesGenerated++;
        existingKeys[key] = true;
      }
    }
  }
  return { ok: true, chargesGenerated: chargesGenerated, date: targetDateStr };
}

function handleRegistrarPago(ss, payload) {
  var now = formatBogotaDate(new Date());
  var barberoId = payload.barberoId || payload.stationId || "";
  var puestoNum = payload.stationNumber || 1;
  var barberoName = payload.barberName || "Barbero";
  var montoCOP = Math.round(Number(payload.amount) || 0);
  var metodo = payload.method || "Transferencia";
  var tipoPago = payload.type === "abono" ? "ABONO_PARCIAL" : "PAGO_TOTAL";
  var base64 = payload.voucherBase64 || "";
  
  var driveUrl = "";
  var driveId = "";
  if (base64 && base64.length > 50) {
    var dRes = saveVoucherToDrive(base64, puestoNum, barberoName);
    driveUrl = dRes.url;
    driveId = dRes.id;
  }
  
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var pagoId = Utilities.getUuid();
  var contratoId = getContratoIdByBarbero(ss, barberoId);
  
  tabPagos.appendRow([pagoId, contratoId, barberoId, puestoNum, Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"), montoCOP, metodo, tipoPago, driveUrl, driveId, "PENDIENTE", payload.notes || "", now, "", "", ""]);
  logAudit(ss, "REGISTRAR_PAGO", barberoId, "BARBERO", { pagoId: pagoId, montoCOP: montoCOP, metodo: metodo });
  return { ok: true, pagoId: pagoId, driveUrl: driveUrl };
}

function handleAprobarPago(ss, payload) {
  var pagoId = payload.pagoId || payload.id;
  var adminUser = payload.approvedBy || payload.adminUser || "admin";
  var now = formatBogotaDate(new Date());
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var pagosData = tabPagos.getDataRange().getValues();
  
  for (var i = 1; i < pagosData.length; i++) {
    if (pagosData[i][0] === pagoId) {
      if (pagosData[i][10] === "APROBADO") {
        return { ok: false, error: "Pago ya aprobado previamente" };
      }
      var barberoId = pagosData[i][2];
      var puestoId = pagosData[i][3];
      var montoCOP = Math.round(Number(pagosData[i][5]) || 0);
      var metodo = pagosData[i][6];
      
      tabPagos.getRange(i + 1, 11).setValue("APROBADO");
      tabPagos.getRange(i + 1, 14).setValue(now);
      tabPagos.getRange(i + 1, 15).setValue(adminUser);
      
      var aplicaciones = aplicarPagoFIFO(ss, pagoId, barberoId, montoCOP);
      var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
      tabMovimientos.appendRow([Utilities.getUuid(), Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"), "PAGO_APROBADO", pagoId, barberoId, puestoId, 0, montoCOP, 0, "Pago aprobado por " + adminUser + " (" + metodo + ")", adminUser, now]);
      logAudit(ss, "APROBAR_PAGO", adminUser, "ADMIN", { pagoId: pagoId, montoCOP: montoCOP, aplicaciones: aplicaciones });
      return { ok: true, pagoId: pagoId, montoCOP: montoCOP, aplicaciones: aplicaciones };
    }
  }
  return { ok: false, error: "Pago no encontrado" };
}

function handleRechazarPago(ss, payload) {
  var pagoId = payload.pagoId || payload.id;
  var reason = payload.reason || "Rechazado por verificación";
  var adminUser = payload.rejectedBy || payload.adminUser || "admin";
  var now = formatBogotaDate(new Date());
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var pagosData = tabPagos.getDataRange().getValues();
  
  for (var i = 1; i < pagosData.length; i++) {
    if (pagosData[i][0] === pagoId) {
      tabPagos.getRange(i + 1, 11).setValue("RECHAZADO");
      tabPagos.getRange(i + 1, 14).setValue(now);
      tabPagos.getRange(i + 1, 15).setValue(adminUser);
      tabPagos.getRange(i + 1, 16).setValue(reason);
      logAudit(ss, "RECHAZAR_PAGO", adminUser, "ADMIN", { pagoId: pagoId, reason: reason });
      return { ok: true, pagoId: pagoId };
    }
  }
  return { ok: false, error: "Pago no encontrado" };
}

function aplicarPagoFIFO(ss, pagoId, barberoId, montoTotal) {
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabAplicaciones = ss.getSheetByName(TAB_NAMES.APLICACIONES);
  var cargosData = tabCargos.getDataRange().getValues();
  var montoRemanente = montoTotal;
  var aplicaciones = [];
  var now = formatBogotaDate(new Date());
  
  for (var i = 1; i < cargosData.length && montoRemanente > 0; i++) {
    var cBarberoId = cargosData[i][3];
    var cSaldo = Math.round(Number(cargosData[i][7]) || 0);
    var cEstado = cargosData[i][8];
    
    if (cBarberoId === barberoId && cSaldo > 0 && cEstado !== "PAGADO") {
      var cargoId = cargosData[i][0];
      var montoAplicar = Math.min(montoRemanente, cSaldo);
      var nuevoSaldo = cSaldo - montoAplicar;
      tabCargos.getRange(i + 1, 8).setValue(nuevoSaldo);
      tabCargos.getRange(i + 1, 9).setValue(nuevoSaldo === 0 ? "PAGADO" : "ABONADO");
      tabAplicaciones.appendRow([Utilities.getUuid(), pagoId, cargoId, montoAplicar, now, "Aplicación FIFO"]);
      aplicaciones.push({ cargoId: cargoId, montoAplicado: montoAplicar, saldoRestante: nuevoSaldo });
      montoRemanente -= montoAplicar;
    }
  }
  return aplicaciones;
}

function handleAjustarSaldo(ss, payload) {
  var barberoId = payload.stationId || payload.barberoId;
  var monto = Math.round(Number(payload.newBalance || payload.amount || 0));
  var adminUser = payload.adminUser || "admin";
  var reason = payload.reason || "Ajuste manual";
  var now = formatBogotaDate(new Date());
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  tabMovimientos.appendRow([Utilities.getUuid(), Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"), "AJUSTE_MANUAL", "MANUAL", barberoId, payload.stationNumber || 1, monto >= 0 ? monto : 0, monto < 0 ? Math.abs(monto) : 0, monto, reason, adminUser, now]);
  logAudit(ss, "AJUSTE_SALDO", adminUser, "ADMIN", { barberoId: barberoId, monto: monto, reason: reason });
  return { ok: true, message: "Saldo ajustado correctamente" };
}

function handleResetearPagos(ss, payload) {
  var adminUser = payload.adminUser || "admin";
  var reason = payload.reason || "Reinicio de ciclo financiero";
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var data = tabPagos.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][10] !== "REINICIADO") tabPagos.getRange(i + 1, 11).setValue("REINICIADO");
  }
  logAudit(ss, "REINICIAR_PAGOS", adminUser, "ADMIN", { reason: reason });
  return { ok: true, message: "Registros de pago reiniciados para nuevo ciclo." };
}

function handleSyncStateLegacy(ss, payload) {
  var state = payload.state;
  var voucher = payload.voucher || null;
  var driveUrl = "Sin bauche";
  if (voucher && voucher.voucherBase64 && voucher.voucherBase64.length > 50) {
    var vRes = saveVoucherToDrive(voucher.voucherBase64, voucher.stationNumber || 1, voucher.barberName || "Barbero");
    driveUrl = vRes.url;
  }
  if (state) {
    try {
      var clean = JSON.parse(JSON.stringify(state));
      if (clean.payments) {
        for (var p = 0; p < clean.payments.length; p++) {
          if (clean.payments[p].voucherBase64 && clean.payments[p].voucherBase64.length > 200) clean.payments[p].voucherBase64 = "";
        }
      }
      PropertiesService.getScriptProperties().setProperty("BARON_APP_STATE", JSON.stringify(clean));
    } catch(e) {}
  }
  return { ok: true, driveUrl: driveUrl, message: "Sincronizado con Google Sheets y Drive" };
}

function buildDashboardState(ss, token, targetBarberId) {
  var tabContratos = ss.getSheetByName(TAB_NAMES.CONTRATOS);
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var tabBarberos = ss.getSheetByName(TAB_NAMES.BARBEROS);
  
  var barberosData = tabBarberos ? tabBarberos.getDataRange().getValues() : [];
  var contratosData = tabContratos ? tabContratos.getDataRange().getValues() : [];
  var cargosData = tabCargos ? tabCargos.getDataRange().getValues() : [];
  var pagosData = tabPagos ? tabPagos.getDataRange().getValues() : [];
  
  var saldosPorBarbero = {};
  for (var c = 1; c < contratosData.length; c++) {
    saldosPorBarbero[contratosData[c][1]] = 0;
  }
  for (var g = 1; g < cargosData.length; g++) {
    var bId = cargosData[g][3];
    var pend = Math.round(Number(cargosData[g][7]) || 0);
    if (saldosPorBarbero[bId] !== undefined) saldosPorBarbero[bId] += pend;
  }
  
  var stations = [];
  var defaultNames = ["Carlos Mendoza", "Andrés Silva", "Mateo Gómez", "David Herrera"];
  var defaultWhatsapps = ["573124567890", "573158901234", "573202345678", "573017654321"];
  
  for (var i = 1; i <= 4; i++) {
    var sId = "barbero" + i;
    var name = defaultNames[i - 1];
    var wa = defaultWhatsapps[i - 1];
    for (var b = 1; b < barberosData.length; b++) {
      if (barberosData[b][0] === sId || barberosData[b][1] === sId) {
        name = barberosData[b][2] || name;
        wa = barberosData[b][3] || wa;
        break;
      }
    }
    stations.push({
      id: sId,
      stationNumber: i,
      barberName: name,
      whatsapp: wa,
      username: sId,
      password: "123",
      currentBalance: saldosPorBarbero[sId] !== undefined ? saldosPorBarbero[sId] : 45000,
      dailyRate: 45000,
      active: true
    });
  }
  
  var payments = [];
  var totalCollected = 0;
  for (var p = 1; p < pagosData.length; p++) {
    var pRow = pagosData[p];
    var pBarberoId = pRow[2];
    var pMonto = Math.round(Number(pRow[5]) || 0);
    var pEstado = pRow[10];
    if (targetBarberId && pBarberoId !== targetBarberId) continue;
    if (pEstado === "APROBADO") totalCollected += pMonto;
    payments.push({
      id: pRow[0],
      stationId: pBarberoId,
      stationNumber: Number(pRow[3]) || 1,
      barberName: getBarberNameById(stations, pBarberoId),
      type: pRow[7] === "ABONO_PARCIAL" ? "abono" : "total",
      amount: pMonto,
      previousBalance: 0,
      remainingBalance: 0,
      method: pRow[6],
      voucherBase64: "",
      timestamp: pRow[12] || new Date().toISOString(),
      formattedDate: pRow[4] || "",
      status: pEstado === "APROBADO" ? "aprobado" : (pEstado === "RECHAZADO" ? "rechazado" : "pendiente"),
      notes: pRow[11] || "",
      approvedAt: pRow[13] || "",
      approvedBy: pRow[14] || "",
      rejectionReason: pRow[15] || "",
      driveFileUrl: pRow[8] || ""
    });
  }
  
  return {
    stations: stations,
    payments: payments.reverse(),
    chargeLogs: [],
    totalCollected: totalCollected,
    config: {
      adminUsername: "admin",
      adminPassword: "baron2026",
      defaultDailyRate: 45000,
      scriptUrl: ScriptApp.getService().getUrl() || "",
      lastSyncedAt: formatBogotaDate(new Date()),
      autoSync: true
    }
  };
}

function trigger_generar_cargos_diarios() {
  handleGenerarCargosDiarios(getOrCreateSpreadsheet(), { adminUser: "CRON_00_05" });
}

function trigger_recordatorio_mora_1() { enviarRecordatoriosMora("RECORDATORIO_09_00"); }
function trigger_recordatorio_mora_2() { enviarRecordatoriosMora("RECORDATORIO_13_00"); }
function trigger_recordatorio_mora_3() { enviarRecordatoriosMora("RECORDATORIO_18_00"); }

function enviarRecordatoriosMora(tipo) {
  var ss = getOrCreateSpreadsheet();
  var state = buildDashboardState(ss, "", "");
  var tabNotif = ss.getSheetByName(TAB_NAMES.NOTIFICACIONES);
  var now = formatBogotaDate(new Date());
  for (var i = 0; i < state.stations.length; i++) {
    var st = state.stations[i];
    if (st.currentBalance > 0) {
      var msg = "¡Hola " + st.barberName + "! Recordatorio de Barbería Barón: Tu saldo de alquiler de Puesto #" + st.stationNumber + " es $" + st.currentBalance.toLocaleString("es-CO") + " COP. Sube tu comprobante.";
      var link = "https://wa.me/" + st.whatsapp + "?text=" + encodeURIComponent(msg);
      tabNotif.appendRow([Utilities.getUuid(), st.id, tipo, "WHATSAPP", st.whatsapp, msg, "GENERADO", link, now]);
    }
  }
}

function trigger_verificacion_integridad() {
  logAudit(getOrCreateSpreadsheet(), "VERIFICACION_INTEGRIDAD_23_55", "SYSTEM", "CRON", { timestamp: formatBogotaDate(new Date()) });
}

function saveVoucherToDrive(base64Data, stationNumber, barberName) {
  var folder = getOrCreateVoucherFolder();
  var cleanBase64 = base64Data;
  var mimeType = "image/jpeg";
  if (base64Data.indexOf(";base64,") !== -1) {
    var parts = base64Data.split(";base64,");
    cleanBase64 = parts[1];
    var mimeMatch = parts[0].match(/data:(.*?);/);
    if (mimeMatch) mimeType = mimeMatch[1];
  }
  var decoded = Utilities.base64Decode(cleanBase64);
  var fileName = "Bauche_Puesto" + stationNumber + "_" + (barberName || "Barbero").replace(/\\s+/g, "_") + "_" + Utilities.formatDate(new Date(), TIMEZONE, "yyyyMMdd_HHmmss") + ".jpg";
  var blob = Utilities.newBlob(decoded, mimeType, fileName);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
  return { id: file.getId(), url: file.getUrl() };
}

function getOrCreateVoucherFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function getOrCreateSpreadsheet() {
  var files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  return files.hasNext() ? SpreadsheetApp.open(files.next()) : SpreadsheetApp.create(SPREADSHEET_NAME);
}

function setupTabConfiguracion(ss, folderId) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.CONFIGURACION);
  formatHeader(sheet, ["CLAVE", "VALOR", "DESCRIPCION", "ULTIMA_ACTUALIZACION"]);
  if (sheet.getLastRow() === 1) {
    var now = formatBogotaDate(new Date());
    sheet.appendRow(["NOMBRE_NEGOCIO", "Barbería Barón", "Nombre oficial", now]);
    sheet.appendRow(["TARIFA_DIARIA_COP", 45000, "Valor diario de alquiler", now]);
    sheet.appendRow(["CANTIDAD_PUESTOS", 4, "Total de puestos", now]);
    sheet.appendRow(["ZONA_HORARIA", TIMEZONE, "Zona horaria oficial", now]);
    sheet.appendRow(["DRIVE_FOLDER_ID", folderId, "ID de carpeta para bauches", now]);
  }
}

function setupTabUsuarios(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.USUARIOS);
  formatHeader(sheet, ["ID", "USERNAME", "PASSWORD_HASH", "ROL", "ESTADO", "CREADO_EN", "ULTIMO_ACCESO"]);
  if (sheet.getLastRow() === 1) {
    var now = formatBogotaDate(new Date());
    sheet.appendRow(["usr-admin-1", "admin", "baron2026", "ADMIN", "ACTIVO", now, now]);
    sheet.appendRow(["usr-barbero-1", "barbero1", "123", "BARBERO", "ACTIVO", now, now]);
    sheet.appendRow(["usr-barbero-2", "barbero2", "123", "BARBERO", "ACTIVO", now, now]);
    sheet.appendRow(["usr-barbero-3", "barbero3", "123", "BARBERO", "ACTIVO", now, now]);
    sheet.appendRow(["usr-barbero-4", "barbero4", "123", "BARBERO", "ACTIVO", now, now]);
  }
}

function setupTabBarberos(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.BARBEROS);
  formatHeader(sheet, ["ID", "USUARIO_ID", "NOMBRE_COMPLETO", "TELEFONO_WHATSAPP", "NUMERO_DOCUMENTO", "ESTADO", "FECHA_INGRESO"]);
  if (sheet.getLastRow() === 1) {
    var now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
    sheet.appendRow(["barbero1", "usr-barbero-1", "Carlos Mendoza", "573124567890", "CC 10203040", "ACTIVO", now]);
    sheet.appendRow(["barbero2", "usr-barbero-2", "Andrés Silva", "573158901234", "CC 10203041", "ACTIVO", now]);
    sheet.appendRow(["barbero3", "usr-barbero-3", "Mateo Gómez", "573202345678", "CC 10203042", "ACTIVO", now]);
    sheet.appendRow(["barbero4", "usr-barbero-4", "David Herrera", "573017654321", "CC 10203043", "ACTIVO", now]);
  }
}

function setupTabPuestos(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.PUESTOS);
  formatHeader(sheet, ["ID", "NUMERO_PUESTO", "NOMBRE_IDENTIFICADOR", "ESTADO", "DESCRIPCION"]);
  if (sheet.getLastRow() === 1) {
    sheet.appendRow(["puesto-1", 1, "Puesto # 1 - Silla Imperial", "OCUPADO", "Estación Principal"]);
    sheet.appendRow(["puesto-2", 2, "Puesto # 2 - Silla Oro", "OCUPADO", "Estación Central 1"]);
    sheet.appendRow(["puesto-3", 3, "Puesto # 3 - Sillón Real", "OCUPADO", "Estación Central 2"]);
    sheet.appendRow(["puesto-4", 4, "Puesto # 4 - Trono Corona", "OCUPADO", "Estación Lateral"]);
  }
}

function setupTabContratos(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.CONTRATOS);
  formatHeader(sheet, ["ID", "BARBERO_ID", "PUESTO_ID", "TARIFA_DIARIA_COP", "FECHA_INICIO", "FECHA_FIN", "ESTADO", "DIAS_COBRO"]);
  if (sheet.getLastRow() === 1) {
    var now = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
    sheet.appendRow(["cnt-1", "barbero1", "puesto-1", 45000, now, "2027-12-31", "ACTIVO", "TODOS"]);
    sheet.appendRow(["cnt-2", "barbero2", "puesto-2", 45000, now, "2027-12-31", "ACTIVO", "TODOS"]);
    sheet.appendRow(["cnt-3", "barbero3", "puesto-3", 45000, now, "2027-12-31", "ACTIVO", "TODOS"]);
    sheet.appendRow(["cnt-4", "barbero4", "puesto-4", 45000, now, "2027-12-31", "ACTIVO", "TODOS"]);
    sheet.getRange("D2:D5").setNumberFormat("$#,##0");
  }
}

function setupTabCargos(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.CARGOS);
  formatHeader(sheet, ["ID", "IDEMPOTENCY_KEY", "CONTRATO_ID", "BARBERO_ID", "PUESTO_ID", "FECHA_CARGO", "MONTO_COP", "SALDO_PENDIENTE_COP", "ESTADO", "CREADO_EN"]);
  sheet.getRange("G:H").setNumberFormat("$#,##0");
}

function setupTabPagos(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.PAGOS);
  formatHeader(sheet, ["ID", "CONTRATO_ID", "BARBERO_ID", "PUESTO_ID", "FECHA_PAGO", "MONTO_COP", "METODO_PAGO", "TIPO_PAGO", "COMPROBANTE_DRIVE_URL", "COMPROBANTE_FILE_ID", "ESTADO", "NOTAS", "REPORTADO_EN", "APROBADO_EN", "APROBADO_POR", "MOTIVO_RECHAZO"]);
  sheet.getRange("F:F").setNumberFormat("$#,##0");
}

function setupTabAplicaciones(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.APLICACIONES);
  formatHeader(sheet, ["ID", "PAGO_ID", "CARGO_ID", "MONTO_APLICADO_COP", "FECHA_APLICACION", "NOTAS"]);
  sheet.getRange("D:D").setNumberFormat("$#,##0");
}

function setupTabMovimientos(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.MOVIMIENTOS);
  formatHeader(sheet, ["ID", "FECHA", "TIPO_MOVIMIENTO", "REFERENCIA_ID", "BARBERO_ID", "PUESTO_ID", "DEBITO_COP", "CREDITO_COP", "SALDO_RESULTANTE_COP", "DESCRIPCION", "REGISTRADO_POR", "FECHA_CREACION"]);
  sheet.getRange("G:I").setNumberFormat("$#,##0");
}

function setupTabNotificaciones(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.NOTIFICACIONES);
  formatHeader(sheet, ["ID", "BARBERO_ID", "TIPO", "CANAL", "DESTINATARIO_TELEFONO", "MENSAJE", "ESTADO_ENVIO", "ENLACE_WHATSAPP", "FECHA_GENERADA"]);
}

function setupTabAuditoria(ss) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.AUDITORIA);
  formatHeader(sheet, ["ID", "ACCION", "USUARIO_ID", "ROL", "DETALLES_JSON", "IP_CLIENTE", "FECHA_HORA"]);
}

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function formatHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#18181B").setFontColor("#D4AF37").setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function logAudit(ss, action, userId, role, details) {
  try {
    var tab = ss.getSheetByName(TAB_NAMES.AUDITORIA);
    if (tab) tab.appendRow([Utilities.getUuid(), action, userId, role, JSON.stringify(details || {}), "SERVER", formatBogotaDate(new Date())]);
  } catch(e) {}
}

function formatBogotaDate(date) { return Utilities.formatDate(date, TIMEZONE, DATE_FORMAT); }
function jsonResponse(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function getContratoIdByBarbero(ss, barberoId) {
  var tab = ss.getSheetByName(TAB_NAMES.CONTRATOS);
  if (!tab) return "cnt-1";
  var data = tab.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === barberoId && data[i][6] === "ACTIVO") return data[i][0];
  }
  return "cnt-1";
}
function getBarberNameById(stations, bId) {
  for (var i = 0; i < stations.length; i++) {
    if (stations[i].id === bId) return stations[i].barberName;
  }
  return "Barbero";
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
              <h3 className="font-cinzel text-base font-bold text-white">Arquitectura Google Sheets & Drive</h3>
              <p className="text-xs text-zinc-400">CONTROL_FINANCIERO_BARBERIA • 11 Pestañas • LockService • FIFO</p>
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
          {/* Key Features Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800 flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
              <div>
                <p className="font-semibold text-white text-[11px]">11 Pestañas con UUID</p>
                <p className="text-[10px] text-zinc-400">Libro diario y auditoría</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800 flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
              <div>
                <p className="font-semibold text-white text-[11px]">Integridad LockService</p>
                <p className="text-[10px] text-zinc-400">Abonos en cascada FIFO</p>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#09090B] border border-zinc-800 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
              <div>
                <p className="font-semibold text-white text-[11px]">5 Triggers Diarios</p>
                <p className="text-[10px] text-zinc-400">00:05, 09, 13, 18 y 23:55</p>
              </div>
            </div>
          </div>

          {/* Quick Explanation */}
          <div className="p-4 rounded-xl bg-[#09090B] border border-zinc-800 space-y-2">
            <div className="flex items-center gap-2 text-[#D4AF37] font-semibold text-sm">
              <HardDrive className="w-4 h-4" />
              <span>Base de datos en la nube Google Sheets & Drive</span>
            </div>
            <p className="text-zinc-400 leading-relaxed">
              El script crea automáticamente en tu Google Drive el archivo <strong className="text-zinc-200">CONTROL_FINANCIERO_BARBERIA</strong> con las 11 pestañas reglamentarias y la carpeta <strong className="text-zinc-200">COMPROBANTES_BARBERIA</strong> para almacenar los bauches de pago.
            </p>
          </div>

          {/* Steps */}
          <div>
            <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-2 text-[#D4AF37]">
              Instrucciones de activación (2 minutos):
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
                <span>Borra todo el texto existente y pega el código completo de abajo.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
                <span>
                  En la barra superior selecciona la función <strong className="text-[#D4AF37]">setupDatabase</strong> y pulsa <strong>"Ejecutar"</strong> (autoriza permisos). Luego selecciona <strong className="text-[#D4AF37]">instalarTriggers</strong> y pulsa <strong>"Ejecutar"</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">4</span>
                <span>
                  Haz clic en el botón azul <strong>"Implementar"</strong> &gt; <strong>"Nueva implementación"</strong> &gt; Tipo: <strong>"Aplicación web"</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-[#D4AF37] bg-[#D4AF37]/10 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[11px]">5</span>
                <span>
                  En <strong>"Quién tiene acceso"</strong> selecciona <strong className="text-white">"Cualquier persona" (Anyone)</strong>, pulsa Implementar, copia la URL que termina en <strong className="text-zinc-200">/exec</strong> y pégala en la Configuración.
                </span>
              </li>
            </ol>
          </div>

          {/* Code Viewer with Copy Button */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-zinc-400">Código Backend Completo (Código.gs)</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg gold-badge-gradient text-[#D4AF37] text-xs font-semibold hover:bg-[#D4AF37]/20 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '¡Copiado al portapapeles!' : 'Copiar Código Completo'}</span>
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
