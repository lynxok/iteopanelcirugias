import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRolePermissions } from '../src/lib/useRolePermissions';

interface RoleProtectedRouteProps {
  sectionId: string;
  requiredLevel?: 'view' | 'edit';
  children: React.ReactNode;
}

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({
  sectionId,
  requiredLevel = 'view',
  children,
}) => {
  const { user, loading, hasAccess } = useRolePermissions();

  // 1. Mientras se verifique la sesión de Supabase o los permisos, mostrar el spinner
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
            Verificando permisos...
          </p>
        </div>
      </div>
    );
  }

  // 2. Si no hay usuario autenticado, redirigir inmediatamente a login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Evaluar permisos de acceso para la sección solicitada
  const isAllowed = hasAccess(sectionId, requiredLevel);

  if (!isAllowed) {
    console.warn(
      `[Seguridad RBAC] Acceso no autorizado denegado a la ruta/sección '${sectionId}' para el usuario ${user.email} (Rol: '${user.role}'). Redirigiendo a vista permitida.`
    );
    // Redirigir a "/" donde HomeRedirect calculará de forma fluida su primera sección autorizada
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default RoleProtectedRoute;
