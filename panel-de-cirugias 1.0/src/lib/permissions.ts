export interface PermissionConfig {
  access: 'none' | 'view' | 'edit';
  fields?: Record<string, boolean>;
}

export const LEGACY_PERMISSIONS: Record<string, Record<string, PermissionConfig>> = {
  'Administrativo': {
    'dashboard': { access: 'edit' },
    'admin_dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'consulting_rooms': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Administrativo ART': {
    'dashboard': { access: 'edit' },
    'admin_dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'consulting_rooms': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Administrativo de Guardias': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'consulting_rooms': { access: 'view' },
    'surgeries': { access: 'edit' }, // Controlado por creador de forma interna
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Administrativo Direccion': {
    'dashboard': { access: 'edit' },
    'admin_dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'consulting_rooms': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Anestesista': {
    'dashboard': { access: 'edit' },
    'medico': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Auditoria': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Caja': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Cirujano': {
    'dashboard': { access: 'edit' },
    'medico': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit', fields: { 'quirofano_asignado': false, 'obra_social': false, 'fecha_cirugia': false } },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Direccion': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'consulting_rooms': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Enfermeria': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Facturacion': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Farmacia': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Gerencia': {
    'dashboard': { access: 'edit' },
    'admin_dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Internacion': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Medico': {
    'dashboard': { access: 'edit' },
    'medico': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Mucama': {
    'dashboard': { access: 'view' },
    'monitor': { access: 'view' },
    'help': { access: 'view' }
  },
  'Oficina ART': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Ortopedia': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Personal': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'RRHH': {},
  'Recepcion': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Residente': {
    'medico': { access: 'edit' },
    'calendar': { access: 'edit' },
    'resident_shifts': { access: 'edit', fields: { 'can_edit_shifts': true } },
    'scanner': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Tecnico': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'stock': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Ventas': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'view' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'Quirofano': {
    'dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'stock': { access: 'edit' },
    'help': { access: 'edit' }
  },
  'SuperAdmin': {
    'dashboard': { access: 'edit' },
    'medico': { access: 'edit' },
    'admin_dashboard': { access: 'edit' },
    'alerts': { access: 'edit' },
    'calendar': { access: 'edit' },
    'consulting_rooms': { access: 'edit' },
    'resident_shifts': { access: 'edit' },
    'kanban': { access: 'edit' },
    'surgeries': { access: 'edit' },
    'scanner': { access: 'edit' },
    'monitor': { access: 'edit' },
    'hospitalization': { access: 'edit' },
    'results': { access: 'edit' },
    'audit': { access: 'edit' },
    'billing': { access: 'edit' },
    'stock': { access: 'edit' },
    'error_logs': { access: 'edit' },
    'settings': { access: 'edit' },
    'help': { access: 'edit' }
  }
};

export const checkAccess = (
  rolePermissions: any,
  role: string,
  sectionId: string,
  requiredLevel: 'view' | 'edit' = 'view'
): boolean => {
  if (!role) return false;
  if (role.toLowerCase() === 'superadmin') return true;

  let perms = null;
  const roleKey = Object.keys(rolePermissions || {}).find(
    k => k.toLowerCase() === role.toLowerCase()
  );
  if (roleKey) {
    perms = rolePermissions[roleKey];
  } else {
    // Fallback de seguridad al diccionario LEGACY_PERMISSIONS embebido
    const legacyKey = Object.keys(LEGACY_PERMISSIONS).find(
      k => k.toLowerCase() === role.toLowerCase()
    );
    if (legacyKey) {
      perms = LEGACY_PERMISSIONS[legacyKey];
    }
  }

  if (!perms) return false;

  // 1. Caso Estilo Viejo: Array de strings
  if (Array.isArray(perms)) {
    return perms.includes(sectionId);
  }

  // 2. Caso Estilo Nuevo: Objeto estructurado
  if (typeof perms === 'object') {
    const config = perms[sectionId];
    if (!config) return false;
    
    if (requiredLevel === 'view') {
      return config.access === 'view' || config.access === 'edit';
    }
    return config.access === 'edit';
  }

  return false;
};

export const checkFieldPermission = (
  rolePermissions: any,
  role: string,
  sectionId: string,
  fieldId: string
): boolean => {
  if (!role) return false;
  if (role.toLowerCase() === 'superadmin') return true;

  const roleKey = Object.keys(rolePermissions || {}).find(
    k => k.toLowerCase() === role.toLowerCase()
  );
  if (!roleKey) return true; // Por defecto editable si no hay restricciones

  const perms = rolePermissions[roleKey];
  if (!perms || Array.isArray(perms)) return true; // Estilo viejo: editable por defecto

  const config = perms[sectionId];
  if (!config) return false;
  if (config.access !== 'edit') return false;
  if (!config.fields) return true;
  return config.fields[fieldId] !== false; // Solo es falso si explícitamente se configuró como false
};

export const SECTION_FIELDS: Record<string, { id: string; label: string }[]> = {
  'surgeries': [
    { id: 'diagnostico', label: 'Diagnóstico' },
    { id: 'quirofano_asignado', label: 'Quirófano Asignado' },
    { id: 'obra_social', label: 'Obra Social (Cobertura)' },
    { id: 'fecha_cirugia', label: 'Fecha de la Cirugía' },
    { id: 'materiales', label: 'Materiales Requeridos' }
  ],
  'resident_shifts': [
    { id: 'can_edit_shifts', label: 'Editar turnos de guardia' }
  ]
};
