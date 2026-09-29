import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../src/lib/AuthContext';
import { supabase } from '../src/lib/supabase';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../src/lib/cropImage';
import { LEGACY_PERMISSIONS, checkAccess } from '../src/lib/permissions';

declare const __APP_VERSION__: string;

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, setMobileOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, signInAs, signOut, updateUser } = useAuth();
  const location = useLocation();

  // Alert Count State
  const [alertCount, setAlertCount] = useState(0);
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [loadingPermissions, setLoadingPermissions] = useState(true);

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    currentPassword: '',
    avatarUrl: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  // Cropper State
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [showCropper, setShowCropper] = useState(false);

  // Fullscreen State
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const sidebarVariants = {
    hidden: { x: -20, opacity: 0 },
    visible: { 
      x: 0, 
      opacity: 1, 
      transition: { 
        staggerChildren: 0.05,
        delayChildren: 0.2
      } 
    }
  };

  const linkVariants = {
    hidden: { x: -10, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  useEffect(() => {
    if (user) {
      setEditForm({
        name: user.name || '',
        email: user.email || '',
        password: '',
        confirmPassword: '',
        currentPassword: '',
        avatarUrl: user.avatarUrl || ''
      });

    }
  }, [user]);

  useEffect(() => {
    fetchPermissions();
  }, [user, location.pathname]);

  // Escuchar mensajes de actualización desde Electron
  useEffect(() => {
    if ((window as any).electronAPI?.onUpdateMessage) {
      (window as any).electronAPI.onUpdateMessage((message: string) => {
        setUpdateStatus(message);
        if (message.includes('última versión') || message.includes('Error') || message.includes('descargada')) {
          setTimeout(() => setUpdateStatus(null), 5000);
        }
      });
    }
  }, []);


  const fetchPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('value')
        .eq('key', 'role_permissions')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const parsed = JSON.parse(data[0].value);
        setPermissions({ ...LEGACY_PERMISSIONS, ...parsed });
      } else {
        // Si no hay datos en DB, usar legacy
        setPermissions(LEGACY_PERMISSIONS);
      }
    } catch (err) {
      console.error('Error fetching permissions in sidebar:', err);
      setPermissions(LEGACY_PERMISSIONS);
    } finally {
      setLoadingPermissions(false);
    }
  };

  const hasAccess = (sectionId: string) => {
    if (sectionId === 'tecnicos') {
      if (!user) return false;
      if (user.role === 'SuperAdmin' || user.role === 'Direccion' || user.role === 'Administrativo Direccion') return true;
      if (user.role === 'Tecnico' && user.has_tecnico_section_access) return true;
      return false;
    }
    return checkAccess(permissions, user?.role || '', sectionId, 'view');
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    // Si intenta cambiar la contraseña, validar que coincidan y que la actual sea válida
    if (editForm.password || editForm.confirmPassword) {
      if (editForm.password !== editForm.confirmPassword) {
        alert('Las nuevas contraseñas no coinciden');
        return;
      }
      if (!editForm.currentPassword) {
        alert('Debe ingresar su contraseña actual para realizar cambios de seguridad');
        return;
      }
    }

    setIsSaving(true);

    try {
      // 1. Si se solicitó cambio de clave, validar primero la actual y luego actualizar en Auth
      if (editForm.password && editForm.currentPassword) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: editForm.currentPassword
        });

        if (verifyErr) {
          alert('La contraseña actual es incorrecta');
          setIsSaving(false);
          return;
        }

        const { error: pwdErr } = await supabase.auth.updateUser({
          password: editForm.password
        });

        if (pwdErr) {
          throw new Error('Error al actualizar la contraseña: ' + pwdErr.message);
        }
      }

      // 2. Actualizar perfil en quirofano.users (nombre y avatar)
      const updateData: any = {
        name: editForm.name,
        avatar_url: editForm.avatarUrl
      };

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      const updatedUser = {
        ...user,
        name: editForm.name,
        avatarUrl: editForm.avatarUrl
      };

      updateUser(updatedUser);
      setShowProfileModal(false);
      alert('Perfil actualizado con éxito');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      alert(err.message || 'Error al actualizar el perfil');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setShowCropper(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleConfirmCrop = async () => {
    if (!imageToCrop || !user || !croppedAreaPixels) return;

    setIsSaving(true);
    try {
      const croppedImageBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);
      if (!croppedImageBlob) throw new Error('Could not crop image');

      const fileExt = 'jpeg';
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('app-assets')
        .upload(filePath, croppedImageBlob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('app-assets')
        .getPublicUrl(filePath);

      setEditForm(prev => ({ ...prev, avatarUrl: publicUrl }));
      setShowCropper(false);
      setImageToCrop(null);
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      alert('Error al subir la imagen recorte: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const fetchAlertCount = async () => {
    if (!user) {
      setAlertCount(0);
      return;
    }

    try {
      let query = supabase
        .from('system_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Active');

      if (user.role !== 'SuperAdmin') {
        query = query.eq('target_role', user.role);

        // v1.1.14: Filter by vendorId if Ortopedia
        if (user.role === 'Ortopedia' && user.vendorId && !user.can_view_all_vendors) {
          query = query.filter('target_vendor_id', 'is', null).or(`target_vendor_id.eq.${user.vendorId}`);
        } else if (user.role === 'Medico' && user.doctorId) {
          query = query.eq('target_doctor_id', user.doctorId);
        }
      }

      const { count } = await query;
      setAlertCount(count || 0);

    } catch (err) {
      console.error('Error fetching sidebar alert count:', err);
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative group ${isActive
      ? 'bg-primary/10 text-primary'
      : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'
    } ${isCollapsed ? 'justify-center' : ''}`;

  const iconClass = ({ isActive }: { isActive: boolean }) =>
    `material-symbols-outlined flex-shrink-0 transition-all ${isActive ? 'filled' : ''} ${isCollapsed ? 'text-2xl' : ''}`;

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-20 md:hidden responsive-mobile-backdrop animate-fadeIn backdrop-blur-sm"
          onClick={() => setMobileOpen && setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          responsive-sidebar
          flex-shrink-0 border-r border-slate-200 bg-white/90 backdrop-blur-md flex flex-col h-screen fixed md:relative z-50 transition-all duration-300 ease-in-out md:translate-x-0
          ${isCollapsed ? 'md:w-20' : 'md:w-64'}
          ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'}
        `}
      >
        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-9 bg-white border border-slate-200 text-slate-500 rounded-full p-1 shadow-sm hover:text-primary hover:border-primary transition-colors z-50 hidden md:flex items-center justify-center size-6 responsive-desktop-toggle"
        >
          <span className="material-symbols-outlined text-sm font-bold">
            {isCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileOpen && setMobileOpen(false)}
          className="absolute -right-3 top-20 bg-white border border-slate-200 text-slate-500 rounded-full p-1 shadow-sm md:hidden responsive-mobile-close flex items-center justify-center size-8"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>

        <div className="h-full flex flex-col p-4 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200 scroll-smooth">
          <div className="flex flex-col gap-4">
            {/* Brand */}
            <div className={`flex items-center px-2 py-2 transition-all ${isCollapsed ? 'justify-center gap-0' : 'gap-3'}`}>
              <div className={`flex items-center justify-center flex-shrink-0 ${isCollapsed ? 'w-10' : 'w-full px-2'}`}>
                <img
                  src="logo-iteo-azul.png"
                  alt="ITEO"
                  className={`transition-all duration-300 ${isCollapsed ? 'h-8 w-8 object-contain' : 'h-12 w-auto object-contain'}`}
                />
              </div>
            </div>

            {/* Quick Search Button (Command Palette Trigger) */}
            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
                window.dispatchEvent(event);
                if (setMobileOpen) setMobileOpen(false);
              }}
              title="Buscar (Ctrl + K)"
              className={`flex items-center gap-2 px-3 py-2 bg-slate-100/80 hover:bg-primary/10 hover:text-primary text-slate-500 rounded-xl transition-all border border-slate-200/60 group ${
                isCollapsed ? 'justify-center px-0' : 'justify-between'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-slate-400 group-hover:text-primary">search</span>
                {!isCollapsed && <span className="text-xs font-medium">Buscar...</span>}
              </div>
              {!isCollapsed && (
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 rounded shadow-2xs text-slate-500">
                  Ctrl K
                </kbd>
              )}
            </button>

            {/* Navigation Links */}
            <motion.nav 
              initial="hidden"
              animate="visible"
              variants={sidebarVariants}
              className="flex flex-col gap-1 mt-1"
            >
              {hasAccess('dashboard') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Tablero" : ""}>dashboard</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Tablero</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('medico') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/medico"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Perfil Médico" : ""}>medical_services</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Perfil Médico</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('admin_dashboard') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/admin-dashboard"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Tablero Admin" : ""}>admin_panel_settings</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Tablero Admin</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}



              {hasAccess('calendar') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/calendar"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Calendario" : ""}>calendar_today</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Calendario</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('consulting_rooms') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/consulting-rooms"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Consultorios" : ""}>meeting_room</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Consultorios</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('resident_shifts') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/resident-shifts"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Guardias" : ""}>event_available</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Guardias Residentes</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('kanban') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/kanban"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Planificación" : ""}>view_kanban</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Planificación</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('surgeries') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/surgeries"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Listado General" : ""}>table_rows</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Listado General</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('scanner') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/scanner"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Escanear Pulsera" : ""}>qr_code_scanner</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Escanear Pulsera</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('monitor') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/monitor"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Monitor en Vivo" : ""}>monitor_heart</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Monitor en Vivo</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('hospitalization') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/hospitalization"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Enfermería" : ""}>bed</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Enfermería</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('results') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/results"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Resultados" : ""}>analytics</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Resultados</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('audit') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/audit"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Auditoría" : ""}>history_edu</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Auditoría</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('billing') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/billing"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Facturación" : ""}>receipt_long</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Facturación</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('prequirurgicos') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/prequirurgicos"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Prequirúrgicos" : ""}>assignment_turned_in</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Prequirúrgicos</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('tecnicos') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/tecnicos"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Gestión de Técnicos" : ""}>engineering</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Gestión de Técnicos</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {(hasAccess('stock') || user?.role === 'Tecnico' || user?.role === 'SuperAdmin') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/stock"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Stock / Farmacia" : ""}>inventory_2</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Stock / Farmacia</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('error_logs') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/error-logs"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Logs de Errores" : ""}>bug_report</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Logs de Errores</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('settings') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/settings"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Configuración" : ""}>settings</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Configuración</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              {hasAccess('help') && (
                <motion.div variants={linkVariants}>
                  <NavLink
                    to="/help"
                    className={linkClass}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <span className={iconClass({ isActive })} title={isCollapsed ? "Ayuda y Soporte" : ""}>help</span>
                        {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">Ayuda y Soporte</p>}
                      </>
                    )}
                  </NavLink>
                </motion.div>
              )}

              <motion.div variants={linkVariants}>
                <button
                  onClick={() => {
                    if (!document.fullscreenElement) {
                      document.documentElement.requestFullscreen().catch((e) => {
                        console.error(`Error attempting to enable fullscreen mode: ${e.message} (${e.name})`);
                      });
                    } else {
                      if (document.exitFullscreen) {
                        document.exitFullscreen();
                      }
                    }
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative group text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 ${isCollapsed ? 'justify-center' : ''}`}
                >
                  <span className={`material-symbols-outlined flex-shrink-0 transition-all ${isCollapsed ? 'text-2xl' : ''}`} title={isCollapsed ? (isFullscreen ? "Salir Pantalla Completa" : "Pantalla Completa") : ""}>
                    {isFullscreen ? 'close_fullscreen' : 'fullscreen'}
                  </span>
                  {!isCollapsed && <p className="text-sm font-medium leading-normal whitespace-nowrap animate-fadeIn">{isFullscreen ? 'Salir Pantalla Completa' : 'Pantalla Completa'}</p>}
                </button>
              </motion.div>
            </motion.nav>
          </div>

          {/* Bottom User Profile */}
          <div
            onClick={() => user ? setShowProfileModal(true) : (async () => {
              const email = prompt('Ingrese el email del usuario para simular sesión:');
              if (email) await signInAs(email);
            })()}
            className={`flex items-center px-3 py-3 rounded-lg border border-slate-200 mt-auto cursor-pointer hover:bg-slate-50 transition-all ${isCollapsed ? 'justify-center border-transparent hover:border-slate-200' : 'gap-3'}`}
            title={user ? 'Mi Perfil / Cerrar Sesión' : 'Iniciar Sesión (Simulado)'}
          >
            <img
              src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`}
              alt="User"
              className="h-10 w-10 rounded-full object-cover flex-shrink-0 bg-slate-100"
            />
            <div className={`flex flex-col overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 ml-0' : 'w-auto opacity-100'}`}>
              <p className="text-sm font-medium truncate whitespace-nowrap font-bold">{user ? user.name : 'Simular Sesión'}</p>
              <p className="text-[10px] text-slate-500 truncate whitespace-nowrap uppercase tracking-tighter">{user ? user.role : 'Invitado'}</p>
            </div>
          </div>

          {/* Branding Lynx Consulting */}
          <div className={`flex flex-col items-center justify-center mt-4 mb-2 transition-all duration-300 ${isCollapsed ? 'opacity-80 scale-90' : 'opacity-100'}`}>
            <p className={`text-[9px] text-slate-400 mb-0.5 ${isCollapsed ? 'hidden' : 'block'}`}>desarrollado por</p>
            <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity cursor-default" title="Desarrollado por Lynx Consulting">
              <span className={`text-[10px] font-bold text-slate-500 uppercase tracking-tight ${isCollapsed ? 'hidden' : 'block'}`}>Lynx Consulting</span>
              <img
                src="lynx_logo_orange.png"
                alt="Lynx"
                className="h-8 w-auto object-contain"
              />
            </div>
            <p className={`text-[9px] text-slate-300 mt-1 font-mono tracking-wider ${isCollapsed ? 'hidden' : 'block'}`}>v{__APP_VERSION__}</p>
          </div>
        </div>
      </aside >

      {/* Profile Modal */}
      {
        showProfileModal && user && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Mi Perfil</h3>
                  <p className="text-xs text-slate-500">Gestione sus datos personales y preferencias.</p>
                </div>
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="size-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex flex-col gap-6">
                {/* Avatar Section */}
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <img
                      src={editForm.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                      alt="Avatar"
                      className="size-24 rounded-full object-cover border-4 border-white shadow-md ring-1 ring-slate-200"
                    />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <span className="material-symbols-outlined">photo_camera</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-400">Click para cambiar imagen</p>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nombre Completo</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">person</span>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl h-10 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Correo Electrónico (No editable)</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-300 text-lg">mail</span>
                      <input
                        type="email"
                        value={editForm.email}
                        readOnly
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl h-10 pl-10 pr-4 text-sm text-slate-500 cursor-not-allowed outline-none transition-all"
                        title="El correo electrónico no puede ser modificado por el usuario."
                      />
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 my-2"></div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5 ml-1">Contraseña Actual (Requerida para cambios)</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">lock_open</span>
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={editForm.currentPassword}
                        onChange={e => setEditForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                        placeholder="Ingrese su clave actual..."
                        className="w-full bg-white border border-slate-300 rounded-xl h-10 pl-10 pr-10 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showCurrentPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nueva Contraseña (Opcional)</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">lock</span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={editForm.password}
                        onChange={e => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Nueva contraseña..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl h-10 pl-10 pr-10 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Confirmar Nueva Contraseña</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">lock</span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={editForm.confirmPassword}
                        onChange={e => setEditForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Repita la contraseña..."
                        className={`w-full bg-slate-50 border rounded-xl h-10 pl-10 pr-10 text-sm focus:ring-2 outline-none transition-all ${editForm.password !== editForm.confirmPassword && editForm.confirmPassword ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:ring-primary/20 focus:border-primary'}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">
                          {showConfirmPassword ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                    </div>
                    {editForm.password !== editForm.confirmPassword && editForm.confirmPassword && (
                      <p className="text-[10px] text-red-500 mt-1 ml-1 animate-fadeIn">Las contraseñas no coinciden</p>
                    )}
                  </div>

                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 mt-4">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="w-full h-11 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    {isSaving ? (
                      <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">save</span>
                        Guardar Cambios
                      </>
                    )}
                  </button>

                  <div className="h-px bg-slate-100 w-full my-1"></div>

                  {/* Electron Update Button (Only if running in Electron) */}
                  {(window as any).electronAPI && (
                    <>
                      <button
                        onClick={async () => {
                          if ((window as any).electronAPI.checkForUpdates) {
                            setUpdateStatus('Iniciando búsqueda...');
                            await (window as any).electronAPI.checkForUpdates();
                          }
                        }}
                        className="w-full h-11 bg-blue-50 text-blue-600 font-bold rounded-xl border border-blue-100 flex items-center justify-center gap-2 hover:bg-blue-600 hover:text-white transition-all group"
                      >
                        <span className="material-symbols-outlined text-lg group-hover:text-white">system_update</span>
                        {updateStatus ? updateStatus.toUpperCase() : 'BUSCAR ACTUALIZACIONES'}
                      </button>
                      <div className="h-px bg-slate-100 w-full my-1"></div>
                    </>
                  )}

                  {/* Web / PWA Refresh Button */}
                  {!(window as any).electronAPI && (
                    <>
                      <button
                        onClick={async () => {
                          if ('caches' in window) {
                            try {
                              const keys = await caches.keys();
                              await Promise.all(keys.map(k => caches.delete(k)));
                            } catch (e) {
                              console.error('Error limpiando cachés:', e);
                            }
                          }
                          window.location.reload();
                        }}
                        className="w-full h-11 bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 flex items-center justify-center gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all group active:scale-98"
                      >
                        <span className="material-symbols-outlined text-lg group-hover:rotate-180 transition-transform text-slate-500 group-hover:text-blue-600">cached</span>
                        Recargar / Actualizar App
                      </button>
                      <div className="h-px bg-slate-100 w-full my-1"></div>
                    </>
                  )}

                  <button
                    onClick={() => {
                      signOut();
                      setShowProfileModal(false);
                    }}
                    className="w-full h-11 bg-white text-red-600 font-bold rounded-xl border border-red-100 flex items-center justify-center gap-2 hover:bg-red-50 transition-all"
                  >
                    <span className="material-symbols-outlined text-lg">logout</span>
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {/* Cropper Modal */}
      {
        showCropper && imageToCrop && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[110] flex flex-col items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[600px] border border-slate-200">
              {/* Cropper Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Ajustar Imagen</h3>
                  <p className="text-xs text-slate-500">Mueve y ajusta el zoom para centrar tu foto.</p>
                </div>
                <button
                  onClick={() => {
                    setShowCropper(false);
                    setImageToCrop(null);
                  }}
                  className="size-10 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Cropper Area */}
              <div className="flex-1 relative bg-slate-50">
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              </div>

              {/* Cropper Controls */}
              <div className="px-8 py-6 bg-white flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-slate-400">zoom_out</span>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="material-symbols-outlined text-slate-400">zoom_in</span>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCropper(false);
                      setImageToCrop(null);
                    }}
                    className="flex-1 h-12 bg-slate-50 text-slate-600 font-bold rounded-2xl border border-slate-200 hover:bg-slate-100 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmCrop}
                    disabled={isSaving}
                    className="flex-[2] h-12 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    {isSaving ? (
                      <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-lg">check_circle</span>
                        Aplicar Recorte
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
};

export default Sidebar;