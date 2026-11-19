import { createClient } from "@supabase/supabase-js";

/** Acceso a Supabase con la llave de servicio. Todo lo que el bot lee o escribe pasa por aquí. */
export function createDb({ url, serviceKey, humanPauseHours = 4 }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const must = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    async settings() {
      const s = must(await sb.from("whatsapp_settings").select("*").single());
      const types = s.bookable_type_ids.length
        ? must(await sb.from("appointment_types").select("id, name, duration_minutes").in("id", s.bookable_type_ids).eq("active", true).order("name"))
        : [];
      return { ...s, types };
    },

    async findPatient(phone) {
      const rows = must(await sb.rpc("patient_by_phone", { p_phone: phone }));
      return rows[0] ?? null;
    },

    async createPatient({ firstName, lastName, phone, primaryDentistId = null }) {
      const branch = must(await sb.from("branches").select("id").order("created_at").limit(1)).at(0);
      return must(
        await sb
          .from("patients")
          .insert({
            first_name: firstName,
            last_name: lastName,
            phone,
            branch_id: branch?.id ?? null,
            primary_dentist_id: primaryDentistId,
            contact_preference: "whatsapp",
            notes: "Registrado por el bot de WhatsApp",
          })
          .select("*")
          .single(),
      );
    },

    /** El doctor que ya lleva el expediente: el de cabecera, o el de su última cita, o el de su equipo de atención. */
    async ownDentist(patient) {
      let id = patient.primary_dentist_id ?? null;
      if (!id) {
        const last = must(
          await sb.from("appointments").select("dentist_id").eq("patient_id", patient.id).not("status", "in", "(cancelada)").order("starts_at", { ascending: false }).limit(1),
        );
        id = last[0]?.dentist_id ?? null;
      }
      if (!id) id = must(await sb.from("patient_care_team").select("dentist_id").eq("patient_id", patient.id).limit(1))[0]?.dentist_id ?? null;
      if (!id) return null;
      return must(await sb.from("profiles").select("id, full_name").eq("id", id).eq("active", true).eq("role", "dentist")).at(0) ?? null;
    },

    async dentist(id) {
      if (!id) return null;
      return must(await sb.from("profiles").select("id, full_name").eq("id", id).eq("active", true).eq("role", "dentist")).at(0) ?? null;
    },

    /** Días de la semana (0 = domingo) en que hay consulta, de todos o de ciertos doctores. */
    async workingWeekdays(dentistIds = null) {
      let q = sb.from("working_hours").select("weekday, dentist_id");
      if (dentistIds?.length) q = q.in("dentist_id", dentistIds);
      return new Set(must(await q).map((r) => r.weekday));
    },

    // ---- Administrador -------------------------------------------------------
    async adminProfile(phone) {
      const admins = must(await sb.from("profiles").select("id, full_name, phone").eq("role", "admin").eq("active", true));
      return admins.find((a) => a.phone && String(a.phone).replace(/\D/g, "").slice(-10) === String(phone).slice(-10)) ?? null;
    },

    /** Artículos activos con existencia, mínimo y caducidad más próxima. */
    async inventory() {
      const [items, stock] = await Promise.all([
        sb.from("inventory_items").select("id, name, unit, category, min_stock").eq("active", true).order("name").then(must),
        sb.from("inventory_stock").select("item_id, stock, next_expiry, expired_qty").then(must),
      ]);
      const byId = new Map(stock.map((s) => [s.item_id, s]));
      return items.map((i) => {
        const s = byId.get(i.id);
        return { ...i, min_stock: Number(i.min_stock), stock: Number(s?.stock ?? 0), next_expiry: s?.next_expiry ?? null, expired_qty: Number(s?.expired_qty ?? 0) };
      });
    },

    async inventoryIn({ itemId, qty, actorId = null, lot = null, expires = null, cost = null, reason }) {
      return must(await sb.rpc("bot_inventory_in", { p_item: itemId, p_qty: qty, p_actor: actorId, p_lot: lot, p_expires: expires, p_cost: cost, p_reason: reason }));
    },

    async lateLabOrders(today) {
      return must(
        await sb
          .from("lab_orders")
          .select("id, folio, work_type, due_date, status, patient:patients(first_name, last_name), lab:labs(name)")
          .in("status", ["por_enviar", "enviado", "en_proceso", "ajuste"])
          .lt("due_date", today)
          .order("due_date"),
      );
    },

    async sentAlerts() {
      return must(await sb.from("bot_admin_alerts").select("key, last_sent_at"));
    },

    async markAlerts(rows) {
      if (rows.length) must(await sb.from("bot_admin_alerts").upsert(rows.map((r) => ({ ...r, last_sent_at: new Date().toISOString() })), { onConflict: "key" }));
    },

    async clearAlerts(keys) {
      if (keys.length) must(await sb.from("bot_admin_alerts").delete().in("key", keys));
    },

    /** Horarios libres. `type` limita a los doctores de ese tipo de cita; `dentist` a uno solo. */
    async slots(duration, from, to, { prefer = null, dentist = null, type = null } = {}) {
      return must(
        await sb.rpc("available_slots", { p_duration: duration, p_from: from, p_to: to, p_prefer: prefer, p_dentist: dentist, p_type: type }),
      );
    },

    /** Doctores que atienden un tipo de cita (los marcados en Configuración, o todos los que tienen horario). */
    async dentistsFor(typeId) {
      const assigned = must(await sb.from("appointment_type_dentists").select("dentist_id").eq("type_id", typeId)).map((r) => r.dentist_id);
      const withHours = [...new Set(must(await sb.from("working_hours").select("dentist_id")).map((r) => r.dentist_id))];
      const ids = assigned.length ? assigned.filter((id) => withHours.includes(id)) : withHours;
      if (!ids.length) return [];
      return must(await sb.from("profiles").select("id, full_name").in("id", ids).eq("role", "dentist").eq("active", true).order("full_name"));
    },

    /** Crea la cita. Regresa null si alguien ganó el horario mientras el paciente elegía. */
    async createAppointment({ patientId, slot, type }) {
      const { data, error } = await sb
        .from("appointments")
        .insert({
          patient_id: patientId,
          dentist_id: slot.dentist_id,
          chair_id: slot.chair_id,
          type_id: type.id,
          starts_at: slot.starts_at,
          ends_at: slot.ends_at,
          status: "programada",
          booked_via: "whatsapp",
          reason: `${type.name} (agendada por WhatsApp)`,
        })
        .select("id")
        .single();
      if (error?.code === "23P01") return null;
      if (error) throw new Error(error.message);
      return data;
    },

    async upcoming(patientId) {
      return must(
        await sb
          .from("appointments")
          .select("id, starts_at, ends_at, status, confirm_token, reminder_sent_at, patient_response, type_id, dentist:profiles!appointments_dentist_id_fkey(full_name), type:appointment_types(id, name, duration_minutes)")
          .eq("patient_id", patientId)
          .in("status", ["programada", "confirmada"])
          .gt("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(5),
      );
    },

    async respond(token, response) {
      return must(await sb.rpc("respond_appointment", { p_token: token, p_response: response }));
    },

    async cancel(appointmentId, reason) {
      must(await sb.from("appointments").update({ status: "cancelada", cancel_reason: reason }).eq("id", appointmentId));
    },

    async log({ phone, patientId = null, direction, body, needsAttention = false }) {
      must(
        await sb.from("whatsapp_messages").insert({
          phone,
          patient_id: patientId,
          direction,
          body,
          needs_attention: needsAttention,
        }),
      );
    },

    /** Hay una petición a recepción sin atender en las últimas horas (BOT_PAUSA_HUMANO_HORAS). */
    async waitingForHuman(phone) {
      const since = new Date(Date.now() - humanPauseHours * 60 * 60 * 1000).toISOString();
      const rows = must(
        await sb.from("whatsapp_messages").select("id").eq("phone", phone).eq("needs_attention", true).is("attended_at", null).gte("created_at", since).limit(1),
      );
      return rows.length > 0;
    },

    async releaseHuman(phone) {
      must(
        await sb.from("whatsapp_messages").update({ attended_at: new Date().toISOString() }).eq("phone", phone).eq("needs_attention", true).is("attended_at", null),
      );
    },

    async setStatus(fields) {
      must(await sb.from("whatsapp_status").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", true));
    },

    /** Recordatorios en cola que dejó el sistema (notifications con estado "pendiente"). */
    async queuedNotifications() {
      return must(
        await sb
          .from("notifications")
          .select("id, patient_id, recipient, body")
          .eq("channel", "whatsapp")
          .eq("status", "pendiente")
          .order("created_at")
          .limit(20),
      );
    },

    async markNotification(id, { status, error = null }) {
      must(
        await sb
          .from("notifications")
          .update({ status, error, sent_at: status === "enviado" ? new Date().toISOString() : null })
          .eq("id", id),
      );
    },
  };
}
