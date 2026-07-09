/**
 * Google Apps Script para capturar los leads del formulario PlanesPro.
 * 
 * INSTRUCCIONES DE DESPLIEGUE:
 * 1. Abre tu Google Sheet (la hoja de cálculo donde quieres guardar los datos).
 * 2. En el menú superior, ve a: Extensiones > Apps Script.
 * 3. Borra cualquier código existente e introduce todo el contenido de este archivo.
 * 4. Haz clic en el ícono de Guardar (o Ctrl + S).
 * 5. Haz clic en el botón superior: Implementar > Nueva implementación (Deploy > New Deployment).
 * 6. Haz clic en el ícono de engranaje al lado de "Seleccionar tipo" y elige "Aplicación web" (Web App).
 * 7. Configura los parámetros:
 *    - Descripción: PlanesPro Captura de Leads
 *    - Ejecutar como: Yo (tu-correo@gmail.com)
 *    - Quién tiene acceso: Cualquiera (Anyone) <-- ESTO ES CRÍTICO para que el formulario funcione sin autenticación.
 * 8. Haz clic en "Implementar".
 * 9. Otorga los permisos necesarios si Google te lo solicita.
 * 10. Copia la "URL de la aplicación web" generada (tendrá un formato como: https://script.google.com/macros/s/XXXXXX/exec).
 * 11. Pega esta URL en el archivo 'app.js' del proyecto en la variable CONFIG.scriptUrl.
 */

function doPost(e) {
  try {
    var data = {};
    
    // Intentar parsear el contenido si viene como JSON
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseError) {
        // Si falla, procesamos los parámetros tradicionales
        data = parseParameters(e.parameter);
      }
    } else {
      data = parseParameters(e.parameter);
    }
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Columnas ordenadas de la hoja de cálculo
    var headers = [
      "Fecha",
      "Nombre",
      "Email",
      "Teléfono",
      "Edad",
      "Sistema de Salud",
      "Isapre Específica",
      "Rango de Renta",
      "Preferencia de Contacto",
      "Día Agendado",
      "Hora Agendada",
      "Comentarios",
      "Código de Referencia (Ref)",
      "Página de Origen"
    ];
    
    // Si la hoja está totalmente vacía, escribimos la cabecera
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      sheet.appendRow(headers);
    }
    
    // Ajustar prefijo de teléfono si no viene con +56
    var telefono = (data.telefono || "").trim();
    if (telefono && !telefono.startsWith("+56")) {
      // Limpiar caracteres no numéricos y asegurar el 9 inicial si es de 8 dígitos
      var cleanNumber = telefono.replace(/\D/g, "");
      if (cleanNumber.length === 9) {
        telefono = "+56 " + cleanNumber;
      }
    }
    
    // Mapear los datos de entrada a la fila correspondiente
    var row = [
      new Date(), // Fecha actual
      data.nombre || "",
      data.email || "",
      (telefono && telefono.startsWith("+")) ? "'" + telefono : telefono,
      data.rango_edad || "",
      data.sistema_actual || "",
      data.isapre_especifica || "",
      data.rango_renta || "",
      data.contacto_preferencia || "",
      data.cita_dia || "",
      data.cita_slot || "",
      data.comentarios || "",
      data.capture_ref || "",
      data.pagina_origen || "/pb-sheets/"
    ];
    
    sheet.appendRow(row);
    
    // Enviar notificación por correo electrónico al administrador
    try {
      var emailTo = "planespro.cl@gmail.com";
      var subject = "FORMULARIO DE CAMPAÑA";
      
      var body = "Se ha registrado un nuevo lead en el formulario de campaña:\n\n" +
                 "Fecha: " + new Date().toLocaleString("es-CL") + "\n" +
                 "Nombre: " + (data.nombre || "") + "\n" +
                 "Email: " + (data.email || "") + "\n" +
                 "Teléfono: " + telefono + "\n" +
                 "Edad: " + (data.rango_edad || "") + " años\n" +
                 "Sistema de Salud: " + (data.sistema_actual || "") + "\n";
      
      if (data.sistema_actual === "Isapre") {
        body += "Isapre: " + (data.isapre_especifica || "") + "\n";
      } else {
        body += "Rango de Renta: " + (data.rango_renta || "") + "\n";
      }
      
      body += "Preferencia de Contacto: " + (data.contacto_preferencia || "") + "\n";
      
      if (data.contacto_preferencia === "agendar_reunion") {
        body += "Día Agendado: " + (data.cita_dia || "") + "\n" +
                "Hora Agendada: " + (data.cita_slot || "") + "\n";
      }
      
      body += "\nComentarios:\n" + (data.comentarios || "(Ninguno)") + "\n\n" +
              "Atribución (Ref): " + (data.capture_ref || "Ninguna") + "\n" +
              "Página de Origen: " + (data.pagina_origen || "/pb-sheets/") + "\n";
              
      MailApp.sendEmail(emailTo, subject, body);
    } catch (emailError) {
      // Registrar el error en la consola de Google Apps Script pero no impedir que retorne éxito al frontend
      console.error("Error al enviar correo: " + emailError.toString());
    }
    
    // Responder con éxito en formato JSON
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "Lead registrado exitosamente"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // Retornar el error para depuración
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Función auxiliar para parsear los parámetros de formulario en caso de fallback
function parseParameters(parameters) {
  var obj = {};
  for (var key in parameters) {
    obj[key] = parameters[key];
  }
  return obj;
}

// Soporte para solicitudes OPTIONS preflight de CORS en navegadores
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}
