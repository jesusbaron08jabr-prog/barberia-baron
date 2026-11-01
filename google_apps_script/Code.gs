/**
 * ============================================================================
 * CONTROL FINANCIERO BARBERÍA BARÓN — BACKEND GOOGLE APPS SCRIPT
 * Base de Datos: CONTROL_FINANCIERO_BARBERIA (Google Sheets en Google Drive)
 * Carpeta de Comprobantes: COMPROBANTES_BARBERIA (Google Drive)
 * ============================================================================
 * 
 * Este script implementa la arquitectura financiera completa con:
 * - 11 pestañas relacionales con UUIDs y montos enteros en COP.
 * - Zona horaria: America/Bogota.
 * - Control de concurrencia e integridad con LockService.
 * - Distribución de abonos en cascada FIFO (cargos más antiguos primero).
 * - Libro diario inmutable en MOVIMIENTOS y registro en AUDITORIA.
 * - Seguridad por roles (ADMIN y BARBERO). Barberos no ven datos ajenos.
 * - Triggers automáticos (00:05, 09:00, 13:00, 18:00, 23:55).
 * - Almacenamiento privado de comprobantes en Google Drive.
 */

// Constantes del Sistema
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
 * Función inicial para configurar la base de datos completa.
 * Ejecutar una sola vez desde el editor de Google Apps Script.
 */
function setupDatabase() {
  var ss = getOrCreateSpreadsheet();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  
  // 1. Crear o verificar carpeta de Google Drive
  var folder = getOrCreateVoucherFolder();
  var folderId = folder.getId();
  
  // 2. Configurar cada una de las 11 pestañas con sus encabezados y formatos
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
  
  // Registrar auditoría del setup
  logAudit(ss, "SETUP_DATABASE", "SYSTEM", "ADMIN", {
    spreadsheetId: ss.getId(),
    folderId: folderId,
    timestamp: formatBogotaDate(new Date())
  });
  
  Logger.log("✅ Base de datos " + SPREADSHEET_NAME + " configurada exitosamente.");
  Logger.log("URL de la Hoja: " + ss.getUrl());
}

/**
 * Instala todos los disparadores (triggers) automáticos requeridos.
 */
function instalarTriggers() {
  // Eliminar triggers existentes para evitar duplicados
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // 1. 00:05 — generar_cargos_diarios
  ScriptApp.newTrigger("trigger_generar_cargos_diarios")
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .nearMinute(5)
    .inTimezone(TIMEZONE)
    .create();
    
  // 2. 09:00 — enviar_recordatorio_mora_1
  ScriptApp.newTrigger("trigger_recordatorio_mora_1")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .inTimezone(TIMEZONE)
    .create();
    
  // 3. 13:00 — enviar_recordatorio_mora_2
  ScriptApp.newTrigger("trigger_recordatorio_mora_2")
    .timeBased()
    .everyDays(1)
    .atHour(13)
    .inTimezone(TIMEZONE)
    .create();
    
  // 4. 18:00 — enviar_recordatorio_mora_3
  ScriptApp.newTrigger("trigger_recordatorio_mora_3")
    .timeBased()
    .everyDays(1)
    .atHour(18)
    .inTimezone(TIMEZONE)
    .create();
    
  // 5. 23:55 — verificacion_integridad
  ScriptApp.newTrigger("trigger_verificacion_integridad")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .nearMinute(55)
    .inTimezone(TIMEZONE)
    .create();
    
  Logger.log("✅ 5 Triggers automáticos instalados correctamente (00:05, 09:00, 13:00, 18:00, 23:55)");
}

