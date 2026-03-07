import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Building2, UserPlus } from 'lucide-react';

export default function SuperAdmin() {
    const { isSuperAdmin } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [org, setOrg] = useState('');
    const [finca, setFinca] = useState('');
    const [ubicacion, setUbicacion] = useState('');

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    if (!isSuperAdmin) {
        return <div className="page-container text-center text-error">Acceso exclusivo para Super Administradores.</div>;
    }

    const crearAdministrador = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMsjExito('');
        setMsjError('');

        try {
            if (password.length < 6) {
                throw new Error("La contraseña debe tener al menos 6 caracteres");
            }

            const { error } = await supabase.rpc('crear_dueno_finca', {
                p_email: email,
                p_password: password,
                p_nombre_organizacion: org,
                p_nombre_finca: finca,
                p_ubicacion_finca: ubicacion
            });

            if (error) {
                throw new Error(error.message || 'Error al ejecutar la creación en Supabase');
            }

            setMsjExito(`¡Usuario ${email} creado correctamente con su propia Finca asignada!`);
            setEmail('');
            setPassword('');
            setOrg('');
            setFinca('');
            setUbicacion('');

        } catch (err: any) {
            setMsjError(err.message || 'Error no controlado al intentar crear cuenta.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container" style={{ maxWidth: '800px' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center', color: 'var(--secondary)' }}>
                <UserPlus size={36} /> Panel de Super Administrador
            </h1>

            <p className="text-center" style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
                Desde aquí puedes crear nuevas cuentas maestras (Administradores/Dueños).
                El sistema creará automáticamente su Empresa y Finca principal.
            </p>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div className="error-message text-center" style={{ fontWeight: 'bold' }}>{msjError}</div>}

            <div className="glass-panel card">
                <form onSubmit={crearAdministrador} className="grid grid-2">

                    <div style={{ paddingRight: '12px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ color: 'var(--primary-light)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <UserPlus size={20} /> Datos del Usuario
                        </h3>

                        <label>Correo Electrónico del Administrador</label>
                        <input
                            type="email"
                            placeholder="dueño@finca.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={loading}
                        />

                        <label>Contraseña Temporal</label>
                        <input
                            type="text"
                            placeholder="Asigna una contraseña segura"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            disabled={loading}
                        />
                    </div>

                    <div style={{ paddingLeft: '12px' }}>
                        <h3 style={{ color: 'var(--primary-light)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Building2 size={20} /> Datos de la Empresa
                        </h3>

                        <label>Nombre de la Organización / Empresa Ganadera</label>
                        <input
                            type="text"
                            placeholder="Ej. Inversiones Agropecuarias S.A."
                            value={org}
                            onChange={(e) => setOrg(e.target.value)}
                            required
                            disabled={loading}
                        />

                        <label>Nombre de la Finca Inicial</label>
                        <input
                            type="text"
                            placeholder="Ej. Hacienda La Esperanza"
                            value={finca}
                            onChange={(e) => setFinca(e.target.value)}
                            required
                            disabled={loading}
                        />

                        <label>País / Departamento (Ubicación)</label>
                        <input
                            type="text"
                            placeholder="Ej. Colombia, Antioquia"
                            value={ubicacion}
                            onChange={(e) => setUbicacion(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div style={{ gridColumn: '1 / -1', marginTop: '16px' }}>
                        <button type="submit" disabled={loading} style={{ backgroundColor: 'var(--secondary)', color: '#000' }}>
                            {loading ? 'Procesando...' : 'Crear Dueño de Finca'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
