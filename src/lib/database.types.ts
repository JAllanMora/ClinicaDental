// Tipos de la base de datos. Mantener sincronizado con supabase/migrations.
// Se pueden regenerar con: npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "dentist" | "reception";
export type Sex = "F" | "M" | "X";
export type FindingLayer = "previo" | "patologia" | "propuesto" | "realizado";
export type ToothSurface = "M" | "O" | "D" | "V" | "L";
export type FileKind =
  | "periapical"
  | "aleta_mordida"
  | "oclusal"
  | "panoramica"
  | "cefalometrica"
  | "tomografia"
  | "foto_intraoral"
  | "foto_extraoral"
  | "escaneo_stl"
  | "documento"
  | "otro";

type Timestamps = { created_at: string; updated_at: string };

export type Branch = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
} & Timestamps;

export type Chair = {
  id: string;
  branch_id: string;
  name: string;
  active: boolean;
} & Timestamps;

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  specialty: string | null;
  professional_id: string | null;
  phone: string | null;
  color: string;
  branch_id: string | null;
  active: boolean;
} & Timestamps;

export type Patient = {
  id: string;
  record_number: number;
  first_name: string;
  last_name: string;
  second_last_name: string | null;
  birth_date: string | null;
  sex: Sex | null;
  curp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  guardian_name: string | null;
  referred_by: string | null;
  notes: string | null;
  primary_dentist_id: string | null;
  branch_id: string | null;
  active: boolean;
  created_by: string | null;
  search: string;
  contact_preference: ContactChannel;
} & Timestamps;

export type PatientCareTeam = {
  patient_id: string;
  dentist_id: string;
  added_at: string;
  added_by: string | null;
};

export type MedicalHistory = {
  patient_id: string;
  pathological_history: Json;
  pathological_notes: string | null;
  non_pathological_history: string | null;
  family_history: string | null;
  allergies: string[];
  current_medications: string | null;
  surgeries: string | null;
  pregnant: boolean | null;
  breastfeeding: boolean | null;
  blood_pressure: string | null;
  chief_complaint: string | null;
  current_illness: string | null;
  dental_history: string | null;
  completed_by_patient: boolean;
  updated_by: string | null;
} & Timestamps;

export type AuditLog = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_email: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Json | null;
  new_data: Json | null;
  changed: string[] | null;
};

export type DentalFinding = {
  id: string;
  patient_id: string;
  tooth: number;
  surface: ToothSurface | null;
  condition: string;
  layer: FindingLayer;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
  completed_at: string | null;
  completed_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  updated_at: string;
};

export type PerioSite = { pd?: number | null; rec?: number | null; bop?: boolean; sup?: boolean };
export type PerioTooth = {
  mobility?: number | null;
  furcation?: number | null;
  missing?: boolean;
  implant?: boolean;
  sites?: Partial<Record<"MV" | "V" | "DV" | "ML" | "L" | "DL", PerioSite>>;
};
export type PerioData = Record<string, PerioTooth>;

export type PeriodontalExam = {
  id: string;
  patient_id: string;
  exam_date: string;
  examiner_id: string | null;
  dentition: "permanente" | "temporal";
  data: PerioData;
  notes: string | null;
} & Timestamps;

export type ClinicalNote = {
  id: string;
  patient_id: string;
  note_date: string;
  teeth: number[];
  procedure: string;
  materials: string | null;
  anesthesia: string | null;
  description: string | null;
  next_steps: string | null;
  dentist_id: string;
  amends_note_id: string | null;
  created_at: string;
};

export type ConsentTemplate = {
  id: string;
  title: string;
  body: string;
  active: boolean;
} & Timestamps;

