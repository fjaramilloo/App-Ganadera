import { Leaf, LogOut, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Topbar.css';

export default function Topbar() {
    const { role, isSuperAdmin, signOut } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    const getRolLabel = () => {
        if (isSuperAdmin) return 'Super Admin';
        if (role === 'administrador') return 'Administrador';
        if (role === 'vaquero') return 'Vaquero';
        if (role === 'observador') return 'Observador';
        return 'Usuario';
    };

    return (
        <header className="topbar">
            <div className="topbar-brand">
                <Leaf size={26} className="topbar-icon" />
                <span className="topbar-title">AgroGestión</span>
            </div>

            <div className="topbar-right">
                <div className="topbar-user">
                    <div className="topbar-avatar">
                        <User size={18} />
                    </div>
                    <div className="topbar-user-info">
                        <span className="topbar-user-role">{getRolLabel()}</span>
                    </div>
                </div>

                <button className="topbar-logout-btn" onClick={handleLogout} title="Cerrar sesión">
                    <LogOut size={20} />
                    <span>Salir</span>
                </button>
            </div>
        </header>
    );
}
