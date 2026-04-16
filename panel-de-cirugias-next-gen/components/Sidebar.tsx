import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../src/lib/AuthContext';
import { supabase } from '../src/lib/supabase';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../src/lib/cropImage';

interface SidebarProps {
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, setMobileOpen }) => {
  const [isCollapsed, setIsCollapsed] = useState(window.innerWidth >= 768);
  const { user, signInAs, signOut, updateUser } = useAuth();
  const location = useLocation();

  // Alert Count State
  const [alertCount, setAlertCount] = useState(0);

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    avatarUrl: ''
  });
  const [isSaving, setIsSaving] = useState(false);

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

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  useEffect(() => {
    if (user) {
      setEditForm({
        name: user.name || '',
        email: user.email || '',
        password: user.password || '',
        avatarUrl: user.avatarUrl || ''
      });
    }
  }, [user]);

  useEffect(() => {
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 60000);
    return () => clearInterval(interval);
  }, [user, location.pathname]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: editForm.name,
          email: editForm.email,
          password: editForm.password,
          avatar_url: editForm.avatarUrl
        })
        .eq('id', user.id);

      if (error) throw error;

      const updatedUser = {
        ...user,
        name: editForm.name,
        email: editForm.email,
        password: editForm.password,
        avatarUrl: editForm.avatarUrl
      };

      updateUser(updatedUser);
      setShowProfileModal(false);
      alert('Perfil actualizado con éxito');
    } catch (err: any) {
      console.error('Error updating profile:', err);
      alert('Error al actualizar el perfil: ' + err.message);
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
      }

      const { count } = await query;
      setAlertCount(count || 0);

    } catch (err) {
      console.error('Error fetching sidebar alert count:', err);
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 relative group ${isActive
      ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-[1.02]'
      : 'text-slate-500 hover:bg-white/60 hover:text-slate-900 hover:shadow-sm'
    } ${isCollapsed ? 'justify-center' : ''}`;

  const iconClass = ({ isActive }: { isActive: boolean }) =>
    `material-symbols-outlined flex-shrink-0 transition-all ${isActive ? 'filled' : ''} ${isCollapsed ? 'text-2xl' : ''}`;

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-20 md:hidden animate-fadeIn backdrop-blur-sm"
          onClick={() => setMobileOpen && setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          flex-shrink-0 border-r border-white/50 bg-white/80 backdrop-blur-2xl flex flex-col h-screen fixed md:relative z-50 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:translate-x-0
          ${isCollapsed ? 'md:w-20' : 'md:w-[280px]'}
          ${mobileOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-[280px]'}
        `}
      >
        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-9 bg-white border border-slate-200 text-slate-500 rounded-full p-1 shadow-sm hover:text-primary hover:border-primary transition-colors z-50 hidden md:flex items-center justify-center size-6"
        >
          <span className="material-symbols-outlined text-sm font-bold">
            {isCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={() => setMobileOpen && setMobileOpen(false)}
          className="absolute -right-3 top-20 bg-white border border-slate-200 text-slate-500 rounded-full p-1 shadow-sm md:hidden flex items-center justify-center size-8"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>

        <div className="h-full flex flex-col p-4 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200 scroll-smooth">
          <div className="flex flex-col gap-4">
            {/* Brand */}
            <div className={`flex items-center px-2 py-2 transition-all ${isCollapsed ? 'justify-center gap-0' : 'gap-3'}`}>
              <div className={`flex items-center justify-center flex-shrink-0 ${isCollapsed ? 'w-10' : 'w-full px-2'}`}>
                <img
                  src="/logo iteo azul.png"
                  alt="ITEO"
                  className={`transition-all duration-300 ${isCollapsed ? 'h-8 w-8 object-contain' : 'h-12 w-auto object-contain'}`}
                />
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1 mt-4">
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

              <NavLink
                to="/alerts"
                className={linkClass}
                onClick={() => setMobileOpen && setMobileOpen(false)}
              >
                {({ isActive }) => (
                  <>
                    <div className="relative flex items-center justify-center">
                      <span className={`${iconClass({ isActive })} ${!isActive ? 'text-red-500' : ''}`} title={isCollapsed ? "Centro de Alertas" : ""}>notifications_active</span>
                      {/* Collapsed Badge (Dot) */}
                      {isCollapsed && alertCount > 0 && !isActive && (
                        <span className="absolute top-0 right-0 -mt-1 -mr-1 size-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="flex justify-between items-center w-full animate-fadeIn overflow-hidden">
                        <p className="text-sm font-medium leading-normal whitespace-nowrap">Centro de Alertas</p>
                        {alertCount > 0 && !isActive && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full font-bold ml-2">{alertCount}</span>}
                      </div>
                    )}
                  </>
                )}
              </NavLink>

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
              {user?.role !== 'Medico' && (
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
              )}
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
              {user?.role !== 'Ortopedia' && (
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
              )}
              {user?.role !== 'Medico' && user?.role !== 'Internacion' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && user?.role !== 'Oficina ART' && (
                <>
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
                  {user?.role === 'SuperAdmin' && (
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
                  )}
                </>
              )}
              {user?.role !== 'Internacion' && user?.role !== 'Medico' && user?.role !== 'Tecnico' && user?.role !== 'Ortopedia' && user?.role !== 'Oficina ART' && (
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
              )}
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
            </nav>
          </div>

          {/* Bottom User Profile */}
          <div
            onClick={() => user ? setShowProfileModal(true) : (async () => {
              const email = prompt('Ingrese el email del usuario para simular sesión:');
              if (email) await signInAs(email);
            })()}
            className={`glass-card flex items-center px-3 py-3 rounded-xl mt-auto cursor-pointer hover:bg-white/80 transition-all group ${isCollapsed ? 'justify-center' : 'gap-3'}`}
            title={user ? 'Mi Perfil / Cerrar Sesión' : 'Iniciar Sesión (Simulado)'}
          >
            <img
              src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random`}
              alt="User"
              className="h-10 w-10 rounded-full object-cover flex-shrink-0 bg-slate-100 ring-2 ring-white"
            />
            <div className={`flex flex-col overflow-hidden transition-all duration-300 ${isCollapsed ? 'w-0 opacity-0 ml-0' : 'w-auto opacity-100'}`}>
              <p className="text-sm font-bold truncate whitespace-nowrap text-slate-900 group-hover:text-primary transition-colors">{user ? user.name : 'Simular Sesión'}</p>
              <p className="text-[10px] text-slate-500 truncate whitespace-nowrap uppercase tracking-wider font-medium">{user ? user.role : 'Invitado'}</p>
            </div>
          </div>

          {/* Branding Lynx Consulting */}
          <div className={`flex flex-col items-center justify-center mt-4 mb-2 transition-all duration-300 ${isCollapsed ? 'opacity-80 scale-90' : 'opacity-100'}`}>
            <p className={`text-[9px] text-slate-400 mb-0.5 ${isCollapsed ? 'hidden' : 'block'}`}>desarrollado por</p>
            <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity cursor-default" title="Desarrollado por Lynx Consulting">
              <span className={`text-[10px] font-bold text-slate-500 uppercase tracking-tight ${isCollapsed ? 'hidden' : 'block'}`}>Lynx Consulting</span>
              <img
                src="/lynx_logo_orange.png"
                alt="Lynx"
                className="h-8 w-auto object-contain"
              />
            </div>
            <p className={`text-[9px] text-slate-300 mt-1 font-mono tracking-wider ${isCollapsed ? 'hidden' : 'block'}`}>v1.2.5</p>
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Correo Electrónico</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">mail</span>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl h-10 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Contraseña</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-lg">lock</span>
                      <input
                        type="password"
                        value={editForm.password}
                        onChange={e => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Nueva contraseña..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl h-10 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </div>
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