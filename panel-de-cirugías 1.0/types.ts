
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
}

export interface OperatingRoom {
  id: string;
  name: string;
  active: boolean;
  daily_goal?: number;
  start_time?: string;
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
export type UserRole = 'Administrativo' | 'Administrativo de Guardias' | 'Medico' | 'Instrumentadora' | 'Enfermeria' | 'Limpieza' | 'Camillero' | 'Anestesista' | 'Gerencia' | 'Farmacia' | 'Logistica' | 'RRHH' | 'Mantenimiento' | 'Bioingenieria' | 'Sistemas' | 'Comercial' | 'Auditoria' | 'Calidad' | 'Legales' | 'Administracion' | 'Compras' | 'Facturacion' | 'Admision' | 'Archivo' | 'Secretaria' | 'Recepcion' | 'CallCenter' | 'Laboratorio' | 'Hemoterapia' | 'AnatomiaPatologica' | 'DiagnosticoPorImagenes' | 'Kinesiologia' | 'Nutricion' | 'ServicioSocial' | 'Seguridad' | 'Hoteleria' | 'Cocina' | 'Lavadero' | 'Esterilizacion' | 'Almacen' | 'Despacho' | 'Tesoreria' | 'Contaduria' | 'Finanzas' | 'GerenciaMedica' | 'DireccionMedica' | 'JefaturaDeGuardia' | 'JefaturaDeEnfermeria' | 'JefaturaDeQuirofano' | 'JefaturaDeInternacion' | 'JefaturaDeConsultorios' | 'JefaturaDeServiciosAuxiliares' | 'JefaturaDeAdministracion' | 'JefaturaDeRecursosHumanos' | 'JefaturaDeSistemas' | 'JefaturaDeMantenimiento' | 'JefaturaDeBioingenieria' | 'JefaturaDeComercial' | 'JefaturaDeAuditoria' | 'JefaturaDeCalidad' | 'JefaturaDeLegales' | 'JefaturaDeCompras' | 'JefaturaDeFacturacion' | 'JefaturaDeAdmision' | 'JefaturaDeArchivo' | 'JefaturaDeSecretaria' | 'Internacion' | 'Oficina ART' | 'Ortopedia' | 'Tecnico' | 'Direccion' | 'SuperAdmin' | 'Quirofano' | 'Residente';

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  requires_material_validation?: boolean;
}

export interface Coverage {
  id: string;
  name: string;
  type: 'Obra Social' | 'ART' | string;
  vendor_id?: string;
}

export interface NotificationPreferences {
  delays: boolean;
  daily_summary: boolean;
  status_changes: boolean;
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
  doctorId?: string; // Links to Doctor Profile
  telegramChatId?: string; // For notifications
  telegramEnabled?: boolean; // Master connection switch
  notificationPreferences?: NotificationPreferences;
  canFillForms?: boolean;
}

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
}

export type AlertSeverity = 'Critical' | 'Urgent' | 'Warning' | 'Info';
export type AlertStatus = 'Active' | 'Resolved';