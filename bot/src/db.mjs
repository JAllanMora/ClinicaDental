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

    async createPatient({ firstName, lastName, phone }) {
      const branch = must(await sb.from("branches").select("id").order("created_at").limit(1)).at(0);
      return must(
        await sb
          .from("patients")
          .insert({
            first_name: firstName,
            last_name: lastName,
            phone,
            branch_id: branch?.id ?? null,
            contact_preference: "whatsapp",
            notes: "Registrado por el bot de WhatsApp",
          })
          .select("*")
          .single(),
      );
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
