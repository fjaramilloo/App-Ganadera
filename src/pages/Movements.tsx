import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeftRight, Save } from 'lucide-react';

export default function Movements() {
    const { fincaId, role } = useAuth();
    const isAdminOrCowboy = role === 'administrador' || role === 'vaquero';

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');

    const [potreradas, setPotreradas] = useState<{ id: string, nombre: string, id_rotacion: string | null }[]>([]);
    const [rotaciones, setRotaciones] = useState<{ id: string, nombre: string, potreros: { id: string, nombre: string }[] }[]>([]);
    
    // Formulary state
    const [selectedPotreradaId, setSelectedPotreradaId] = useState('');
    const [currentMovementId, setCurrentMovementId] = useState<string | null>(null);
    const [currentPotrero, setCurrentPotrero] = useState<{ id: string, nombre: string, id_rotacion: string | null } | null>(null);
    
    const [selectedTargetRotacionId, setSelectedTargetRotacionId] = useState('');
    const [selectedTargetPotreroId, setSelectedTargetPotreroId] = useState('');
    const [fechaMovimiento, setFechaMovimiento] = useState(new Date().toISOString().split('T')[0]);

    const [rotacionMode, setRotacionMode] = useState<'misma' | 'cambiar' | null>(null);

    useEffect(() => {
        if (!fincaId) return;
        fetchData();
        // eslint-disable-next-line
    }, [fincaId]);

    const fetchData = async () => {
        // Fetch potreradas
        const { data: potreradasData } = await supabase
            .from('potreradas')
            .select('id, nombre, id_rotacion')
            .eq('id_finca', fincaId)
            .order('nombre');
        
        if (potreradasData) setPotreradas(potreradasData);

        // Fetch rotaciones con potreros
        const { data: rotacionesData } = await supabase
            .from('rotaciones')
            .select(`
                id, 
                nombre,
                potreros (id, nombre)
            `)
            .eq('id_finca', fincaId)
            .order('nombre');
            
        if (rotacionesData) setRotaciones(rotacionesData as any);
    };

    // Cuando se selecciona una potrerada, buscar su último movimiento abierto
    useEffect(() => {
        if (!selectedPotreradaId || !fincaId) {
            setCurrentMovementId(null);
            setCurrentPotrero(null);
            setSelectedTargetRotacionId('');
            setSelectedTargetPotreroId('');
            return;
        }

        const fetchCurrentState = async () => {
            const { data } = await supabase
                .from('movimientos_potreros')
                .select(`
                    id, 
                    id_potrero,
                    fecha_entrada,
                    potreros (id, nombre, id_rotacion)
                `)
                .eq('id_potrerada', selectedPotreradaId)
                .is('fecha_salida', null)
                .order('fecha_entrada', { ascending: false })
                .limit(1)
                .single();

            const pObj = potreradas.find(p => p.id === selectedPotreradaId);

            if (data && data.potreros) {
                const potreroData = data.potreros as any;
                setCurrentMovementId(data.id);
                setCurrentPotrero({
                    id: data.id_potrero,
                    nombre: potreroData.nombre,
                    id_rotacion: potreroData.id_rotacion
                });
                
                // Si la potrerada tiene rotación asginada, usar esa. Si no, usar la del potrero actual.
                const targetRotId = pObj?.id_rotacion || potreroData.id_rotacion;
                if (targetRotId) {
                    setSelectedTargetRotacionId(targetRotId);
                    setRotacionMode('misma');
                }
            } else {
                setCurrentMovementId(null);
                setCurrentPotrero(null);
                if (pObj?.id_rotacion) {
                    setSelectedTargetRotacionId(pObj.id_rotacion);
                    setRotacionMode('misma');
                } else {
                    setSelectedTargetRotacionId('');
                    setRotacionMode(null);
                }
            }
            setSelectedTargetPotreroId('');
            setMsjExito('');
            setMsjError('');
            setRotacionMode(null);
        }; fetchCurrentState();
    }, [selectedPotreradaId, fincaId, potreradas]);

    const handleSaveMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        setMsjExito('');
        setMsjError('');

        if (!fincaId || !selectedPotreradaId || !selectedTargetPotreroId || !fechaMovimiento) {
            setMsjError('Por favor complete todos los campos obligatorios.');
            return;
        }

        if (currentPotrero && currentPotrero.id === selectedTargetPotreroId) {
            setMsjError('El potrero destino no puede ser el mismo potrero actual.');
            return;
        }

        setLoading(true);
        try {
            // 1. Si hay un movimiento actual (fecha_salida is null), actualizarlo con la fecha actual como fecha de salida.
            if (currentMovementId) {
                const { error: errUpdate } = await supabase
                    .from('movimientos_potreros')
                    .update({ fecha_salida: fechaMovimiento })
                    .eq('id', currentMovementId);
                
                if (errUpdate) throw errUpdate;
            }

            // 2. Insertar nuevo movimiento
            const { error: errInsert } = await supabase
                .from('movimientos_potreros')
                .insert({
                    id_finca: fincaId,
                    id_potrerada: selectedPotreradaId,
                    id_potrero: selectedTargetPotreroId,
                    fecha_entrada: fechaMovimiento
                });
            
            if (errInsert) throw errInsert;

            // 3. Actualizar el id_potrero_actual de los animales que pertenecen a esta potrerada
            const { error: errAnimals } = await supabase
                .from('animales')
                .update({ id_potrero_actual: selectedTargetPotreroId })
                .eq('id_potrerada', selectedPotreradaId);
            
            if (errAnimals) throw errAnimals;

            setMsjExito('Potrerada movida exitosamente.');
            
            // Refrescar el estado actual simulando re-selección
            const potrId = selectedPotreradaId;
            setSelectedPotreradaId('');
            setTimeout(() => setSelectedPotreradaId(potrId), 100);

        } catch (err: any) {
            setMsjError('Error al guardar el movimiento: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const targetRotacion = rotaciones.find(r => r.id === selectedTargetRotacionId);

    return (
        <div className="page-container" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'left', marginBottom: '32px' }}>
                <ArrowLeftRight size={32} /> Movimientos de Potreradas
            </h1>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div className="card">
                <form onSubmit={handleSaveMovement} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Seleccionar Potrerada *</label>
                        <select 
                            value={selectedPotreradaId} 
                            onChange={(e) => setSelectedPotreradaId(e.target.value)}
                            required
                        >
                            <option value="">-- Seleccione --</option>
                            {potreradas.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                        </select>
                        {!isAdminOrCowboy && <p style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '8px' }}>No tienes permisos para realizar movimientos.</p>}
                    </div>

                    {selectedPotreradaId && (
                        <>
                            <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ubicación Actual</p>
                                <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', color: 'var(--primary-light)', fontSize: '1.1rem' }}>
                                    {currentPotrero ? currentPotrero.nombre : 'Sin potrero asignado'}
                                </p>
                            </div>

                            {/* Lógica Simplificada: Si hay rotación asignada o detectada, solo mostrar potreros */}
                            {(!potreradas.find(p => p.id === selectedPotreradaId)?.id_rotacion && !currentPotrero?.id_rotacion) && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>¿A dónde se moverá la potrerada?</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setRotacionMode('misma');
                                                setSelectedTargetRotacionId(currentPotrero?.id_rotacion || '');
                                                setSelectedTargetPotreroId('');
                                            }}
                                            style={{ 
                                                flex: 1, 
                                                backgroundColor: rotacionMode === 'misma' ? 'var(--primary)' : 'transparent',
                                                border: rotacionMode === 'misma' ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.2)',
                                                color: rotacionMode === 'misma' ? 'white' : 'var(--text-muted)',
                                                padding: '12px'
                                            }}
                                        >
                                            Misma rotación
                                        </button>
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setRotacionMode('cambiar');
                                                setSelectedTargetRotacionId('');
                                                setSelectedTargetPotreroId('');
                                            }}
                                            style={{ 
                                                flex: 1, 
                                                backgroundColor: rotacionMode === 'cambiar' ? 'var(--primary)' : 'transparent',
                                                border: rotacionMode === 'cambiar' ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.2)',
                                                color: rotacionMode === 'cambiar' ? 'white' : 'var(--text-muted)',
                                                padding: '12px'
                                            }}
                                        >
                                            Cambiar rotación
                                        </button>
                                    </div>
                                </div>
                            )}

                            {rotacionMode === 'cambiar' && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Seleccionar Nueva Rotación *</label>
                                    <select 
                                        value={selectedTargetRotacionId} 
                                        onChange={(e) => {
                                            setSelectedTargetRotacionId(e.target.value);
                                            setSelectedTargetPotreroId('');
                                        }}
                                        required
                                    >
                                        <option value="">-- Seleccione Rotación --</option>
                                        {rotaciones.map(r => (
                                            <option key={r.id} value={r.id}>{r.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {selectedTargetRotacionId && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Potrero Destino *</label>
                                    <select 
                                        value={selectedTargetPotreroId} 
                                        onChange={(e) => setSelectedTargetPotreroId(e.target.value)}
                                        required
                                        disabled={!targetRotacion || !targetRotacion.potreros || targetRotacion.potreros.length === 0}
                                    >
                                        <option value="">-- Seleccione Potrero Destino --</option>
                                        {(targetRotacion ? targetRotacion.potreros : [])
                                            .filter(p => p.id !== currentPotrero?.id)
                                            .map(p => (
                                                <option key={p.id} value={p.id}>{p.nombre}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                            )}

                            {selectedTargetPotreroId && (
                                <>
                                    <div style={{ opacity: 0.6 }}>
                                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Fecha de Movimiento</label>
                                        <input 
                                            type="date"
                                            value={fechaMovimiento}
                                            onChange={e => setFechaMovimiento(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={loading || !selectedTargetPotreroId || !selectedPotreradaId || !isAdminOrCowboy}
                                        style={{ marginTop: '12px', padding: '14px' }}
                                    >
                                        {loading ? 'Guardando...' : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Save size={20}/> Registrar Movimiento</span>}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </form>
            </div>
        </div>
    );
}
