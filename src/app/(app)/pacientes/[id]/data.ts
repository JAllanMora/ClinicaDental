import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getPatient = cache(async (id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("patients")
    .select("*, primary_dentist:profiles!patients_primary_dentist_id_fkey(id, full_name), branch:branches(name)")
    .eq("id", id)
    .maybeSingle();
  return data;
});

export const getMedicalHistory = cache(async (patientId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("medical_histories").select("*").eq("patient_id", patientId).maybeSingle();
  return data;
});
