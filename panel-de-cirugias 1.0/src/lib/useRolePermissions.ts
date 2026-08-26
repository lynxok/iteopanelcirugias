import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from './supabase';
import { LEGACY_PERMISSIONS, checkAccess } from './permissions';

// Caché en memoria a nivel módulo para evitar peticiones duplicadas durante la navegación
let memoryCachedPermissions: any = null;
let fetchPromise: Promise<any> | null = null;

export const loadPermissionsFromDB = async (): Promise<any> => {
  if (memoryCachedPermissions) return memoryCachedPermissions;

  if (!fetchPromise) {
    fetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('value')
          .eq('key', 'role_permissions')
          .order('updated_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0 && data[0].value) {
          memoryCachedPermissions = JSON.parse(data[0].value);
        } else {
          memoryCachedPermissions = LEGACY_PERMISSIONS;
        }
      } catch (err) {
        console.error('[useRolePermissions] Error loading permissions, using legacy:', err);
        memoryCachedPermissions = LEGACY_PERMISSIONS;
      } finally {
        fetchPromise = null;
      }
      return memoryCachedPermissions;
    })();
  }

  return fetchPromise;
};

export const useRolePermissions = () => {
  const { user, loading: authLoading } = useAuth();
  const [permissions, setPermissions] = useState<any>(memoryCachedPermissions);
  const [loading, setLoading] = useState<boolean>(!memoryCachedPermissions);

  useEffect(() => {
    let isMounted = true;
    if (!memoryCachedPermissions) {
      setLoading(true);
      loadPermissionsFromDB().then((perms) => {
        if (isMounted) {
          setPermissions(perms);
          setLoading(false);
        }
      });
    } else {
      setPermissions(memoryCachedPermissions);
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const hasAccess = (sectionId: string, requiredLevel: 'view' | 'edit' = 'view'): boolean => {
    if (!user) return false;

    const userRole = (user.role || '').toLowerCase();

    // 1. SuperAdmin y Dirección tienen pase libre a todo el sistema
    if (userRole === 'superadmin' || userRole === 'direccion') {
      return true;
    }

    // 2. Regla especial para sección de técnicos / instrumentadores
    if (sectionId === 'tecnicos') {
      if (user.role === 'SuperAdmin' || user.role === 'Direccion' || user.role === 'Administrativo Direccion') return true;
      if (user.role === 'Tecnico' && user.has_tecnico_section_access) return true;
      return false;
    }

    // 3. Regla especial para Detalle de Cirugía (/detail/:id):
    // Se permite a cualquier usuario con acceso a alguna sección operativa/clínica
    if (sectionId === 'detail') {
      const clinicalSections = ['surgeries', 'medico', 'calendar', 'kanban', 'hospitalization', 'dashboard', 'resident_shifts', 'monitor'];
      return clinicalSections.some(sec => checkAccess(permissions || LEGACY_PERMISSIONS, user.role, sec, 'view'));
    }

    // 4. Regla especial para visor de errores del sistema (/error-logs): restringido a administradores
    if (sectionId === 'error_logs') {
      return userRole === 'superadmin' || userRole === 'direccion';
    }

    // 5. Chequeo contra matriz de permisos configurada o legacy
    return checkAccess(permissions || LEGACY_PERMISSIONS, user.role, sectionId, requiredLevel);
  };

  return {
    permissions: permissions || LEGACY_PERMISSIONS,
    loading: authLoading || loading,
    hasAccess,
    user
  };
};
