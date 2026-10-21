// Tipos de la base de datos. Mantener sincronizado con supabase/migrations.
// Se pueden regenerar con: npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin" | "dentist" | "reception";
export type Sex = "F" | "M" | "X";

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

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

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
    };
    Views: { [_ in never]: never };
    Functions: {
      current_app_role: { Args: Record<string, never>; Returns: AppRole };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      can_access_clinical: { Args: { p_patient_id: string }; Returns: boolean };
    };
    Enums: { app_role: AppRole; sex: Sex };
    CompositeTypes: { [_ in never]: never };
  };
};
