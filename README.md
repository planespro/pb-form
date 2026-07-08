# PlanesPro Formulario Independiente (Google Sheets + Agenda Local)

Este es un proyecto web estático e independiente para capturar leads de PlanesPro. Utiliza la misma interfaz premium y lógica de atribución del formulario de la landing, pero integra una **agenda local dinámica de 7 días** (ejecutada enteramente en el cliente) y envía los leads directamente a una hoja de cálculo de **Google Sheets** sin depender de servidores backend adicionales ni APIs complejas.

## Estructura del Proyecto

El código está estructurado de manera modular y escalable para facilitar su mantenimiento:
* `index.html`: La interfaz principal con los modales (agenda, privacidad, guardián de salida) y la vista de éxito empotrados, garantizando cargas instantáneas y eliminando problemas de CORS locales al abrir el archivo.
* `styles.css`: Estilos visuales del formulario y modales.
* `app.js`: Lógica organizada bajo el **Patrón de Módulo** en JavaScript (IIFE) dividido en submódulos desacoplados:
  - `CONFIG`: Ajustes y bloques horarios de la agenda.
  - `State`: Administrador de estado reactivo del formulario.
  - `Attribution`: Captura de códigos `?ref=` y persistencia en LocalStorage.
  - `Scheduler`: Cálculo dinámico de los próximos 7 días y desactivación inteligente de horarios pasados.
  - `Validation`: Validadores estrictos de datos (nombre, correo, edad, Isapre/renta, teléfono).
  - `Api`: Cliente de conexión HTTP hacia Google Sheets.
  - `UI`: Controlador de eventos del DOM y renderizado de la UI.
* `google-apps-script.js`: Código backend para copiar en el editor de Apps Script de tu Google Sheet.

---

## Guía de Configuración Paso a Paso

### 1. Configurar la Hoja de Google Sheets (Backend)

1. Abre la hoja de cálculo de Google Sheets donde quieras recibir las respuestas del formulario.
2. En el menú superior, haz clic en **Extensiones** > **Apps Script**.
3. Borra el código por defecto (`function myFunction() { ... }`).
4. Abre el archivo [google-apps-script.js](./google-apps-script.js) de este proyecto, copia todo su contenido y pégalo en el editor de Apps Script.
5. Haz clic en el ícono de **Guardar** (el disquete) o presiona `Ctrl + S`.
6. Haz clic en el botón azul superior: **Implementar** > **Nueva implementación** (Deploy > New Deployment).
7. Selecciona el tipo de implementación haciendo clic en el engranaje al lado de "Seleccionar tipo" y elige **Aplicación web**.
8. Configura los parámetros:
   - **Descripción**: *PlanesPro Leads API*
   - **Ejecutar como**: *Yo (tu-correo@gmail.com)*
   - **Quién tiene acceso**: *Cualquiera* (Esto es **muy importante** para que la web pública pueda registrar datos sin pedir iniciar sesión de Google).
9. Haz clic en **Implementar**.
10. Google te solicitará autorizar permisos para que el script pueda escribir en tu hoja de cálculo. Haz clic en **Autorizar acceso**, selecciona tu cuenta de Google, ve a "Avanzado" (abajo a la izquierda) y haz clic en *Ir a Proyecto sin título (no seguro)*, luego en **Permitir**.
11. Al finalizar, se abrirá una ventana con la **URL de la aplicación web**. Cópiala. Tendrá un formato similar a este:
    `https://script.google.com/macros/s/AKfycbw...XXXXXX/exec`

### 2. Conectar el Frontend al Script

1. Abre el archivo [app.js](./app.js) en este proyecto.
2. Ubica la configuración al principio del archivo:
   ```javascript
   const CONFIG = {
     // REEMPLAZAR CON TU URL DE GOOGLE APPS SCRIPT WEB APP
     scriptUrl: "https://script.google.com/macros/s/XXXXXX/exec", 
     ...
   ```
3. Reemplaza `"https://script.google.com/macros/s/XXXXXX/exec"` por la URL de aplicación web que copiaste en el paso anterior.
4. Guarda el archivo.

---

## Cómo Ejecutar y Probar el Proyecto

### Probar Localmente
Puedes abrir directamente el archivo `index.html` en cualquier navegador (haciendo doble clic en él o usando la extensión Live Server de VS Code). 

### Lógica de Filtrado Inteligente de Horas
El formulario ajusta dinámicamente los horarios del día actual según la hora local del sistema del usuario:
* **Antes de las 10:00 AM:** Todos los bloques del día actual están disponibles.
* **Después de las 10:00 AM:** Se deshabilita la opción `"A primera hora (8am - 10am)"`.
* **Después de las 3:00 PM (15:00):** Se deshabilita `"A medio día (12pm - 03pm)"`.
* **Después de las 6:00 PM (18:00):** Se deshabilita `"En horario de oficina"`.
* **Después de las 7:00 PM (19:00):** Se deshabilitan todos los bloques para el día en curso. En este punto, `"Hoy"` se elimina completamente de las opciones, y el primer día disponible en la lista pasa a ser `"Mañana"`.

---

## Cómo Subir a Producción en GitHub Pages

Dado que es un proyecto puramente estático, subirlo a GitHub Pages es gratuito e inmediato:

1. Crea un nuevo repositorio vacío en GitHub (ej: `planespro-formulario`).
2. Sube los archivos `index.html`, `styles.css`, `app.js` y `README.md` a la rama principal (`main` o `master`).
3. En GitHub, ve a **Settings** (Configuración) del repositorio > **Pages** (en el menú izquierdo).
4. En la sección **Build and deployment**, selecciona la fuente **Deploy from a branch**.
5. En **Branch**, selecciona `main` (o la rama donde subiste los archivos) y la carpeta `/ (root)`. Haz clic en **Save**.
6. En unos minutos, GitHub te dará la URL pública de tu formulario (ej: `https://tu-usuario.github.io/planespro-formulario/`).

¡Listo! Ya puedes enlazar esta URL en tus campañas y empezar a recibir los leads en tu Google Sheet en tiempo real.
