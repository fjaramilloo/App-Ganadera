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
    Tag
} from 'lucide-react';
import { useState } from 'react';
import './Sidebar.css';

interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    const { role, isSuperAdmin, userFincas, fincaId, setFincaId, refreshFincas, user } = useAuth();
    const [showFincas, setShowFincas] = useState(true);
    const [creatingFinca, setCreatingFinca] = useState(false);

    const navItems: NavItem[] = [
        { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
        { to: '/inventario', label: 'Animales', icon: <ListChecks size={20} /> },
        ...(role !== 'observador'
            ? [
                { to: '/compra', label: 'Compra', icon: <ShoppingCart size={20} /> },
                { to: '/venta', label: 'Venta', icon: <Tag size={20} /> },
                { to: '/pesaje', label: 'Pesaje', icon: <Scale size={20} /> }
            ]
            : []),
        ...(role === 'administrador'
            ? [{ to: '/configuracion', label: 'Ajustes', icon: <Settings size={20} /> }]
            : []),
        ...(isSuperAdmin
            ? [{ to: '/superadmin', label: 'Gestión Cuentas', icon: <ShieldCheck size={20} /> }]
            : []),
    ];

    const handleCreateFinca = async () => {
        const nombre = prompt('Cual es el nombre de la nueva finca?');
        if (!nombre || !user) return;

        setCreatingFinca(true);
        try {
            // Buscamos la primera organizacion del usuario o creamos una si no tiene
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

            // Crear la finca
            const { data: newFinca, error: fincaErr } = await supabase
                .from('fincas')
                .insert({ nombre, id_organizacion: orgId })
                .select()
                .single();
            if (fincaErr) throw fincaErr;

            // Asignar permiso como administrador
            const { error: permErr } = await supabase
                .from('permisos_finca')
                .insert({ id_usuario: user.id, id_finca: newFinca.id, rol: 'administrador' });
            if (permErr) throw permErr;

            // Crear configuración KPI por defecto
            await supabase.from('configuracion_kpi').insert({ id_finca: newFinca.id });

            alert('Finca creada exitosamente');
            await refreshFincas();
            setFincaId(newFinca.id);
        } catch (err: any) {
            alert('Error creando finca: ' + err.message);
        } finally {
            setCreatingFinca(false);
        }
    };

    return (
        <>
            {/* Overlay para móviles */}
            <div
                className={`sidebar-overlay ${isOpen ? 'show' : ''}`}
                onClick={onClose}
            />
            <aside className={`sidebar ${isOpen ? 'isOpen' : ''}`}>
                <div className="sidebar-section">
                    <div className="sidebar-section-header" onClick={() => setShowFincas(!showFincas)}>
                        <span className="section-title">MIS FINCAS</span>
                        {showFincas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {showFincas && (
                        <div className="finca-list">
                            {userFincas.map((f) => (
                                <button
                                    key={f.id_finca}
                                    className={`finca-item ${fincaId === f.id_finca ? 'finca-item--active' : ''}`}
                                    onClick={() => {
                                        setFincaId(f.id_finca);
                                        // En móvil, cerramos al cambiar de finca
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

                <nav className="sidebar-nav">
                    <span className="section-title" style={{ padding: '0 14px 8px', display: 'block', fontSize: '0.75rem', opacity: 0.5 }}>MENÚ PRINCIPAL</span>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === '/'}
                            onClick={() => {
                                if (window.innerWidth <= 1024) onClose();
                            }}
                            className={({ isActive }) =>
                                `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                            }
                        >
                            <span className="sidebar-icon">{item.icon}</span>
                            <span className="sidebar-label">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </aside>
        </>
    );
}
