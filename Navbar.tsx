import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, User, Leaf } from 'lucide-react';

export default function Navbar() {
    const { role, isSuperAdmin, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    const isActive = (path: string) => location.pathname === path ? 'active' : '';

    return (
        <nav className="navbar">
            <div className="nav-brand">
                <Leaf size={24} color="var(--primary-light)" />
                AgroGestión
            </div>
            <div className="nav-links">
                <Link to="/" className={`nav-link ${isActive('/')}`}>Dashboard</Link>
                <Link to="/inventario" className={`nav-link ${isActive('/inventario')}`}>Inventario</Link>
                {role !== 'observador' && (
                    <Link to="/pesaje" className={`nav-link ${isActive('/pesaje')}`}>Pesaje</Link>
                )}
                {role === 'administrador' && (
                    <Link to="/configuracion" className={`nav-link ${isActive('/configuracion')}`}>Ajustes</Link>
                )}
                {isSuperAdmin && (
                    <Link to="/superadmin" className={`nav-link ${isActive('/superadmin')}`} style={{ color: 'var(--secondary)' }}>Gestión Cuentas</Link>
                )}
            </div>
            <div className="nav-user">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                    <User size={18} />
                    <span style={{ textTransform: 'capitalize', fontSize: '0.9em' }}>{role || 'Usuario'}</span>
                </div>
                <button onClick={handleLogout} className="btn-icon" title="Cerrar sesión">
                    <LogOut size={20} />
                </button>
            </div>
        </nav>
    );
}
