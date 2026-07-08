(function () {
  "use strict";

  // ==========================================
  // 1. CONFIGURATION
  // ==========================================
  const CONFIG = {
    // REEMPLAZAR CON TU URL DE GOOGLE APPS SCRIPT WEB APP
    scriptUrl: "https://script.google.com/macros/s/AKfycbyLlIQ7dnc7UktRQhsFsjAHEgJZm0CQZh76l6_zXlI01sOKyRUxvSzA_leQGV9jMWRc/exec", 
    captureStorageKey: "planesproCaptureAttribution",
    attributionTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 días de validez para atribución
    timeSlots: [
      { id: "office", label: "En horario de oficina", cutoffHour: 18 },
      { id: "morning", label: "A primera hora (8am - 10am)", cutoffHour: 10 },
      { id: "midday", label: "A medio día (12pm - 03pm)", cutoffHour: 15 },
      { id: "evening", label: "Al final de la tarde (04pm - 07pm)", cutoffHour: 19 }
    ]
  };

  // ==========================================
  // 2. STATE MANAGER
  // ==========================================
  const State = {
    system: "Isapre",               // 'Isapre' o 'Fonasa'
    contactPreference: "lo_antes_posible", // 'lo_antes_posible' o 'agendar_reunion'
    selectedDay: "",                // Día seleccionado (YYYY-MM-DD)
    selectedSlot: "",               // ID del horario seleccionado (morning, midday, etc.)
    selectedSlotLabel: "",          // Nombre legible del horario seleccionado
    captureRef: "",                 // Código de referencia de atribución
    submitting: false,              // Indicador de envío en curso
    userRequestedExit: false,        // Bandera para interceptar salida de página
    daysList: []                    // Lista de 7 días calculada localmente
  };

  // ==========================================
  // 3. ATTRIBUTION MODULE
  // ==========================================
  const Attribution = {
    sanitizeRef(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 32);
    },

    getUrlRef() {
      try {
        const url = new URL(window.location.href);
        return this.sanitizeRef(url.searchParams.get("ref") || "");
      } catch (e) {
        return "";
      }
    },

    readStored() {
      try {
        const raw = window.localStorage.getItem(CONFIG.captureStorageKey);
        if (!raw) return "";
        const parsed = JSON.parse(raw);
        const expiresAt = Number(parsed && parsed.expiresAt || 0);
        if (!expiresAt || expiresAt <= Date.now()) {
          window.localStorage.removeItem(CONFIG.captureStorageKey);
          return "";
        }
        return this.sanitizeRef(parsed && parsed.ref || "");
      } catch (e) {
        return "";
      }
    },

    writeStored(ref) {
      if (!ref) return;
      try {
        const record = {
          ref: this.sanitizeRef(ref),
          expiresAt: Date.now() + CONFIG.attributionTtlMs
        };
        window.localStorage.setItem(CONFIG.captureStorageKey, JSON.stringify(record));
      } catch (e) {}
    },

    init() {
      const explicit = this.getUrlRef();
      if (explicit) {
        this.writeStored(explicit);
        State.captureRef = explicit;
      } else {
        State.captureRef = this.readStored();
      }
    }
  };

  // ==========================================
  // 4. SCHEDULER MODULE (Local 7-Day Logic)
  // ==========================================
  const Scheduler = {
    // Retorna los bloques de horas evaluando si están en el pasado en caso de ser "Hoy"
    getSlotsForDate(date, currentHour) {
      return CONFIG.timeSlots.map(slot => {
        const isPast = currentHour !== null && currentHour >= slot.cutoffHour;
        return {
          id: slot.id,
          label: slot.label,
          disabled: isPast
        };
      });
    },

    // Formatea los textos de días de forma legible
    formatDayLabel(date, isToday, isTomorrow) {
      const dayName = new Intl.DateTimeFormat("es-CL", { weekday: "long" }).format(date);
      const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const dayNumber = date.getDate();
      const monthName = new Intl.DateTimeFormat("es-CL", { month: "long" }).format(date);
      
      const dateText = `${capitalizedDay} ${dayNumber} de ${monthName}`;
      
      if (isToday) return `Hoy (${dateText})`;
      if (isTomorrow) return `Mañana (${dateText})`;
      return dateText;
    },

    // Genera dinámicamente los siguientes 7 días hábiles/calendarios
    generateDays(count = 7) {
      const days = [];
      let offset = 0;
      const now = new Date();
      const currentHour = now.getHours();

      while (days.length < count) {
        const targetDate = new Date();
        targetDate.setDate(now.getDate() + offset);
        
        const isToday = offset === 0;
        
        // Determinar si es "Mañana"
        const tomorrowTest = new Date();
        tomorrowTest.setDate(now.getDate() + 1);
        const isTomorrow = targetDate.getDate() === tomorrowTest.getDate() &&
                           targetDate.getMonth() === tomorrowTest.getMonth() &&
                           targetDate.getFullYear() === tomorrowTest.getFullYear();

        const dateIso = targetDate.toISOString().slice(0, 10);
        
        // Obtener bloques horariales para este día
        const slots = this.getSlotsForDate(targetDate, isToday ? currentHour : null);
        
        // Si es "Hoy" y todos los horarios ya caducaron (después de las 7pm),
        // este día se salta por completo del selector.
        const hasAvailableSlots = slots.some(slot => !slot.disabled);
        
        if (hasAvailableSlots) {
          days.push({
            dateIso: dateIso,
            label: this.formatDayLabel(targetDate, isToday, isTomorrow),
            slots: slots
          });
        }
        
        offset++;
        // Prevenir loops infinitos en caso extremo
        if (offset > 20) break;
      }
      return days;
    },

    // Formatea la combinación final de fecha y hora seleccionada para mostrar al usuario
    getFormattedSelection(dayIso, slotId) {
      if (!dayIso || !slotId) return "";
      const dayObj = State.daysList.find(d => d.dateIso === dayIso);
      const slotObj = CONFIG.timeSlots.find(s => s.id === slotId);
      if (!dayObj || !slotObj) return "";
      
      // Limpiar texto de "Hoy (...)" o "Mañana (...)" para que quede directo en la tarjeta de éxito
      const cleanDayLabel = dayObj.label.replace(/^(Hoy|Mañana)\s\((.+)\)$/, "$2");
      return `${cleanDayLabel} - ${slotObj.label}`;
    }
  };

  // ==========================================
  // 5. VALIDATION MODULE
  // ==========================================
  const Validation = {
    cleanPhone(value) {
      return String(value || "").replace(/\D/g, "").slice(0, 9);
    },

    isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
    },

    validateField(elements, fieldName, condition) {
      const field = elements.form.querySelector(`[name="${fieldName}"]`);
      const group = field ? field.closest(".pb-field-group") : null;
      const errorMsg = elements.form.querySelector(`[data-error-for="${fieldName}"]`);
      
      if (!condition) {
        if (group) group.classList.add("has-error");
        if (errorMsg && errorMsg.classList.contains("pb-error--block")) {
          errorMsg.classList.add("is-visible");
        }
        return false;
      } else {
        if (group) group.classList.remove("has-error");
        if (errorMsg && errorMsg.classList.contains("pb-error--block")) {
          errorMsg.classList.remove("is-visible");
        }
        return true;
      }
    },

    validateForm(elements) {
      let isValid = true;

      // 1. Nombre
      const nameOk = elements.nameInput.value.trim().length > 0;
      if (!this.validateField(elements, "nombre", nameOk)) isValid = false;

      // 2. Edad
      const ageOk = elements.ageSelect.value !== "";
      if (!this.validateField(elements, "rango_edad", ageOk)) isValid = false;

      // 3. Correo
      const emailOk = this.isValidEmail(elements.emailInput.value);
      if (!this.validateField(elements, "email", emailOk)) isValid = false;

      // 4. Teléfono (debe tener exactamente 9 dígitos en Chile)
      const phoneDigits = this.cleanPhone(elements.phoneInput.value);
      const phoneOk = phoneDigits.length === 9;
      if (!this.validateField(elements, "telefono", phoneOk)) isValid = false;

      // 5. Sistema
      if (State.system === "Isapre") {
        const isapreOk = elements.isapreSelect.value !== "";
        if (!this.validateField(elements, "isapre_especifica", isapreOk)) isValid = false;
      } else {
        const rentaOk = elements.rentaSelect.value !== "";
        if (!this.validateField(elements, "rango_renta", rentaOk)) isValid = false;
      }

      // 6. Cita (solo si prefiere agendar)
      if (State.contactPreference === "agendar_reunion") {
        const scheduleOk = State.selectedDay !== "" && State.selectedSlot !== "";
        if (!this.validateField(elements, "cita_slot", scheduleOk)) isValid = false;
      }

      return isValid;
    },

    clearErrors(elements) {
      elements.form.querySelectorAll(".has-error").forEach(node => node.classList.remove("has-error"));
      elements.form.querySelectorAll(".pb-error.is-visible").forEach(node => node.classList.remove("is-visible"));
      elements.submitError.textContent = "";
    }
  };

  // ==========================================
  // 6. API CLIENT (Google Sheets POSTer)
  // ==========================================
  const Api = {
    // Wrapper de fetch con timeout para evitar colgar al usuario
    fetchWithTimeout(url, options, timeoutMs = 25000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      
      const finalOptions = Object.assign({}, options, { signal: controller.signal });
      return fetch(url, finalOptions)
        .catch(err => {
          if (err && err.name === "AbortError") {
            throw new Error("La solicitud tardó demasiado tiempo en completarse. Inténtalo nuevamente.");
          }
          throw err;
        })
        .finally(() => clearTimeout(timer));
    },

    submitLead(formData) {
      // Convertir FormData a un objeto plano JSON para enviar al Apps Script
      const payload = {};
      formData.forEach((value, key) => {
        payload[key] = value;
      });

      return this.fetchWithTimeout(CONFIG.scriptUrl, {
        method: "POST",
        mode: "cors", // Importante para Apps Script
        headers: {
          "Content-Type": "text/plain;charset=utf-8" // Usar text/plain evita disparar solicitudes preflight CORS complejas
        },
        body: JSON.stringify(payload)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error("Error en el servidor de Google Sheets.");
        }
        return response.json();
      })
      .then(data => {
        if (data && data.success === false) {
          throw new Error(data.error || "No se pudo registrar la solicitud.");
        }
        return data;
      });
    }
  };

  // ==========================================
  // 7. UI RENDERER & INTERACTION CONTROLLER
  // ==========================================
  const UI = {
    elements: {},

    cacheElements() {
      const q = id => document.getElementById(id);
      this.elements = {
        form: q("pb-lead-form"),
        formView: q("pb-form-view"),
        successView: q("pb-success-view"),
        systemChoice: q("pb-system-choice"),
        systemInput: q("pb-system-input"),
        isapreGroup: q("pb-isapre-group"),
        isapreSelect: q("pb-isapre-select"),
        rentaGroup: q("pb-renta-group"),
        rentaSelect: q("pb-renta-select"),
        nameInput: q("pb-name"),
        ageSelect: q("pb-age"),
        phoneInput: q("pb-phone"),
        emailInput: q("pb-email"),
        contactChoice: q("pb-contact-choice"),
        contactInput: q("pb-contact-input"),
        agendaSummary: q("pb-agenda-summary"),
        agendaSummaryText: q("pb-agenda-summary-text"),
        openAgenda: q("pb-open-agenda"),
        citaDia: q("pb-cita-dia"),
        citaSlot: q("pb-cita-slot"),
        commentToggle: q("pb-comment-toggle"),
        commentPanel: q("pb-comment-panel"),
        submitButton: q("pb-submit-button"),
        submitError: q("pb-submit-error"),
        exitTrigger: q("pb-exit-trigger"),
        exitModal: q("pb-exit-modal"),
        exitConfirm: q("pb-exit-confirm"),
        exitStay: q("pb-exit-stay"),
        privacyTrigger: q("pb-privacy-trigger"),
        privacyModal: q("pb-privacy-modal"),
        
        // Modal de agenda local
        agendaModal: q("pb-agenda-modal"),
        daySelect: q("pb-custom-day-select"),
        slotsWrap: q("pb-custom-slots-wrap"),
        agendaConfirm: q("pb-agenda-confirm"),
        
        // Éxito
        successGreeting: q("pb-success-greeting"),
        successCopy: q("pb-success-copy"),
        successAppointmentCard: q("pb-success-appointment-card"),
        successAppointment: q("pb-success-appointment")
      };
    },

    setSystem(system) {
      State.system = system === "Fonasa" ? "Fonasa" : "Isapre";
      this.elements.systemInput.value = State.system;
      
      this.elements.systemChoice.querySelectorAll("[data-system]").forEach(btn => {
        btn.classList.toggle("is-selected", btn.dataset.system === State.system);
      });

      const isIsapre = State.system === "Isapre";
      this.elements.isapreGroup.hidden = !isIsapre;
      this.elements.rentaGroup.hidden = isIsapre;

      if (isIsapre) {
        this.elements.rentaSelect.value = "";
      } else {
        this.elements.isapreSelect.value = "";
      }

      Validation.validateField(this.elements, "isapre_especifica", true);
      Validation.validateField(this.elements, "rango_renta", true);
    },

    setContactPreference(pref) {
      State.contactPreference = pref === "agendar_reunion" ? "agendar_reunion" : "lo_antes_posible";
      this.elements.contactInput.value = State.contactPreference;

      this.elements.contactChoice.querySelectorAll("[data-contact]").forEach(btn => {
        btn.classList.toggle("is-selected", btn.dataset.contact === State.contactPreference);
      });

      const showAgenda = State.contactPreference === "agendar_reunion";
      this.elements.agendaSummary.hidden = !showAgenda;

      if (!showAgenda) {
        State.selectedDay = "";
        State.selectedSlot = "";
        State.selectedSlotLabel = "";
        this.syncAppointmentInputs();
        Validation.validateField(this.elements, "cita_slot", true);
        this.updateAgendaSummary();
        this.closeAgendaModal();
      } else {
        this.updateAgendaSummary();
        this.openAgendaModal();
      }
    },

    syncAppointmentInputs() {
      const hasAppt = State.contactPreference === "agendar_reunion" && State.selectedSlot !== "";
      this.elements.citaDia.value = hasAppt ? State.selectedDay : "";
      this.elements.citaSlot.value = hasAppt ? State.selectedSlotLabel : "";
    },

    updateAgendaSummary() {
      if (!State.selectedSlot) {
        this.elements.agendaSummaryText.textContent = "Haz clic para revisar la agenda disponible.";
        return;
      }
      const label = Scheduler.getFormattedSelection(State.selectedDay, State.selectedSlot);
      this.elements.agendaSummaryText.textContent = label || "Haz clic para configurar horario.";
    },

    // Inicializa y renderiza los elementos del modal de agenda local
    populateAgendaModal() {
      // 1. Llenar los días calculados
      this.elements.daySelect.innerHTML = "";
      State.daysList.forEach(day => {
        const opt = document.createElement("option");
        opt.value = day.dateIso;
        opt.textContent = day.label;
        this.elements.daySelect.appendChild(opt);
      });

      // 2. Escuchar cambios de día para actualizar horarios
      this.elements.daySelect.onchange = () => {
        this.renderSlotsForSelectedDay();
      };

      // Si no hay un día preseleccionado, usar el primero de la lista
      if (!State.selectedDay && State.daysList.length > 0) {
        State.selectedDay = State.daysList[0].dateIso;
      }

      this.elements.daySelect.value = State.selectedDay;
      this.renderSlotsForSelectedDay();
    },

    // Renderiza la grilla de slots para el día seleccionado en el select del modal
    renderSlotsForSelectedDay() {
      const dayIso = this.elements.daySelect.value;
      const dayData = State.daysList.find(d => d.dateIso === dayIso);
      this.elements.slotsWrap.innerHTML = "";

      if (!dayData) return;

      dayData.slots.forEach(slot => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pb-custom-slot";
        btn.textContent = slot.label;
        btn.disabled = slot.disabled;
        
        if (State.selectedDay === dayIso && State.selectedSlot === slot.id) {
          btn.classList.add("is-selected");
        }

        btn.onclick = () => {
          // Desmarcar anterior
          this.elements.slotsWrap.querySelectorAll(".pb-custom-slot").forEach(b => {
            b.classList.remove("is-selected");
          });
          // Seleccionar actual
          btn.classList.add("is-selected");
          State.selectedDay = dayIso;
          State.selectedSlot = slot.id;
          State.selectedSlotLabel = slot.label;
        };

        this.elements.slotsWrap.appendChild(btn);
      });
    },

    openAgendaModal() {
      this.populateAgendaModal();
      this.elements.agendaModal.hidden = false;
    },

    closeAgendaModal() {
      this.elements.agendaModal.hidden = true;
    },

    openExitModal() {
      if (this.elements.successView && !this.elements.successView.hidden) {
        this.exitToPlanesPro();
        return;
      }
      this.elements.exitModal.hidden = false;
    },

    closeExitModal() {
      this.elements.exitModal.hidden = true;
    },

    exitToPlanesPro() {
      State.userRequestedExit = true;
      window.location.href = "https://planespro.cl/";
    },

    initHistoryGuard() {
      try {
        window.history.pushState({ pbGuard: true }, "", window.location.href);
        window.addEventListener("popstate", () => {
          if (State.userRequestedExit) return;
          this.openExitModal();
          window.history.pushState({ pbGuard: true }, "", window.location.href);
        });
      } catch (e) {}
    },

    setSubmitting(sending) {
      State.submitting = sending;
      this.elements.submitButton.disabled = sending;
      this.elements.submitButton.innerHTML = sending
        ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i><span>ENVIANDO...</span>'
        : '<i class="fas fa-paper-plane" aria-hidden="true"></i><span>QUIERO MI ANÁLISIS GRATIS</span>';
    },

    renderSuccess() {
      this.elements.formView.hidden = true;
      this.elements.successView.hidden = false;
      this.closeAgendaModal();
      this.closeExitModal();

      const firstName = this.elements.nameInput.value.trim().split(/\s+/)[0] || "";
      this.elements.successGreeting.textContent = firstName ? "GRACIAS, " + firstName.toUpperCase() : "GRACIAS";

      if (State.contactPreference === "agendar_reunion" && State.selectedSlot) {
        const fullDateLabel = Scheduler.getFormattedSelection(State.selectedDay, State.selectedSlot);
        this.elements.successCopy.textContent = "Tu solicitud y horario de contacto preferente quedaron guardados correctamente.";
        this.elements.successAppointmentCard.hidden = false;
        this.elements.successAppointment.textContent = fullDateLabel;
      } else {
        this.elements.successCopy.textContent = "Revisaremos tus datos y te contactaremos lo antes posible.";
        this.elements.successAppointmentCard.hidden = true;
      }
    },

    buildLeadFormData() {
      this.syncAppointmentInputs();
      const formData = new FormData(this.elements.form);
      
      // Agregar valores adicionales que no están mapeados directamente a campos
      formData.set("capture_ref", State.captureRef || "");
      formData.set("pagina_origen", window.location.pathname || "/pb-sheets/");
      
      // Limpiar campos según sistema de salud seleccionado para no mandar basura a Google Sheets
      if (State.system === "Isapre") {
        formData.set("rango_renta", "");
      } else {
        formData.set("isapre_especifica", "");
      }

      return formData;
    },

    bindEvents() {
      // Selección de Sistema Fonasa/Isapre
      this.elements.systemChoice.querySelectorAll("[data-system]").forEach(btn => {
        btn.addEventListener("click", () => this.setSystem(btn.dataset.system));
      });

      // Selección de preferencia de contacto
      this.elements.contactChoice.querySelectorAll("[data-contact]").forEach(btn => {
        btn.addEventListener("click", () => this.setContactPreference(btn.dataset.contact));
      });

      // Sanitizar tipeo del teléfono
      this.elements.phoneInput.addEventListener("input", () => {
        this.elements.phoneInput.value = Validation.cleanPhone(this.elements.phoneInput.value);
      });

      // Desplegable de comentarios opcional
      this.elements.commentToggle.addEventListener("click", () => {
        const expanded = this.elements.commentToggle.getAttribute("aria-expanded") === "true";
        this.elements.commentToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
        this.elements.commentPanel.hidden = expanded;
        const commentSec = this.elements.commentToggle.closest(".pb-section--comment");
        if (commentSec) {
          commentSec.classList.toggle("is-expanded", !expanded);
        }
      });

      // Modales y cierres
      this.elements.exitTrigger.addEventListener("click", () => this.openExitModal());
      this.elements.exitModal.querySelectorAll("[data-exit-close]").forEach(btn => {
        btn.addEventListener("click", () => this.closeExitModal());
      });
      this.elements.exitConfirm.addEventListener("click", () => this.exitToPlanesPro());
      this.elements.exitStay.addEventListener("click", () => this.closeExitModal());

      this.elements.privacyTrigger.addEventListener("click", () => {
        this.elements.privacyModal.hidden = false;
      });
      this.elements.privacyModal.querySelectorAll("[data-privacy-close]").forEach(btn => {
        btn.addEventListener("click", () => {
          this.elements.privacyModal.hidden = true;
        });
      });

      // Agenda local
      this.elements.openAgenda.addEventListener("click", () => this.openAgendaModal());
      this.elements.agendaModal.querySelectorAll("[data-agenda-close]").forEach(btn => {
        btn.addEventListener("click", () => this.closeAgendaModal());
      });

      this.elements.agendaConfirm.addEventListener("click", () => {
        if (!State.selectedSlot || !State.selectedDay) {
          Validation.validateField(this.elements, "cita_slot", false);
          return;
        }
        Validation.validateField(this.elements, "cita_slot", true);
        this.syncAppointmentInputs();
        this.updateAgendaSummary();
        this.closeAgendaModal();
      });

      // Envío de Formulario
      this.elements.form.addEventListener("submit", (e) => {
        e.preventDefault();
        
        if (!Validation.validateForm(this.elements)) {
          this.elements.submitError.textContent = "Por favor, completa los campos requeridos en rojo.";
          return;
        }

        this.setSubmitting(true);
        const dataPayload = this.buildLeadFormData();
        
        Api.submitLead(dataPayload)
          .then(() => {
            this.renderSuccess();
          })
          .catch(error => {
            console.error("Submission failed", error);
            this.elements.submitError.textContent = error && error.message 
              ? error.message 
              : "No fue posible registrar tus datos. Inténtalo nuevamente.";
          })
          .finally(() => {
            this.setSubmitting(false);
          });
      });
    }
  };

  // ==========================================
  // 8. INITIALIZATION
  // ==========================================
  function init() {
    // 1. Cargar referencias de atribución
    Attribution.init();

    // 2. Calcular los 7 días locales de la agenda
    State.daysList = Scheduler.generateDays(7);

    // 3. Capturar elementos del DOM
    UI.cacheElements();

    // 4. Configurar estados iniciales
    UI.setSystem(State.system);
    UI.setContactPreference(State.contactPreference);

    // 5. Enlazar eventos de interacción
    UI.bindEvents();

    // 6. Activar guardián de salida
    UI.initHistoryGuard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
