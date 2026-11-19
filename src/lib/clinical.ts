/** Antecedentes personales patológicos que se preguntan en la anamnesis. */
export const PATHOLOGICAL_CONDITIONS = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertensión arterial" },
  { key: "cardiopatia", label: "Cardiopatía / infarto" },
  { key: "fiebre_reumatica", label: "Fiebre reumática" },
  { key: "asma", label: "Asma / enfermedad respiratoria" },
  { key: "epilepsia", label: "Epilepsia / convulsiones" },
  { key: "coagulacion", label: "Trastornos de coagulación / sangrado" },
  { key: "anticoagulantes", label: "Toma anticoagulantes" },
  { key: "hepatitis", label: "Hepatitis / enfermedad hepática" },
  { key: "renal", label: "Enfermedad renal" },
  { key: "tiroides", label: "Enfermedad tiroidea" },
  { key: "vih", label: "VIH / inmunodeficiencia" },
  { key: "cancer", label: "Cáncer / radioterapia / quimioterapia" },
  { key: "bifosfonatos", label: "Osteoporosis / bifosfonatos" },
  { key: "anemia", label: "Anemia" },
  { key: "gastritis", label: "Gastritis / reflujo" },
  { key: "psiquiatrico", label: "Trastorno psiquiátrico / ansiedad" },
  { key: "alergia_anestesia", label: "Reacción previa a anestesia local" },
] as const;

export type ConditionKey = (typeof PATHOLOGICAL_CONDITIONS)[number]["key"];

/** Condiciones que conviene resaltar como alerta médica en la ficha. */
export const ALERT_CONDITIONS: ConditionKey[] = [
  "diabetes",
  "hipertension",
  "cardiopatia",
  "coagulacion",
  "anticoagulantes",
  "bifosfonatos",
  "alergia_anestesia",
  "vih",
  "epilepsia",
];