export type Consent = {
  id: string;
  patient_id: string;
  template_id: string | null;
  title: string;
  body: string;
  signer_name: string;
  signer_relation: string | null;
  signature: string;
  dentist_id: string | null;
  dentist_signature: string | null;
  signed_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  user_agent: string | null;
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type PatientFile = {
  id: string;
  patient_id: string;
  kind: FileKind;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  format: "imagen" | "dicom" | "stl" | "pdf" | "otro";
  taken_on: string;
  teeth: number[];
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type AppointmentStatus =
  | "programada"
  | "confirmada"
  | "en_sala"
  | "en_atencion"
  | "completada"
  | "cancelada"
  | "no_asistio";

export type AppointmentType = {
  id: string;
  name: string;
  duration_minutes: number;
  color: string;
  active: boolean;
} & Timestamps;

export type Appointment = {
  id: string;
  patient_id: string;
  dentist_id: string;
  chair_id: string;
  type_id: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  arrived_at: string | null;
  created_by: string | null;
  confirm_token: string;
  reminder_sent_at: string | null;
  patient_response: "confirmada" | "cambio" | null;
  patient_responded_at: string | null;
} & Timestamps;

export type ScheduleBlock = {
  id: string;
  dentist_id: string | null;
  chair_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type WaitlistEntry = {
  id: string;
  patient_id: string;
  type_id: string | null;
  dentist_id: string | null;
  preferred_time: "manana" | "tarde" | "cualquiera";
  preferred_days: number[];
  short_notice: boolean;
  priority: number;
  notes: string | null;
  status: "activa" | "agendada" | "descartada";
  appointment_id: string | null;
  created_by: string | null;
} & Timestamps;

export type ContactChannel = "whatsapp" | "sms" | "email" | "ninguno";
export type NotificationStatus = "pendiente" | "enviado" | "simulado" | "fallido";

export type ReminderSettings = {
  id: boolean;
  enabled: boolean;
  days_before: number;
  clinic_phone: string | null;
  whatsapp_template: string;
  sms_template: string;
  email_subject: string;
  email_template: string;
  updated_at: string;
};

export type Notification = {
  id: string;
  appointment_id: string | null;
  patient_id: string;
  channel: Exclude<ContactChannel, "ninguno">;
  kind: "recordatorio" | "confirmacion" | "manual";
  recipient: string;
  body: string;
  status: NotificationStatus;
  provider_id: string | null;
  error: string | null;
  sent_by: string | null;
  created_at: string;
  sent_at: string | null;
};

export type AppointmentByToken = {
  patient_first_name: string;
  dentist_name: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  patient_response: "confirmada" | "cambio" | null;
  branch_name: string;
  branch_address: string | null;
  branch_phone: string | null;
};

type Fk<T extends string, C extends string, R extends string> = {
  foreignKeyName: `${T}_${C}_fkey`;
  columns: [C];
  isOneToOne: false;
  referencedRelation: R;
  referencedColumns: ["id"];
};

type PatientFk<T extends string> = {
  foreignKeyName: `${T}_patient_id_fkey`;
  columns: ["patient_id"];
  isOneToOne: false;
  referencedRelation: "patients";
  referencedColumns: ["id"];
};

type TableDef<Row, Insert, Rels extends unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Rels;
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      branches: TableDef<Branch, Optional<Branch, "id" | "address" | "phone" | "active" | "created_at" | "updated_at">>;
      chairs: TableDef<
        Chair,
        Optional<Chair, "id" | "active" | "created_at" | "updated_at">,
        [{ foreignKeyName: "chairs_branch_id_fkey"; columns: ["branch_id"]; isOneToOne: false; referencedRelation: "branches"; referencedColumns: ["id"] }]
      >;
      profiles: TableDef<
        Profile,
        Optional<
          Profile,
          "full_name" | "email" | "role" | "specialty" | "professional_id" | "phone" | "color" | "branch_id" | "active" | "created_at" | "updated_at"
        >,
        [{ foreignKeyName: "profiles_branch_id_fkey"; columns: ["branch_id"]; isOneToOne: false; referencedRelation: "branches"; referencedColumns: ["id"] }]
      >;
      patients: TableDef<
        Patient,
        Omit<
          Optional<
            Patient,
            | "id"
            | "second_last_name"
            | "birth_date"
            | "sex"
            | "curp"
            | "phone"
            | "email"
            | "address"
            | "occupation"
            | "emergency_contact_name"
            | "emergency_contact_phone"
            | "guardian_name"
            | "referred_by"
            | "notes"
            | "primary_dentist_id"
            | "branch_id"
            | "active"
            | "created_by"
            | "created_at"
            | "updated_at"
            | "contact_preference"
          >,
          "record_number" | "search"
        >,
        [
          { foreignKeyName: "patients_primary_dentist_id_fkey"; columns: ["primary_dentist_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "patients_branch_id_fkey"; columns: ["branch_id"]; isOneToOne: false; referencedRelation: "branches"; referencedColumns: ["id"] },
        ]
      >;
      patient_care_team: TableDef<
        PatientCareTeam,
        Optional<PatientCareTeam, "added_at" | "added_by">,
        [
          { foreignKeyName: "patient_care_team_dentist_id_fkey"; columns: ["dentist_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "patient_care_team_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: false; referencedRelation: "patients"; referencedColumns: ["id"] },
        ]
      >;
      medical_histories: TableDef<
        MedicalHistory,
        Partial<MedicalHistory> & { patient_id: string },
        [{ foreignKeyName: "medical_histories_patient_id_fkey"; columns: ["patient_id"]; isOneToOne: true; referencedRelation: "patients"; referencedColumns: ["id"] }]
      >;
      audit_log: TableDef<AuditLog, never>;
      dental_findings: TableDef<
        DentalFinding,
        Partial<DentalFinding> & Pick<DentalFinding, "patient_id" | "tooth" | "condition" | "layer">,
        [PatientFk<"dental_findings">]
      >;
      periodontal_exams: TableDef<
        PeriodontalExam,
        Partial<PeriodontalExam> & Pick<PeriodontalExam, "patient_id">,
        [PatientFk<"periodontal_exams">]
      >;
      clinical_notes: TableDef<
        ClinicalNote,
        Partial<ClinicalNote> & Pick<ClinicalNote, "patient_id" | "procedure">,
        [
          PatientFk<"clinical_notes">,
          { foreignKeyName: "clinical_notes_dentist_id_fkey"; columns: ["dentist_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      >;
      patient_files: TableDef<
        PatientFile,
        Partial<PatientFile> & Pick<PatientFile, "patient_id" | "kind" | "storage_path" | "file_name">,
        [
          PatientFk<"patient_files">,
          { foreignKeyName: "patient_files_uploaded_by_fkey"; columns: ["uploaded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      >;
      appointment_types: TableDef<
        AppointmentType,
        Partial<AppointmentType> & Pick<AppointmentType, "name" | "duration_minutes">
      >;
      appointments: TableDef<
        Appointment,
        Partial<Appointment> & Pick<Appointment, "patient_id" | "dentist_id" | "chair_id" | "starts_at" | "ends_at">,
        [
          PatientFk<"appointments">,
          Fk<"appointments", "dentist_id", "profiles">,
          Fk<"appointments", "chair_id", "chairs">,
          Fk<"appointments", "type_id", "appointment_types">,
        ]
      >;
      schedule_blocks: TableDef<
        ScheduleBlock,
        Partial<ScheduleBlock> & Pick<ScheduleBlock, "starts_at" | "ends_at" | "reason">,
        [Fk<"schedule_blocks", "dentist_id", "profiles">, Fk<"schedule_blocks", "chair_id", "chairs">]
      >;
      waitlist: TableDef<
        WaitlistEntry,
        Partial<WaitlistEntry> & Pick<WaitlistEntry, "patient_id">,
        [
          PatientFk<"waitlist">,
          Fk<"waitlist", "dentist_id", "profiles">,
          Fk<"waitlist", "type_id", "appointment_types">,
        ]
      >;
      reminder_settings: TableDef<ReminderSettings, Partial<ReminderSettings>>;
      notifications: TableDef<
        Notification,
        Partial<Notification> & Pick<Notification, "patient_id" | "channel" | "recipient" | "body">,
        [PatientFk<"notifications">, Fk<"notifications", "appointment_id", "appointments">, Fk<"notifications", "sent_by", "profiles">]
      >;
      consent_templates: TableDef<ConsentTemplate, Partial<ConsentTemplate> & Pick<ConsentTemplate, "title" | "body">>;
      consents: TableDef<
        Consent,
        Partial<Consent> & Pick<Consent, "patient_id" | "title" | "body" | "signer_name" | "signature">,
        [
          PatientFk<"consents">,
          { foreignKeyName: "consents_dentist_id_fkey"; columns: ["dentist_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      current_app_role: { Args: Record<string, never>; Returns: AppRole };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      can_access_clinical: { Args: { p_patient_id: string }; Returns: boolean };
      can_write_clinical: { Args: { p_patient_id: string }; Returns: boolean };
      appointment_by_token: { Args: { p_token: string }; Returns: AppointmentByToken[] };
      respond_appointment: { Args: { p_token: string; p_response: "confirmada" | "cambio" }; Returns: boolean };
    };
    Enums: { app_role: AppRole; sex: Sex; finding_layer: FindingLayer; tooth_surface: ToothSurface; file_kind: FileKind; appointment_status: AppointmentStatus; contact_channel: ContactChannel; notification_status: NotificationStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
