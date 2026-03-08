import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Leaf } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { user } = useAuth();

    if (user) {
        return <Navigate to="/" replace />;
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) {
                setError(error.message);
            }
        } catch (err: any) {
            setError(err.message || "Ocurrió un error al intentar iniciar sesión");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-box glass-panel">
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <Leaf size={48} color="var(--primary-light)" />
                    <h1 className="title" style={{ marginBottom: 0, marginTop: '16px' }}>AgroGestión</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Panel de Control Ganadero</p>
                </div>

                {error && <div className="error-message text-center">{error}</div>}

                <form onSubmit={handleLogin}>
                    <label>Correo Electrónico</label>
                    <input
                        type="email"
                        autoComplete="email"
                        placeholder="ejemplo@finca.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <label>Contraseña</label>
                    <input
                        type="password"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    <button type="submit" disabled={loading}>
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>
                </form>
            </div>
        </div>
    );
}
