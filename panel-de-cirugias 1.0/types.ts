
export enum SurgeryStatus {
  Pending = 'Pendiente',
  Scheduled = 'Programada',
  InOR = 'En Quirófano',
  InProgress = 'En Curso',
  Delayed = 'Demorada',
  Recovery = 'Recuperación',
  Completed = 'Completada',
  Cancelled = 'Cancelada',
  Suspended = 'Suspendida',
  WaitingDate = 'waiting_date'
}

export enum OrthoStatus {
  ImplantReady = 'Implante Listo',
  EquipmentPending = 'Equipo Pendiente',
  Completed = 'Completado',
  ReviewNeeded = 'Requiere Revisión'
}

export interface Patient {
  id: string; // DNI or UUID (Context dependent)
  document_number?: string; // DB Column
  full_name?: string; // DB Column
  name: string;
  initials: string;
  birth_date?: string;
  nuc?: string; // Número Único de Carpeta
  phone?: string;
  address?: string; // Domicilio
  province?: string; // Provincia
  locality?: string; // Localidad
  age?: number; // Virtual Column logic
  allergies?: string;
}


// Admin Configurations
export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  email: string; // Key for user filters
  active: boolean;
  does_guardias?: boolean;
}

export interface OperatingRoom {
  id: string;
  name: string;
  active: boolean;
  daily_goal?: number;
  start_time?: string;
  is_ambulatory?: boolean;
}

export interface MaterialTemplate {
  id: string;
  name: string;
  quantity: number;
  category: string; // Changed from union type to string to support dynamic categories
}

export interface ProcedureType {
  id: string;
  name: string;
  specialty: string;
  defaultDurationMin: number;
  requiredMaterials: MaterialTemplate[]; // The "Tree" mapping
}

export interface Surgery {
  id: string;
  patient: Patient;
  doctor: string; // Ref Doctor
  procedure: string; // Ref ProcedureType
  status: SurgeryStatus;
  orthoStatus: OrthoStatus;
  time: string | null;
  date: string | null;
  orRoom?: string; // Ref OperatingRoom
  color?: string;
  plannedStartTime?: string;
  plannedEndTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  diagnosis?: string;
  referringDoctorId?: string;
  patientAvailableFrom: string | null; // ISO Date String
  adminConfirmation: boolean;
  confirmedBy: string | null;
  patientUnableToAttend?: boolean;
  is_guardia?: boolean;
  internacion_notified?: boolean;
  internacion_notified_by?: string | null;
  internacion_notified_at?: string | null;
  paciente_notificado?: boolean;
  paciente_notificado_por?: string | null;
  paciente_notificado_at?: string | null;
  pedido_autorizacion_art?: boolean;
  pedido_autorizacion_art_por?: string | null;
  pedido_autorizacion_art_at?: string | null;
  original_surgery_date?: string | null;
  original_start_time?: string | null;
}

export interface KpiStat {
  label: string;
  value: string | number;
  subtext: string;
  trend?: string;
  icon: string;
  colorClass: string;
}

// User Management
export type UserRole = 'Administrativo' | 'Administrativo de Guardias' | 'Administrativo Direccion' | 'Medico' | 'Instrumentadora' | 'Enfermeria' | 'Limpieza' | 'Camillero' | 'Anestesista' | 'Gerencia' | 'Farmacia' | 'Logistica' | 'RRHH' | 'Mantenimiento' | 'Bioingenieria' | 'Sistemas' | 'Comercial' | 'Auditoria' | 'Calidad' | 'Legales' | 'Administracion' | 'Compras' | 'Facturacion' | 'Admision' | 'Archivo' | 'Secretaria' | 'Recepcion' | 'CallCenter' | 'Laboratorio' | 'Hemoterapia' | 'AnatomiaPatologica' | 'DiagnosticoPorImagenes' | 'Kinesiologia' | 'Nutricion' | 'ServicioSocial' | 'Seguridad' | 'Hoteleria' | 'Cocina' | 'Lavadero' | 'Esterilizacion' | 'Almacen' | 'Despacho' | 'Tesoreria' | 'Contaduria' | 'Finanzas' | 'GerenciaMedica' | 'DireccionMedica' | 'JefaturaDeGuardia' | 'JefaturaDeEnfermeria' | 'JefaturaDeQuirofano' | 'JefaturaDeInternacion' | 'JefaturaDeConsultorios' | 'JefaturaDeServiciosAuxiliares' | 'JefaturaDeAdministracion' | 'JefaturaDeRecursosHumanos' | 'JefaturaDeSistemas' | 'JefaturaDeMantenimiento' | 'JefaturaDeBioingenieria' | 'JefaturaDeComercial' | 'JefaturaDeAuditoria' | 'JefaturaDeCalidad' | 'JefaturaDeLegales' | 'JefaturaDeCompras' | 'JefaturaDeFacturacion' | 'JefaturaDeAdmision' | 'JefaturaDeArchivo' | 'JefaturaDeSecretaria' | 'Internacion' | 'Oficina ART' | 'Ortopedia' | 'Tecnico' | 'Direccion' | 'Mucama' | 'SuperAdmin' | 'Quirofano' | 'Residente';

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  whatsapp_number?: string;
  telegram_chat_id?: string;
  notification_method?: 'whatsapp' | 'telegram';
  auto_notify?: boolean;
  requires_material_validation?: boolean;
}

export interface Coverage {
  id: string;
  name: string;
  type: 'Obra Social' | 'ART' | string;
  vendor_id?: string;
  nomenclador_type?: 'AOTER' | 'OSER' | 'NN' | string | null;
}

export interface NomencladorItem {
  id?: string;
  code: string;
  description: string;
  type: 'AOTER' | 'OSER' | 'NN' | string;
  active?: boolean;
  created_at?: string;
}