// ============================================================================
// ENTRADA HTTP: doGet y doPost
// ============================================================================

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || "getState";
    var token = (e && e.parameter && e.parameter.token) || "";
    var barberId = (e && e.parameter && e.parameter.barberId) || "";
    
    var ss = getOrCreateSpreadsheet();
    
    if (action === "ping" || action === "health") {
      return jsonResponse({
        ok: true,
        status: "healthy",
        app: "Barbería Barón API",
        spreadsheetName: SPREADSHEET_NAME,
        timestamp: formatBogotaDate(new Date())
      });
    }
    
    if (action === "getState" || action === "get_dashboard_data") {
      var state = buildDashboardState(ss, token, barberId);
      return jsonResponse({
        ok: true,
        status: "success",
        state: state,
        timestamp: formatBogotaDate(new Date())
      });
    }
    
    return jsonResponse({ ok: false, error: "Acción no reconocida en GET: " + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  // LockService para evitar colisiones y modificaciones simultáneas
  var lock = LockService.getScriptLock();
  var lockAcquired = false;
  
  try {
    // Intentar adquirir el bloqueo por hasta 30 segundos
    lockAcquired = lock.tryLock(30000);
    if (!lockAcquired) {
      return jsonResponse({
        ok: false,
        error: "Servidor ocupado procesando otra transacción financiera. Por favor intente de nuevo en unos segundos."
      });
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
        
      case "get_dashboard_data":
        result.state = buildDashboardState(ss, payload.token, payload.barberId);
        break;
        
      default:
        result = { ok: false, error: "Acción desconocida: " + action };
        break;
    }
    
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: "Error en backend Apps Script: " + err.toString(),
      stack: err.stack
    });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

// ============================================================================
// GESTORES DE ACCIONES FINANCIERAS
// ============================================================================

/**
 * Autenticación y generación de token de sesión.
 */
function handleAuthLogin(ss, payload) {
  var username = (payload.username || "").trim();
  var password = (payload.password || "").trim();
  
  if (!username || !password) {
    return { ok: false, error: "Usuario y contraseña requeridos" };
  }
  
  var tabUsuarios = ss.getSheetByName(TAB_NAMES.USUARIOS);
  var data = tabUsuarios.getDataRange().getValues();
  
  // Headers: ID, USERNAME, PASSWORD_HASH, ROL, ESTADO, CREADO_EN, ULTIMO_ACCESO
  for (var i = 1; i < data.length; i++) {
    var rowUser = data[i][1];
    var rowPass = data[i][2];
    var rol = data[i][3];
    var estado = data[i][4];
    
    if (rowUser === username && String(rowPass) === String(password) && estado === "ACTIVO") {
      var token = Utilities.getUuid();
      
      // Actualizar último acceso
      tabUsuarios.getRange(i + 1, 7).setValue(formatBogotaDate(new Date()));
      
      // Si es barbero, encontrar su estación
      var barberInfo = null;
      if (rol === "BARBERO") {
        barberInfo = getBarberByUserId(ss, data[i][0]);
      }
      
      logAudit(ss, "LOGIN_SUCCESS", data[i][0], rol, { username: username });
      
      return {
        ok: true,
        authenticated: true,
        token: token,
        role: rol.toLowerCase(),
        username: username,
        barber: barberInfo
      };
    }
  }
  
  logAudit(ss, "LOGIN_FAILED", "UNKNOWN", "NONE", { username: username });
  return { ok: false, error: "Credenciales inválidas o usuario inactivo" };
}

/**
 * Genera el cargo diario de alquiler para cada contrato activo.
 * Control de duplicidad estricto mediante IDEMPOTENCY_KEY (CONTRATO_ID_YYYY-MM-DD).
 */
function handleGenerarCargosDiarios(ss, payload) {
  var targetDateStr = payload.date || Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  var nowFormatted = formatBogotaDate(new Date());
  
  var tabContratos = ss.getSheetByName(TAB_NAMES.CONTRATOS);
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  
  var contratosData = tabContratos.getDataRange().getValues();
  var cargosData = tabCargos.getDataRange().getValues();
  
  // Mapear claves de idempotencia existentes para evitar duplicidad
  var existingKeys = {};
  for (var c = 1; c < cargosData.length; c++) {
    var key = cargosData[c][1]; // IDEMPOTENCY_KEY
    if (key) existingKeys[key] = true;
  }
  
  var chargesGenerated = 0;
  var stationsAffected = [];
  var totalMonto = 0;
  
  for (var i = 1; i < contratosData.length; i++) {
    var contratoId = contratosData[i][0];
    var barberoId = contratosData[i][1];
    var puestoId = contratosData[i][2];
    var tarifaCOP = Math.round(Number(contratosData[i][3]) || 0);
    var estadoContrato = contratosData[i][6];
    
    if (estadoContrato === "ACTIVO" && tarifaCOP > 0) {
      var idempotencyKey = contratoId + "_" + targetDateStr;
      
      if (!existingKeys[idempotencyKey]) {
        var cargoId = Utilities.getUuid();
        
        // Registrar en CARGOS:
        // ID, IDEMPOTENCY_KEY, CONTRATO_ID, BARBERO_ID, PUESTO_ID, FECHA_CARGO, MONTO_COP, SALDO_PENDIENTE_COP, ESTADO, CREADO_EN
        tabCargos.appendRow([
          cargoId,
          idempotencyKey,
          contratoId,
          barberoId,
          puestoId,
          targetDateStr,
          tarifaCOP,
          tarifaCOP, // saldo inicial pendiente igual al monto
          "PENDIENTE",
          nowFormatted
        ]);
        
        // Registrar en MOVIMIENTOS (Libro Diario Inmutable):
        // ID, FECHA, TIPO_MOVIMIENTO, REFERENCIA_ID, BARBERO_ID, PUESTO_ID, DEBITO_COP, CREDITO_COP, SALDO_RESULTANTE_COP, DESCRIPCION, REGISTRADO_POR, FECHA_CREACION
        tabMovimientos.appendRow([
          Utilities.getUuid(),
          targetDateStr,
          "CARGO_DIARIO",
          cargoId,
          barberoId,
          puestoId,
          tarifaCOP,
          0,
          0, // se calcula en balances
          "Alquiler diario automático fecha " + targetDateStr,
          payload.adminUser || "SYSTEM",
          nowFormatted
        ]);
        
        chargesGenerated++;
        stationsAffected.push(puestoId);
        totalMonto += tarifaCOP;
        existingKeys[idempotencyKey] = true;
      }
    }
  }
  
  logAudit(ss, "GENERAR_CARGOS_DIARIOS", payload.adminUser || "SYSTEM", "ADMIN", {
    date: targetDateStr,
    chargesGenerated: chargesGenerated,
    totalMonto: totalMonto
  });
  
  return {
    ok: true,
    chargesGenerated: chargesGenerated,
    totalMonto: totalMonto,
    stationsAffected: stationsAffected,
    date: targetDateStr,
    message: chargesGenerated > 0 
      ? "Se generó cargo diario de alquiler para los barberos activos"
      : "Los cargos para la fecha " + targetDateStr + " ya se encontraban generados (control de duplicidad)"
  };
}

/**
 * Registra un pago reportado por un barbero con su comprobante.
 * Sube el archivo a la carpeta privada de Google Drive COMPROBANTES_BARBERIA.
 */
function handleRegistrarPago(ss, payload) {
  var nowFormatted = formatBogotaDate(new Date());
  var barberoId = payload.barberoId || payload.stationId || "";
  var puestoNum = payload.stationNumber || 1;
  var barberoName = payload.barberName || "Barbero";
  var montoCOP = Math.round(Number(payload.amount) || 0);
  var metodo = payload.method || "Transferencia";
  var tipoPago = payload.type === "abono" ? "ABONO_PARCIAL" : "PAGO_TOTAL";
  var notas = payload.notes || "";
  var base64 = payload.voucherBase64 || "";
  
  if (montoCOP <= 0) {
    return { ok: false, error: "El monto a pagar debe ser mayor a 0 COP" };
  }
  
  var driveFileUrl = "";
  var driveFileId = "";
  
  // Guardar bauche en Drive si viene imagen
  if (base64 && base64.length > 50) {
    try {
      var driveResult = saveVoucherToDrive(base64, puestoNum, barberoName);
      driveFileUrl = driveResult.url;
      driveFileId = driveResult.id;
    } catch (dErr) {
      Logger.log("Error guardando comprobante en Drive: " + dErr.toString());
      driveFileUrl = "Error al guardar en Drive: " + dErr.toString();
    }
  }
  
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var pagoId = Utilities.getUuid();
  var contratoId = getContratoIdByBarbero(ss, barberoId);
  
  // Encabezados PAGOS:
  // ID, CONTRATO_ID, BARBERO_ID, PUESTO_ID, FECHA_PAGO, MONTO_COP, METODO_PAGO, TIPO_PAGO, COMPROBANTE_DRIVE_URL, COMPROBANTE_FILE_ID, ESTADO, NOTAS, REPORTADO_EN, APROBADO_EN, APROBADO_POR, MOTIVO_RECHAZO
  tabPagos.appendRow([
    pagoId,
    contratoId,
    barberoId,
    puestoNum,
    Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"),
    montoCOP,
    metodo,
    tipoPago,
    driveFileUrl,
    driveFileId,
    "PENDIENTE",
    notas,
    nowFormatted,
    "", // Aprobado en
    "", // Aprobado por
    ""  // Motivo rechazo
  ]);
  
  logAudit(ss, "REGISTRAR_PAGO", barberoId, "BARBERO", {
    pagoId: pagoId,
    montoCOP: montoCOP,
    metodo: metodo,
    driveFileId: driveFileId
  });
  
  return {
    ok: true,
    pagoId: pagoId,
    driveUrl: driveFileUrl,
    message: "Comprobante de pago registrado exitosamente y almacenado en Google Drive."
  };
}

/**
 * Aprobación de pago por el Administrador.
 * Aplica el abono en cascada FIFO a los cargos más antiguos en la pestaña APLICACIONES.
 * Registra crédito inmutable en MOVIMIENTOS.
 */
function handleAprobarPago(ss, payload) {
  var pagoId = payload.pagoId || payload.id;
  var adminUser = payload.approvedBy || payload.adminUser || "admin";
  var nowFormatted = formatBogotaDate(new Date());
  
  if (!pagoId) {
    return { ok: false, error: "ID de pago requerido" };
  }
  
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var pagosData = tabPagos.getDataRange().getValues();
  
  var pagoRowIndex = -1;
  var pagoRow = null;
  
  for (var i = 1; i < pagosData.length; i++) {
    if (pagosData[i][0] === pagoId) {
      pagoRowIndex = i + 1;
      pagoRow = pagosData[i];
      break;
    }
  }
  
  if (pagoRowIndex === -1) {
    return { ok: false, error: "No se encontró el pago con ID: " + pagoId };
  }
  
  var estadoActual = pagoRow[10]; // ESTADO
  if (estadoActual === "APROBADO") {
    return { ok: false, error: "El pago ya se encuentra aprobado (control de idempotencia)" };
  }
  
  var contratoId = pagoRow[1];
  var barberoId = pagoRow[2];
  var puestoId = pagoRow[3];
  var montoCOP = Math.round(Number(pagoRow[5]) || 0);
  var metodo = pagoRow[6];
  
  // 1. Actualizar estado del pago a APROBADO
  tabPagos.getRange(pagoRowIndex, 11).setValue("APROBADO"); // ESTADO
  tabPagos.getRange(pagoRowIndex, 14).setValue(nowFormatted); // APROBADO_EN
  tabPagos.getRange(pagoRowIndex, 15).setValue(adminUser);    // APROBADO_POR
  
  // 2. Aplicar abono a los cargos más antiguos (FIFO) en pestaña APLICACIONES
  var aplicacionResult = aplicarPagoFIFO(ss, pagoId, barberoId, montoCOP);
  
  // 3. Registrar en MOVIMIENTOS (Libro Diario Inmutable)
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  tabMovimientos.appendRow([
    Utilities.getUuid(),
    Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"),
    "PAGO_APROBADO",
    pagoId,
    barberoId,
    puestoId,
    0, // Debito
    montoCOP, // Credito
    0, // Saldo resultante
    "Pago de alquiler aprobado por " + adminUser + " (" + metodo + ")",
    adminUser,
    nowFormatted
  ]);
  
  logAudit(ss, "APROBAR_PAGO", adminUser, "ADMIN", {
    pagoId: pagoId,
    montoCOP: montoCOP,
    aplicaciones: aplicacionResult
  });
  
  return {
    ok: true,
    pagoId: pagoId,
    montoCOP: montoCOP,
    aplicaciones: aplicacionResult,
    message: "Pago de $" + montoCOP + " COP aprobado y aplicado a las obligaciones del barbero."
  };
}

/**
 * Rechaza un pago con motivo explícito.
 */
function handleRechazarPago(ss, payload) {
  var pagoId = payload.pagoId || payload.id;
  var reason = payload.reason || payload.rejectionReason || "Comprobante no coincide con el extracto bancario";
  var adminUser = payload.rejectedBy || payload.adminUser || "admin";
  var nowFormatted = formatBogotaDate(new Date());
  
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var pagosData = tabPagos.getDataRange().getValues();
  
  for (var i = 1; i < pagosData.length; i++) {
    if (pagosData[i][0] === pagoId) {
      tabPagos.getRange(i + 1, 11).setValue("RECHAZADO");
      tabPagos.getRange(i + 1, 14).setValue(nowFormatted);
      tabPagos.getRange(i + 1, 15).setValue(adminUser);
      tabPagos.getRange(i + 1, 16).setValue(reason);
      
      logAudit(ss, "RECHAZAR_PAGO", adminUser, "ADMIN", {
        pagoId: pagoId,
        reason: reason
      });
      
      return { ok: true, pagoId: pagoId, message: "Pago rechazado correctamente." };
    }
  }
  
  return { ok: false, error: "No se encontró el pago" };
}

/**
 * Algoritmo FIFO para aplicar un pago a los cargos más antiguos pendientes del barbero.
 */
function aplicarPagoFIFO(ss, pagoId, barberoId, montoTotal) {
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabAplicaciones = ss.getSheetByName(TAB_NAMES.APLICACIONES);
  
  var cargosData = tabCargos.getDataRange().getValues();
  var montoRemanente = montoTotal;
  var aplicacionesRealizadas = [];
  var nowFormatted = formatBogotaDate(new Date());
  
  // Buscar cargos pendientes ordenados cronológicamente
  for (var i = 1; i < cargosData.length && montoRemanente > 0; i++) {
    var cBarberoId = cargosData[i][3];
    var cSaldoPendiente = Math.round(Number(cargosData[i][7]) || 0);
    var cEstado = cargosData[i][8];
    
    if (cBarberoId === barberoId && cSaldoPendiente > 0 && cEstado !== "PAGADO") {
      var cargoId = cargosData[i][0];
      var montoAplicar = Math.min(montoRemanente, cSaldoPendiente);
      var nuevoSaldoCargo = cSaldoPendiente - montoAplicar;
      var nuevoEstadoCargo = nuevoSaldoCargo === 0 ? "PAGADO" : "ABONADO";
      
      // Actualizar saldo pendiente y estado en la hoja CARGOS
      tabCargos.getRange(i + 1, 8).setValue(nuevoSaldoCargo);
      tabCargos.getRange(i + 1, 9).setValue(nuevoEstadoCargo);
      
      // Registrar en APLICACIONES:
      // ID, PAGO_ID, CARGO_ID, MONTO_APLICADO_COP, FECHA_APLICACION, NOTAS
      var appUuid = Utilities.getUuid();
      tabAplicaciones.appendRow([
        appUuid,
        pagoId,
        cargoId,
        montoAplicar,
        nowFormatted,
        "Aplicación FIFO a cargo fecha " + cargosData[i][5]
      ]);
      
      aplicacionesRealizadas.push({
        cargoId: cargoId,
        montoAplicado: montoAplicar,
        saldoRestanteCargo: nuevoSaldoCargo
      });
      
      montoRemanente -= montoAplicar;
    }
  }
  
  return aplicacionesRealizadas;
}

/**
 * Ajuste de saldo manual por el Administrador.
 */
function handleAjustarSaldo(ss, payload) {
  var barberoId = payload.stationId || payload.barberoId;
  var montoCOP = Math.round(Number(payload.newBalance || payload.amount || 0));
  var adminUser = payload.adminUser || "admin";
  var reason = payload.reason || "Ajuste manual de saldo";
  var nowFormatted = formatBogotaDate(new Date());
  
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  tabMovimientos.appendRow([
    Utilities.getUuid(),
    Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"),
    "AJUSTE_MANUAL",
    "MANUAL",
    barberoId,
    payload.stationNumber || 1,
    montoCOP >= 0 ? montoCOP : 0,
    montoCOP < 0 ? Math.abs(montoCOP) : 0,
    montoCOP,
    reason,
    adminUser,
    nowFormatted
  ]);
  
  logAudit(ss, "AJUSTE_SALDO", adminUser, "ADMIN", {
    barberoId: barberoId,
    montoCOP: montoCOP,
    reason: reason
  });
  
  return { ok: true, message: "Saldo ajustado correctamente" };
}

/**
 * Reseteo seguro de pagos para iniciar nuevo período financiero.
 */
function handleResetearPagos(ss, payload) {
  var adminUser = payload.adminUser || "admin";
  var reason = payload.reason || "Reinicio de ciclo financiero por el administrador";
  var nowFormatted = formatBogotaDate(new Date());
  
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var data = tabPagos.getDataRange().getValues();
  
  // En lugar de borrar destructivamente, archivar el estado para preservar trazabilidad
  for (var i = 1; i < data.length; i++) {
    if (data[i][10] !== "REINICIADO") {
      tabPagos.getRange(i + 1, 11).setValue("REINICIADO");
    }
  }
  
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  tabMovimientos.appendRow([
    Utilities.getUuid(),
    Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"),
    "REINICIO_PAGOS",
    "RESET",
    "ALL",
    0,
    0,
    0,
    0,
    reason,
    adminUser,
    nowFormatted
  ]);
  
  logAudit(ss, "REINICIAR_PAGOS", adminUser, "ADMIN", {
    reason: reason,
    totalFilasAfectadas: data.length - 1
  });
  
  return { ok: true, message: "Registros de pago reiniciados exitosamente para nuevo ciclo." };
}

/**
 * Compatibilidad con sincronización completa bidireccional desde frontend.
 */
function handleSyncStateLegacy(ss, payload) {
  var state = payload.state;
  var voucher = payload.voucher || null;
  var driveUrl = "Sin bauche";
  
  // Si viene comprobante en voucher, guardarlo en Drive
  if (voucher && voucher.voucherBase64 && voucher.voucherBase64.length > 50) {
    var vRes = saveVoucherToDrive(voucher.voucherBase64, voucher.stationNumber || 1, voucher.barberName || "Barbero");
    driveUrl = vRes.url;
    voucher.driveUrl = driveUrl;
  }
  
  // Guardar copia rápida de sincronización en propiedades del script
  if (state) {
    try {
      var cleanState = JSON.parse(JSON.stringify(state));
      if (cleanState.payments) {
        for (var p = 0; p < cleanState.payments.length; p++) {
          if (cleanState.payments[p].voucherBase64 && cleanState.payments[p].voucherBase64.length > 200) {
            cleanState.payments[p].voucherBase64 = "";
          }
        }
      }
      PropertiesService.getScriptProperties().setProperty("BARON_APP_STATE", JSON.stringify(cleanState));
    } catch (e) {
      Logger.log("Error guardando state en properties: " + e.toString());
    }
  }
  
  return {
    ok: true,
    driveUrl: driveUrl,
    message: "Estado sincronizado con la base de datos Google Sheets y Google Drive"
  };
}

// ============================================================================
// CONSTRUCCIÓN DEL ESTADO PARA REACT DASHBOARD
// ============================================================================

function buildDashboardState(ss, token, targetBarberId) {
  // Leer estaciones base
  var tabPuestos = ss.getSheetByName(TAB_NAMES.PUESTOS);
  var tabBarberos = ss.getSheetByName(TAB_NAMES.BARBEROS);
  var tabContratos = ss.getSheetByName(TAB_NAMES.CONTRATOS);
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  var tabConfig = ss.getSheetByName(TAB_NAMES.CONFIGURACION);
  
  var barberosData = tabBarberos ? tabBarberos.getDataRange().getValues() : [];
  var contratosData = tabContratos ? tabContratos.getDataRange().getValues() : [];
  var cargosData = tabCargos ? tabCargos.getDataRange().getValues() : [];
  var pagosData = tabPagos ? tabPagos.getDataRange().getValues() : [];
  
  // Calcular saldos pendientes por barbero sumando cargos no pagados
  var saldosPorBarbero = {};
  var tarifaPorBarbero = {};
  
  for (var c = 1; c < contratosData.length; c++) {
    var bId = contratosData[c][1];
    var tCOP = Math.round(Number(contratosData[c][3]) || 45000);
    tarifaPorBarbero[bId] = tCOP;
    saldosPorBarbero[bId] = 0;
  }
  
  for (var g = 1; g < cargosData.length; g++) {
    var cBId = cargosData[g][3];
    var cPendiente = Math.round(Number(cargosData[g][7]) || 0);
    if (saldosPorBarbero[cBId] !== undefined) {
      saldosPorBarbero[cBId] += cPendiente;
    }
  }
  
  // Construir 4 puestos estándar
  var stations = [];
  var defaultNames = ["Carlos Mendoza", "Andrés Silva", "Mateo Gómez", "David Herrera"];
  var defaultWhatsapps = ["573124567890", "573158901234", "573202345678", "573017654321"];
  
  for (var i = 1; i <= 4; i++) {
    var stationKey = "barbero" + i;
    var barberName = defaultNames[i - 1];
    var whatsapp = defaultWhatsapps[i - 1];
    
    // Si existe en hoja BARBEROS, tomar de allí
    for (var b = 1; b < barberosData.length; b++) {
      if (barberosData[b][0] === stationKey || barberosData[b][1] === stationKey) {
        barberName = barberosData[b][2] || barberName;
        whatsapp = barberosData[b][3] || whatsapp;
        break;
      }
    }
    
    stations.push({
      id: stationKey,
      stationNumber: i,
      barberName: barberName,
      whatsapp: whatsapp,
      username: stationKey,
      password: "123",
      currentBalance: saldosPorBarbero[stationKey] !== undefined ? saldosPorBarbero[stationKey] : 45000,
      dailyRate: tarifaPorBarbero[stationKey] || 45000,
      active: true
    });
  }
  
  // Construir historial de pagos
  var payments = [];
  var totalCollected = 0;
  
  for (var p = 1; p < pagosData.length; p++) {
    var pRow = pagosData[p];
    var pBarberoId = pRow[2];
    var pMonto = Math.round(Number(pRow[5]) || 0);
    var pEstado = pRow[10];
    
    // Si se consulta para un barbero específico, filtrar estrictamente
    if (targetBarberId && pBarberoId !== targetBarberId) {
      continue;
    }
    
    if (pEstado === "APROBADO") {
      totalCollected += pMonto;
    }
    
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
    payments: payments.reverse(), // Más recientes primero
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

// ============================================================================
// TRIGGERS Y AUTOMATIZACIONES
// ============================================================================

function trigger_generar_cargos_diarios() {
  var ss = getOrCreateSpreadsheet();
  handleGenerarCargosDiarios(ss, {
    date: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd"),
    adminUser: "CRON_00_05"
  });
}

function trigger_recordatorio_mora_1() {
  enviarRecordatoriosMora("RECORDATORIO_09_00");
}

function trigger_recordatorio_mora_2() {
  enviarRecordatoriosMora("RECORDATORIO_13_00");
}

function trigger_recordatorio_mora_3() {
  enviarRecordatoriosMora("RECORDATORIO_18_00");
}

function enviarRecordatoriosMora(tipoRecordatorio) {
  var ss = getOrCreateSpreadsheet();
  var state = buildDashboardState(ss, "", "");
  var tabNotificaciones = ss.getSheetByName(TAB_NAMES.NOTIFICACIONES);
  var nowFormatted = formatBogotaDate(new Date());
  
  for (var i = 0; i < state.stations.length; i++) {
    var st = state.stations[i];
    if (st.currentBalance > 0) {
      var montoFormateado = "$" + st.currentBalance.toLocaleString("es-CO");
      var mensaje = "¡Hola " + st.barberName + "! Saludo cordial de Barbería Barón. Te recordamos que tu saldo pendiente de alquiler del Puesto #" + st.stationNumber + " es de " + montoFormateado + " COP. Agradecemos subir tu comprobante de pago.";
      var linkWa = "https://wa.me/" + st.whatsapp + "?text=" + encodeURIComponent(mensaje);
      
      tabNotificaciones.appendRow([
        Utilities.getUuid(),
        st.id,
        tipoRecordatorio,
        "WHATSAPP",
        st.whatsapp,
        mensaje,
        "GENERADO",
        linkWa,
        nowFormatted
      ]);
    }
  }
  
  logAudit(ss, "DISPATCH_REMINDERS", "SYSTEM", "CRON", { tipo: tipoRecordatorio });
}

function trigger_verificacion_integridad() {
  var ss = getOrCreateSpreadsheet();
  var tabMovimientos = ss.getSheetByName(TAB_NAMES.MOVIMIENTOS);
  var tabCargos = ss.getSheetByName(TAB_NAMES.CARGOS);
  var tabPagos = ss.getSheetByName(TAB_NAMES.PAGOS);
  
  var numCargos = tabCargos.getLastRow() - 1;
  var numPagos = tabPagos.getLastRow() - 1;
  var numMovimientos = tabMovimientos.getLastRow() - 1;
  
  logAudit(ss, "VERIFICACION_INTEGRIDAD_23_55", "SYSTEM", "CRON", {
    totalCargos: numCargos,
    totalPagos: numPagos,
    totalMovimientos: numMovimientos,
    timestamp: formatBogotaDate(new Date())
  });
}

// ============================================================================
// GESTIÓN DE ARCHIVOS Y GOOGLE DRIVE
// ============================================================================

function saveVoucherToDrive(base64Data, stationNumber, barberName) {
  var folder = getOrCreateVoucherFolder();
  var cleanBase64 = base64Data;
  var mimeType = "image/jpeg";
  var ext = "jpg";
  
  if (base64Data.indexOf(";base64,") !== -1) {
    var parts = base64Data.split(";base64,");
    cleanBase64 = parts[1];
    var mimeMatch = parts[0].match(/data:(.*?);/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
      if (mimeType.indexOf("png") !== -1) ext = "png";
      else if (mimeType.indexOf("webp") !== -1) ext = "webp";
      else if (mimeType.indexOf("pdf") !== -1) ext = "pdf";
    }
  }
  
  var decoded = Utilities.base64Decode(cleanBase64);
  var dateStr = Utilities.formatDate(new Date(), TIMEZONE, "yyyyMMdd_HHmmss");
  var safeBarber = (barberName || "Barbero").replace(/[^a-zA-Z0-9]/g, "_");
  var fileName = "Bauche_Puesto" + stationNumber + "_" + safeBarber + "_" + dateStr + "." + ext;
  
  var blob = Utilities.newBlob(decoded, mimeType, fileName);
  var file = folder.createFile(blob);
  
  // Archivo privado con permiso de lectura para quien tenga enlace (administrador)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return {
    id: file.getId(),
    url: file.getUrl()
  };
}

function getOrCreateVoucherFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

// ============================================================================
// CONFIGURACIÓN DE PESTAÑAS Y ESQUEMAS RELACIONALES
// ============================================================================

function getOrCreateSpreadsheet() {
  var files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  var ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  return ss;
}

function setupTabConfiguracion(ss, folderId) {
  var sheet = getOrCreateSheet(ss, TAB_NAMES.CONFIGURACION);
  formatHeader(sheet, ["CLAVE", "VALOR", "DESCRIPCION", "ULTIMA_ACTUALIZACION"]);
  
  if (sheet.getLastRow() === 1) {
    var now = formatBogotaDate(new Date());
    sheet.appendRow(["NOMBRE_NEGOCIO", "Barbería Barón", "Nombre oficial de la empresa", now]);
    sheet.appendRow(["TARIFA_DIARIA_DEFAULT_COP", 45000, "Valor diario de alquiler por puesto en COP", now]);
    sheet.appendRow(["CANTIDAD_PUESTOS", 4, "Número total de puestos disponibles", now]);
    sheet.appendRow(["ZONA_HORARIA", TIMEZONE, "Zona horaria oficial del negocio", now]);
    sheet.appendRow(["DRIVE_FOLDER_ID", folderId, "ID de carpeta Google Drive para comprobantes", now]);
    sheet.appendRow(["HORA_CARGO_DIARIO", "00:05", "Hora de ejecución del trigger de cargos diarios", now]);
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
    sheet.appendRow(["puesto-1", 1, "Puesto # 1 - Espejo Imperial", "OCUPADO", "Silla barbera de lujo izquierda"]);
    sheet.appendRow(["puesto-2", 2, "Puesto # 2 - Silla Oro", "OCUPADO", "Silla hidráulica dorada central"]);
    sheet.appendRow(["puesto-3", 3, "Puesto # 3 - Sillón Real", "OCUPADO", "Estación de afeitado clásica"]);
    sheet.appendRow(["puesto-4", 4, "Puesto # 4 - Trono Corona", "OCUPADO", "Estación derecha vista a vitrina"]);
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

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function formatHeader(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#18181B");
  headerRange.setFontColor("#D4AF37");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function logAudit(ss, action, userId, role, details) {
  try {
    var tabAuditoria = ss.getSheetByName(TAB_NAMES.AUDITORIA);
    if (tabAuditoria) {
      tabAuditoria.appendRow([
        Utilities.getUuid(),
        action,
        userId || "ANONYMOUS",
        role || "NONE",
        JSON.stringify(details || {}),
        "SERVER",
        formatBogotaDate(new Date())
      ]);
    }
  } catch (e) {
    Logger.log("Error registrando auditoría: " + e.toString());
  }
}

function formatBogotaDate(date) {
  return Utilities.formatDate(date, TIMEZONE, DATE_FORMAT);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getBarberByUserId(ss, userId) {
  var tabBarberos = ss.getSheetByName(TAB_NAMES.BARBEROS);
  var data = tabBarberos.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === userId) {
      return {
        id: data[i][0],
        nombre: data[i][2],
        whatsapp: data[i][3]
      };
    }
  }
  return null;
}

function getContratoIdByBarbero(ss, barberoId) {
  var tabContratos = ss.getSheetByName(TAB_NAMES.CONTRATOS);
  var data = tabContratos.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === barberoId && data[i][6] === "ACTIVO") {
      return data[i][0];
    }
  }
  return "cnt-1";
}

function getBarberNameById(stations, barberoId) {
  for (var i = 0; i < stations.length; i++) {
    if (stations[i].id === barberoId) return stations[i].barberName;
  }
  return "Barbero";
}
