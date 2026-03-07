import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Tag, Trash2, CheckCircle2, Calendar, Search, AlertCircle, Plus } from 'lucide-react';

interface AnimalVenta {
    numero_chapeta: string;
    peso_salida: string;
    id_animal?: string;
    validado: boolean;
    error?: string;
}

export default function Sales() {
    const { fincaId, role } = useAuth();
    const [cantidad, setCantidad] = useState('1');
    const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().split('T')[0]);
    const [animales, setAnimales] = useState<AnimalVenta[]>([]);

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    const generarFilas = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(cantidad);
        if (isNaN(num) || num <= 0) return;

        const nuevasFilas: AnimalVenta[] = Array.from({ length: num }, () => ({
            numero_chapeta: '',
            peso_salida: '',
            validado: false
        }));
        setAnimales(nuevasFilas);
        setMsjExito('');
        setMsjError('');
    };

    const updateAnimalField = (index: number, field: keyof AnimalVenta, value: string) => {
        const newAnimales = [...animales];
        newAnimales[index] = { ...newAnimales[index], [field]: value, validado: field === 'numero_chapeta' ? false : newAnimales[index].validado, error: field === 'numero_chapeta' ? undefined : newAnimales[index].error };
        setAnimales(newAnimales);
    };

    const validarAnimal = async (index: number) => {
        const a = animales[index];
        if (!a.numero_chapeta.trim() || !fincaId) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('animales')
                .select('id, numero_chapeta, etapa')
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', a.numero_chapeta.trim())
                .eq('estado', 'activo')
                .single();

            const newAnimales = [...animales];
            if (error || !data) {
                newAnimales[index] = { ...a, validado: false, error: 'No encontrado o no está activo', id_animal: undefined };
            } else {
                newAnimales[index] = { ...a, validado: true, error: undefined, id_animal: data.id };
            }
            setAnimales(newAnimales);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const removeFila = (index: number) => {
        setAnimales(animales.filter((_, i) => i !== index));
    };

    const handlePreconfirmar = () => {
        if (!fincaId || animales.length === 0) return;

        try {
            if (animales.some(a => !a.validado)) throw new Error("Debe validar todas las chapetas antes de continuar.");
            if (animales.some(a => !a.peso_salida || parseFloat(a.peso_salida) <= 0)) throw new Error("Todos los animales deben tener un peso de salida válido.");

            setShowConfirm(true);
            setMsjError('');
        } catch (err: any) {
            setMsjError(err.message);
        }
    };

    const handleProcesarVenta = async () => {
        setLoading(true);
        setMsjError('');
        setShowConfirm(false);

        try {
            for (const a of animales) {
                if (!a.id_animal) continue;

                const pesoFloat = parseFloat(a.peso_salida);

                // 1. Insertar registro de pesaje final
                const { error: errorPesaje } = await supabase
                    .from('registros_pesaje')
                    .insert({
                        id_animal: a.id_animal,
                        peso: pesoFloat,
                        fecha: fechaVenta,
                        etapa: 'ceba' // Generalmente se venden en ceba, o podríamos traer la etapa actual
                    });

                if (errorPesaje) throw errorPesaje;

                // 2. Marcar animal como vendido
                const { error: errorAnimal } = await supabase
                    .from('animales')
                    .update({ estado: 'vendido' })
                    .eq('id', a.id_animal);

                if (errorAnimal) throw errorAnimal;
            }

            setMsjExito(`¡Venta procesada! Se han marcado ${animales.length} animales como vendidos.`);
            setAnimales([]);
            setCantidad('1');
        } catch (err: any) {
            setMsjError('Error al procesar la venta: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setAnimales([]);
        setCantidad('1');
        setMsjError('');
        setMsjExito('');
    };

    if (role === 'observador') {
        return <div className="page-container text-center">Acceso denegado. Solo administradores y trabajadores pueden registrar ventas.</div>;
    }

    return (
        <div className="page-container">
            {/* Modal de Confirmación */}
            {showConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
                    <div className="card" style={{ maxWidth: '450px', width: '100%', textAlign: 'center', border: '1px solid var(--error)' }}>
                        <Tag size={40} color="var(--error)" style={{ marginBottom: '16px' }} />
                        <h2 style={{ marginBottom: '12px' }}>Confirmar Venta</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                            ¿Estás seguro de marcar estos <b>{animales.length} animales</b> como VENDIDOS? <br />
                            Esto creará un registro de pesaje de salida y los quitará del inventario activo.
                        </p>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <button onClick={() => setShowConfirm(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--text-muted)' }}>
                                Regresar
                            </button>
                            <button onClick={handleProcesarVenta} style={{ backgroundColor: 'var(--error)' }}>
                                Confirmar Venta
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <h1 className="title" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Tag size={32} /> Registro de Venta
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Módulo para dar de baja animales vendidos y registrar su peso final.</p>

            {msjExito && <div style={{ backgroundColor: 'rgba(76, 175, 80, 0.2)', color: 'var(--success)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjExito}</div>}
            {msjError && <div style={{ backgroundColor: 'rgba(244, 67, 54, 0.15)', color: 'var(--error)', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontWeight: 'bold' }}>{msjError}</div>}

            <div className="card" style={{ marginBottom: '32px' }}>
                <form onSubmit={generarFilas} style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 150px' }}>
                        <label>Cantidad Vendida</label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={cantidad}
                            onChange={e => setCantidad(e.target.value)}
                            disabled={loading || animales.length > 0}
                        />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label>Fecha de Salida</label>
                        <div style={{ position: 'relative' }}>
                            <Calendar size={18} style={{ position: 'absolute', left: '12px', top: '16px', color: 'var(--text-muted)' }} />
                            <input
                                type="date"
                                value={fechaVenta}
                                onChange={e => setFechaVenta(e.target.value)}
                                style={{ paddingLeft: '40px' }}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                    </div>
                    {animales.length === 0 ? (
                        <button type="submit" style={{ width: 'auto', padding: '0 32px' }} disabled={loading}>
                            <Plus size={18} /> Cargar Filas
                        </button>
                    ) : (
                        <button type="button" onClick={handleReset} style={{ width: 'auto', backgroundColor: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', padding: '0 32px' }}>
                            <Trash2 size={18} /> Cancelar / Reiniciar
                        </button>
                    )}
                </form>
            </div>

            {animales.length > 0 && (
                <div className="glass-panel" style={{ padding: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '16px', color: 'var(--text-muted)', width: '60px' }}>#</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Chapeta</th>
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Peso Salida (kg)</th>
                                <th style={{ padding: '16px', width: '50px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {animales.map((a, index) => (
                                <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{index + 1}</td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                placeholder="Chapeta"
                                                value={a.numero_chapeta}
                                                onChange={e => updateAnimalField(index, 'numero_chapeta', e.target.value)}
                                                onBlur={() => validarAnimal(index)}
                                                style={{ marginBottom: 0, padding: '10px', width: '120px', borderColor: a.error ? 'var(--error)' : (a.validado ? 'var(--success)' : '') }}
                                            />
                                            {a.validado && <CheckCircle2 size={18} color="var(--success)" />}
                                            {a.error && <div style={{ color: 'var(--error)', fontSize: '0.7rem' }} title={a.error}><AlertCircle size={18} /></div>}
                                            {!a.validado && !a.error && a.numero_chapeta && <button onClick={() => validarAnimal(index)} style={{ width: 'auto', padding: '4px 8px' }}><Search size={14} /></button>}
                                        </div>
                                    </td>
                                    <td style={{ padding: '8px 16px' }}>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="Peso final"
                                            value={a.peso_salida}
                                            onChange={e => updateAnimalField(index, 'peso_salida', e.target.value)}
                                            style={{ marginBottom: 0, padding: '10px' }}
                                        />
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button
                                            onClick={() => removeFila(index)}
                                            style={{ backgroundColor: 'transparent', padding: '4px', color: 'rgba(255,255,255,0.2)', width: 'auto' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div style={{ padding: '32px', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={handlePreconfirmar}
                            disabled={loading}
                            style={{ backgroundColor: 'var(--error)', maxWidth: '400px', fontSize: '1.2rem', padding: '16px 48px' }}
                        >
                            {loading ? 'Procesando...' : 'Proceder con la Venta'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