export interface NotificationPreferences {
  delays: boolean;
  daily_summary: boolean;
  status_changes: boolean;
  vendor_assignments: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatarUrl?: string;
  role: UserRole;
  active: boolean;
  vendorId?: string; // Only if role === 'Ortopedia'
  vendorName?: string;
  doctorId?: string; // Links to Doctor Profile
  telegramChatId?: string; // For notifications
  telegramEnabled?: boolean; // Master connection switch
  notification_method?: 'whatsapp' | 'telegram';
  auto_notify?: boolean;
  whatsapp_number?: string;
  notificationPreferences?: NotificationPreferences;
  canFillForms?: boolean;
  saved_signature?: string | null;
  signature_pin?: string | null;
  specialty?: string | null;
  license_number?: string | null;
  does_guardias?: boolean;
  does_guardias_medicas?: boolean;
  can_edit_shifts?: boolean;
  resident_level?: 'R1' | 'R2' | 'R3' | 'R4' | null;
  resident_level_history?: ResidentLevelHistoryEntry[] | null;
  resident_level_valid_from?: string | null;
  can_view_all_vendors?: boolean;
  is_turno_tarde?: boolean;
  has_tecnico_section_access?: boolean;
}

export interface ResidentLevelHistoryEntry {
  level: 'R1' | 'R2' | 'R3' | 'R4';
  valid_from: string; // Formato YYYY-MM-DD o YYYY-MM
}

export const getResidentLevelForDate = (
  user: { resident_level?: string | null; resident_level_history?: ResidentLevelHistoryEntry[] | null } | null | undefined,
  date: Date | string
): 'R1' | 'R2' | 'R3' | 'R4' | null => {
  if (!user) return null;
  const history = user.resident_level_history;
  if (!history || !Array.isArray(history) || history.length === 0) {
    return (user.resident_level as any) || null;
  }

  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const targetMonthStr = `${y}-${m}-01`;

  const sorted = [...history]
    .filter(h => h && h.level && h.valid_from)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from));

  if (sorted.length === 0) {
    return (user.resident_level as any) || null;
  }

  const matching = sorted.filter(h => {
    const v = h.valid_from.length === 7 ? `${h.valid_from}-01` : h.valid_from;
    return v <= targetMonthStr;
  });

  if (matching.length > 0) {
    return matching[matching.length - 1].level;
  }

  return sorted[0].level;
};

export interface CatalogItem {
  id: string;
  name: string;
  code?: string;
  category: string;
  active: boolean;
  default_unit?: string;
  drug_name?: string;
  created_at?: string;
}

export type AlertStatus = 'Active' | 'Resolved' | 'Snoozed';

export interface SystemAlert {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  patientName: string;
  surgeryId: string;
  targetRole: UserRole;
  targetDoctorId?: string | null;
  targetVendorId?: string | null;
  dateGenerated: string;
  deadlineDate?: string;
  status: AlertStatus;
  resolvedAt?: string;
  resolvedBy?: string;
}

// Hospitalization Module
export interface HospitalRoom {
  id: string;
  name: string;
  floor: string;
  layout_x: number;
  layout_y: number;
  layout_w: number;
  layout_h: number;
  created_at?: string;
}

export type BedStatus = 'available' | 'occupied' | 'cleaning_pending' | 'maintenance';

export interface HospitalBed {
  id: string;
  room_id: string;
  bed_code: string;
  status: BedStatus;
  room?: HospitalRoom;
  active_admission?: HospitalAdmission;
}

export interface HospitalAdmission {
  id: string;
  patient_id: string;
  bed_id: string;
  check_in: string;
  check_out?: string;
  ready_at?: string;
  medications?: string;
  allergies?: string;
  observations?: string;
  est_discharge?: string;
  doctor_id?: string;
  doctor?: { id: string; full_name: string };
  patient?: Patient;
  billing_status?: 'pendiente' | 'facturado';
  billed_at?: string;
  billed_by?: string;
}

export interface HospitalBedHistory {
  id: string;
  bed_id: string;
  status: BedStatus;
  started_at: string;
  ended_at?: string;
  changed_by?: string;
}

export interface HospitalMedicationLog {
  id: string;
  admission_id: string;
  medication_name: string;
  dose: number;
  unit: string;
  administered_at: string;
  next_dose_at?: string;
  drug_name?: string;
  administered_by: string;
  created_at?: string;
}

export interface HospitalMedicationPlan {
  id: string;
  admission_id: string;
  medication_name: string;
  dose: number;
  unit: string;
  frequency_hours?: number;
  next_dose_at: string | null;
  active: boolean;
  drug_name?: string;
  created_at?: string;
  created_by?: string;
  ends_at?: string;
  is_sos?: boolean;
  observations?: string;
}

export type AlertSeverity = 'Critical' | 'Urgent' | 'Warning' | 'Info';

export interface SurgeryMaterial {
    id: string;
    name: string;
    category: string;
    quantity: number;
    requestedQuantity: number;
    isCovered?: boolean;
    isConfirmed?: boolean;
    observation?: string;
    procedureName?: string;
}

export interface SurgeryDocument {
    id: string;
    name: string;
    type: string;
    category?: string;
    file_path: string;
    created_at: string;
    uploaded_by?: string;
}

export interface ResidentShift {
  id: string;
  resident_id: string;
  start_time: string; // ISO datetime
  end_time: string; // ISO datetime
  created_at?: string;
  created_by?: string;
  resident?: { full_name: string, name: string };
}

export interface ResidentVacation {
  id: string;
  resident_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  status?: string;
  created_at?: string;
  created_by?: string;
  resident?: { full_name: string, name: string };
}