export interface AoterProfessional {
  id: string;
  doctor_id?: string;
  doctor_name: string;
  matricula: string;
  sgapi_username: string;
  sgapi_password: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TripticoPrestacion {
  codigo: string;
  descripcion: string;
  porcentaje_especialista: number;
  porcentaje_ayudante_1?: number;
  porcentaje_ayudante_2?: number;
  recargo?: string;
}

export interface TripticoAdjunto {
  name: string;
  path: string;
  size?: number;
  type?: string;
  dataBase64?: string;
}

export interface TripticoCirugia {
  id: string; // ID único interno para render y selección
  surgery_id?: string; // ID en quirofano.surgeries si matchea
  parte_id?: number; // ID de parte en GlobalApp
  numero_parte?: number;
  idinternacion?: number;
  fecha_cirugia: string; // YYYY-MM-DD
  hora_inicio: string; // HH:mm
  hora_fin: string; // HH:mm
  paciente_nombre: string;
  paciente_dni: string;
  paciente_nuc?: string;
  paciente_fecha_nacimiento?: string; // YYYY-MM-DD
  paciente_sexo?: string; // 'Masculino' | 'Femenino'
  obra_social: string;
  convenio?: string;
  especialista_nombre: string;
  especialista_matricula?: string;
  ayudante_1_nombre?: string;
  ayudante_1_matricula?: string;
  ayudante_2_nombre?: string;
  ayudante_2_matricula?: string;
  anestesista_nombre?: string;
  anestesista_matricula?: string;
  tipo_anestesia?: string;
  diagnostico: string;
  tratamiento: string;
  protocolo_operatorio: string;
  recargo?: string; // '5%', '20%', '25%', '30%' o 'S'
  prestaciones: TripticoPrestacion[];
  adjuntos: TripticoAdjunto[];
  selected: boolean;
  matched_panel: boolean;
  sync_status?: 'pending' | 'syncing' | 'synced' | 'error';
  sync_error?: string;
  orden_triptico_aoter?: string;
  egreso_fecha?: string | null;
  tiene_egreso?: boolean;
  ya_cargada_aoter?: boolean;
  orden_aoter_existente?: string;
}

export interface TripticoSyncHistoryItem {
  id: string;
  cirugia_id?: string;
  fecha_cirugia: string;
  paciente_nombre: string;
  paciente_dni: string;
  paciente_nuc?: string;
  especialista_nombre: string;
  especialista_matricula?: string;
  ayudantes?: string[];
  anestesista?: string;
  tipo_anestesia?: string;
  obra_social: string;
  codigo_prestacion: string;
  prestaciones_detalle: TripticoPrestacion[];
  diagnostico: string;
  tratamiento: string;
  protocolo_operatorio: string;
  recargo?: string;
  adjuntos_count: number;
  orden_triptico_aoter?: string;
  synced_at: string;
  synced_by: string;
  status: 'synced' | 'error';
  error_message?: string;
}

