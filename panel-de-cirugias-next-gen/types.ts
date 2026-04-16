
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
  id: string; // DNI
  name: string;
  initials: string;
  dob?: string;
  nuc?: string; // Número Único de Carpeta
  phone?: string;
  address?: string; // Domicilio
  province?: string; // Provincia
  locality?: string; // Localidad
  age?: number; // Virtual Column logic
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
  institution?: { name: string };
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
  time: string;
  date?: string;
  orRoom?: string; // Ref OperatingRoom
  color?: string;
  plannedStartTime?: string;
  plannedEndTime?: string;
  actualStartTime?: string;
  actualEndTime?: string;
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
export type UserRole = 'SuperAdmin' | 'Medico' | 'Tecnico' | 'Internacion' | 'Ortopedia' | 'Direccion' | 'Quirofano' | 'Anestesista' | 'Oficina ART';

export interface Vendor {
  id: string;
  name: string;
}

export interface Coverage {
  id: string;
  name: string;
  type: 'Obra Social' | 'ART' | string;
  vendor_id?: string;
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
  doctorId?: string; // Only if role === 'Medico'
}