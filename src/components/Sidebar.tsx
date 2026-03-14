import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    LayoutDashboard,
    ListChecks,
    Scale,
    Settings,
    ShieldCheck,
    MapPin,
    Plus,
    ChevronDown,
    ChevronUp,
    ShoppingCart,
    Tag,
    CloudRain,
    LogOut,
    ArrowLeftRight,
    Briefcase,
    Info,
    Users,
    ShoppingBag,
    FileText
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Sidebar.css';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { role, isSuperAdmin, userFincas, fincaId, setFincaId, refreshFincas, user, signOut } = useAuth();
    const [showFincas, setShowFincas] = useState(false);
    const [showTrabajoCampo, setShowTrabajoCampo] = useState(true);
    const [showInformacion, setShowInformacion] = useState(false);
    const [creatingFinca, setCreatingFinca] = useState(false);
    const [hayMercado, setHayMercado] = useState(false);
    const navigate = useNavigate();

    // Verificar si hay animales marcados con ok_ceba (se refresca cada 60 segundos)
    useEffect(() => {
        if (!fincaId) return;
        const checkMercado = async () => {
            const { count } = await supabase
                .from('animales')
                .select('id', { count: 'exact', head: true })
                .eq('id_finca', fincaId)
                .eq('ok_ceba', true)
                .eq('estado', 'activo');
            setHayMercado((count ?? 0) > 0);
        };
        checkMercado();
        const interval = setInterval(checkMercado, 60000);
        return () => clearInterval(interval);
    }, [fincaId]);

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    const handleCreateFinca = async () => {
        const nombre = prompt('Cual es el nombre de la nueva finca?');
        if (!nombre || !user) return;

        setCreatingFinca(true);
        try {
            let { data: orgs } = await supabase.from('organizaciones').select('id').eq('id_dueño', user.id).limit(1);
            let orgId = orgs?.[0]?.id;

            if (!orgId) {
                const { data: newOrg, error: orgErr } = await supabase
                    .from('organizaciones')
                    .insert({ nombre: 'Mi Organización', id_dueño: user.id })
                    .select()
                    .single();
                if (orgErr) throw orgErr;
                orgId = newOrg.id;
            }

            const { data: newFinca, error: fincaErr } = await supabase
                .from('fincas')
                .insert({ nombre, id_organizacion: orgId })
                .select()
                .single();
            if (fincaErr) throw fincaErr;

            const { error: permErr } = await supabase
                .from('permisos_finca')
                .insert({ id_usuario: user.id, id_finca: newFinca.id, rol: 'administrador' });
            if (permErr) throw permErr;

            await supabase.from('configuracion_kpi').insert({ id_finca: newFinca.id });

            alert('Finca creada exitosamente');
            await refreshFincas();
            setFincaId(newFinca.id);
            setShowFincas(false);
        } catch (err: any) {
            alert('Error creando finca: ' + err.message);
        } finally {
            setCreatingFinca(false);
        }
    };

    const currentFincaName = userFincas.find(f => f.id_finca === fincaId)?.nombre_finca || 'Selec. Finca';

    return (
        <>
            <div
                className={`sidebar-overlay ${isOpen ? 'show' : ''}`}
                onClick={onClose}
            />
            <aside className={`sidebar ${isOpen ? 'isOpen' : ''}`}>
                <div className="sidebar-section">
                    <div 
                        className="sidebar-section-header" 
                        onClick={() => setShowFincas(!showFincas)}
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            padding: '12px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <MapPin size={18} color="var(--primary)" style={{ flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {currentFincaName}
                            </span>
                        </div>
                        {showFincas ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>

                    {showFincas && (
                        <div className="finca-list" style={{ marginTop: '8px' }}>
                            {userFincas.map((f) => (
                                <button
                                    key={f.id_finca}
                                    className={`finca-item ${fincaId === f.id_finca ? 'finca-item--active' : ''}`}
                                    onClick={() => {
                                        setFincaId(f.id_finca);
                                        setShowFincas(false);
                                        if (window.innerWidth <= 1024) onClose();
                                    }}
                                >
                                    <MapPin size={16} />
                                    <span className="finca-name">{f.nombre_finca}</span>
                                    {fincaId === f.id_finca && <div className="active-dot" />}
                                </button>
                            ))}

                            {(role === 'administrador' || isSuperAdmin) && (
                                <button className="finca-add-btn" onClick={handleCreateFinca} disabled={creatingFinca}>
                                    <Plus size={16} />
                                    <span>{creatingFinca ? 'Creando...' : 'Nueva Finca'}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="sidebar-divider" />

                <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* DASHBOARD - Para Admin y Visualización */}
                    {(role === 'administrador' || role === 'observador') && (
                        <div style={{ marginBottom: '8px' }}>
                            <NavLink to="/" end onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                <span className="sidebar-icon"><LayoutDashboard size={20} /></span>
                                <span className="sidebar-label">Dashboard</span>
                            </NavLink>
                        </div>
                    )}

                    {/* TRABAJO DE CAMPO - Para Admin y Vaquero */}
                    {(role === 'administrador' || role === 'vaquero') && (
                        <div style={{ marginBottom: '8px' }}>
                            <div 
                                onClick={() => setShowTrabajoCampo(!showTrabajoCampo)}
                                style={{ 
                                    padding: '0 14px 8px', 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center', 
                                    cursor: 'pointer' 
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Briefcase size={16} style={{ opacity: 0.5 }} />
                                    <span className="section-title" style={{ fontSize: '0.75rem', opacity: 0.5, margin: 0 }}>TRABAJO DE CAMPO</span>
                                </div>
                                {showTrabajoCampo ? <ChevronUp size={14} style={{ opacity: 0.5 }} /> : <ChevronDown size={14} style={{ opacity: 0.5 }} />}
                            </div>
                            
                            {showTrabajoCampo && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <NavLink to="/lluvias" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><CloudRain size={20} /></span>
                                        <span className="sidebar-label">Lluvias</span>
                                    </NavLink>
                                    <NavLink to="/movimientos" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><ArrowLeftRight size={20} /></span>
                                        <span className="sidebar-label">Mover Potrerada</span>
                                    </NavLink>
                                    <NavLink to="/pesaje" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><Scale size={20} /></span>
                                        <span className="sidebar-label">Pesaje</span>
                                    </NavLink>
                                    <NavLink to="/compra" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><ShoppingCart size={20} /></span>
                                        <span className="sidebar-label">Compra</span>
                                    </NavLink>
                                    <NavLink to="/venta" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><Tag size={20} /></span>
                                        <span className="sidebar-label">Venta</span>
                                    </NavLink>
                                    <NavLink to="/historial-ventas" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><FileText size={20} /></span>
                                        <span className="sidebar-label">Historial Ventas</span>
                                    </NavLink>
                                    {hayMercado && (
                                        <NavLink to="/mercado" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`} style={{ position: 'relative' }}>
                                            <span className="sidebar-icon"><ShoppingBag size={20} /></span>
                                            <span className="sidebar-label">Mercado</span>
                                            <span style={{ marginLeft: 'auto', background: '#2e7d32', color: 'white', borderRadius: '10px', fontSize: '0.65rem', padding: '2px 7px', fontWeight: 'bold' }}>●</span>
                                        </NavLink>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* INFORMACIÓN - Para todos */}
                    <div style={{ marginBottom: '8px' }}>
                        <div 
                            onClick={() => setShowInformacion(!showInformacion)}
                            style={{ 
                                padding: '0 14px 8px', 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                cursor: 'pointer' 
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Info size={16} style={{ opacity: 0.5 }} />
                                <span className="section-title" style={{ fontSize: '0.75rem', opacity: 0.5, margin: 0 }}>INFORMACIÓN</span>
                            </div>
                            {showInformacion ? <ChevronUp size={14} style={{ opacity: 0.5 }} /> : <ChevronDown size={14} style={{ opacity: 0.5 }} />}
                        </div>

                        {showInformacion && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <NavLink to="/inventario" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                    <span className="sidebar-icon"><ListChecks size={20} /></span>
                                    <span className="sidebar-label">Animales</span>
                                </NavLink>
                                <NavLink to="/rotaciones" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                    <span className="sidebar-icon"><MapPin size={20} /></span>
                                    <span className="sidebar-label">Rotaciones</span>
                                </NavLink>
                                 {(role === 'administrador' || role === 'vaquero') && (
                                    <NavLink to="/potreradas" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                                        <span className="sidebar-icon"><Users size={20} /></span>
                                        <span className="sidebar-label">Potreradas</span>
                                    </NavLink>
                                )}
                            </div>
                        )}
                    </div>
                </nav>

                <div style={{ marginTop: 'auto', paddingTop: '24px' }}>
                    <div className="sidebar-divider" style={{ margin: '0 14px 16px' }} />
                    
                    <NavLink to="/configuracion" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                        <span className="sidebar-icon"><Settings size={20} /></span>
                        <span className="sidebar-label">Configuración</span>
                    </NavLink>

                    {isSuperAdmin && (
                        <NavLink to="/superadmin" onClick={() => { if (window.innerWidth <= 1024) onClose(); }} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link--active' : ''}`}>
                            <span className="sidebar-icon"><ShieldCheck size={20} /></span>
                            <span className="sidebar-label">Gestión Cuentas</span>
                        </NavLink>
                    )}
                    
                    <button className="sidebar-logout-btn" onClick={handleLogout} style={{ marginTop: '8px' }}>
                        <LogOut size={20} />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
