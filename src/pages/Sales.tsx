import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Tag, Trash2, CheckCircle2, Calendar, Search, AlertCircle, Plus } from 'lucide-react';
import SalesReport from '../components/SalesReport';

interface AnimalVenta {
    numero_chapeta: string;
    peso_salida: string;
    propietario: string;
    id_animal?: string;
    validado: boolean;
    error?: string;
    // Datos para cálculo de GMP
    ultimo_peso?: number;
    ultima_fecha?: string;
    gmp?: number;
}

export default function Sales() {
    const { fincaId, role, userFincas } = useAuth();
    const [cantidad, setCantidad] = useState('1');
    const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().split('T')[0]);
    const [animales, setAnimales] = useState<AnimalVenta[]>([]);
    const [compradores, setCompradores] = useState<{ id: string, nombre: string }[]>([]);
    const [selectedComprador, setSelectedComprador] = useState('');
    const [observaciones, setObservaciones] = useState('');

    const [loading, setLoading] = useState(false);
    const [msjExito, setMsjExito] = useState('');
    const [msjError, setMsjError] = useState('');
    const [showConfirm, setShowConfirm] = useState(false);

    // Reporte
    const [showReport, setShowReport] = useState(false);
    const [reportData, setReportData] = useState<{ fecha: string, animales: AnimalVenta[], comprador: string } | null>(null);

    useEffect(() => {
        if (!fincaId) return;
        const fetchCompradores = async () => {
            const { data } = await supabase
                .from('compradores')
                .select('id, nombre')
                .eq('id_finca', fincaId)
                .order('nombre');
            if (data) setCompradores(data);
        };
        fetchCompradores();
    }, [fincaId]);

    const generarFilas = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(cantidad);
        if (isNaN(num) || num <= 0) return;

        const nuevasFilas: AnimalVenta[] = Array.from({ length: num }, () => ({
            numero_chapeta: '',
            peso_salida: '',
            propietario: '',
            validado: false
        }));
        setAnimales(nuevasFilas);
        setMsjExito('');
        setMsjError('');
    };

    const calculateGMP = (pesoSalida: string, ultimoPeso: number, ultimaFecha: string, fechaVenta: string) => {
        const pSalida = parseFloat(pesoSalida);
        if (isNaN(pSalida) || pSalida <= 0 || !ultimoPeso || !ultimaFecha) return 0;
        
        const f1 = new Date(ultimaFecha);
        const f2 = new Date(fechaVenta);
        const dias = Math.max(1, Math.floor((f2.getTime() - f1.getTime()) / (1000 * 60 * 60 * 24)));
        
        const gdp = (pSalida - ultimoPeso) / dias;
        return gdp * 30;
    };

    const updateAnimalField = (index: number, field: keyof AnimalVenta, value: string) => {
        const newAnimales = [...animales];
        const a = { ...newAnimales[index], [field]: value };
        
        if (field === 'numero_chapeta') {
            a.validado = false;
            a.error = undefined;
        }

        // Recalcular GMP si cambia el peso
        if (field === 'peso_salida' && a.ultimo_peso && a.ultima_fecha) {
            a.gmp = calculateGMP(value, a.ultimo_peso, a.ultima_fecha, fechaVenta);
        }

        newAnimales[index] = a;
        setAnimales(newAnimales);
    };

    const validarAnimal = async (index: number) => {
        const a = animales[index];
        if (!a.numero_chapeta.trim() || !fincaId) return;

        setLoading(true);
        try {
            // Buscamos animal y su último pesaje
            const { data, error } = await supabase
                .from('animales')
                .select(`
                    id, 
                    numero_chapeta, 
                    nombre_propietario,
                    peso_ingreso,
                    fecha_ingreso,
                    registros_pesaje (
                        peso,
                        fecha
                    )
                `)
                .eq('id_finca', fincaId)
                .eq('numero_chapeta', a.numero_chapeta.trim())
                .eq('estado', 'activo')
                .single();

            const newAnimales = [...animales];
            if (error || !data) {
                newAnimales[index] = { ...a, validado: false, error: 'No encontrado o no está activo', id_animal: undefined };
            } else {
                // Obtener el último peso disponible
                const registros = (data.registros_pesaje || []).sort((x: any, y: any) => 
                    new Date(y.fecha).getTime() - new Date(x.fecha).getTime()
                );
                const ultimoPeso = registros.length > 0 ? registros[0].peso : data.peso_ingreso;
                const ultimaFecha = registros.length > 0 ? registros[0].fecha : data.fecha_ingreso;

                const gmp = a.peso_salida ? calculateGMP(a.peso_salida, ultimoPeso, ultimaFecha, fechaVenta) : 0;

                newAnimales[index] = { 
                    ...a, 
                    validado: true, 
                    error: undefined, 
                    id_animal: data.id, 
                    propietario: data.nombre_propietario,
                    ultimo_peso: ultimoPeso,
                    ultima_fecha: ultimaFecha,
                    gmp: gmp
                };
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
            if (!selectedComprador) throw new Error("Debe seleccionar un Comprador para la venta.");
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
                        etapa: 'ceba'
                    });

                if (errorPesaje) throw errorPesaje;

                // 2. Marcar animal como vendido y guardar datos de venta
                const { error: errorAnimal } = await supabase
                    .from('animales')
                    .update({ 
                        estado: 'vendido',
                        comprador_venta: selectedComprador,
                        fecha_venta: fechaVenta,
                        peso_venta: pesoFloat,
                        observaciones_venta: observaciones
                    })
                    .eq('id', a.id_animal);

                if (errorAnimal) throw errorAnimal;
            }

            setMsjExito(`¡Venta procesada! Se han marcado ${animales.length} animales como vendidos.`);
            
            // Guardar para reporte
            setReportData({
                fecha: fechaVenta,
                animales: [...animales],
                comprador: selectedComprador
            });
            setShowReport(true);

            setAnimales([]);
            setCantidad('1');
            setSelectedComprador('');
            setObservaciones('');
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
        setSelectedComprador('');
        setObservaciones('');
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
                            Comprador: <b>{selectedComprador}</b><br />
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
                <form onSubmit={generarFilas} style={{ display: 'flex', gap: '20px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
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

                        <div style={{ flex: '1 1 250px' }}>
                            <label>Comprador</label>
                            <select
                                value={selectedComprador}
                                onChange={e => setSelectedComprador(e.target.value)}
                                disabled={loading || animales.length > 0}
                                required
                            >
                                <option value="">Seleccione un Comprador...</option>
                                {compradores.map(c => (
                                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 100%' }}>
                            <label>Observaciones de la Venta</label>
                            <input
                                type="text"
                                placeholder="Ej: Venta de lote para ceba, precio por kilo..."
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                disabled={loading || animales.length > 0}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
                        {animales.length === 0 ? (
                            <button type="submit" style={{ width: 'auto', padding: '0 32px' }} disabled={loading}>
                                <Plus size={18} /> Preparar Lista
                            </button>
                        ) : (
                            <button type="button" onClick={handleReset} style={{ width: 'auto', backgroundColor: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', padding: '0 32px' }}>
                                <Trash2 size={18} /> Reiniciar Lista
                            </button>
                        )}
                    </div>
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
                                <th style={{ padding: '16px', color: 'var(--text-muted)' }}>Marca</th>
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
                                            {!a.validado && !a.error && a.numero_chapeta && <button onClick={() => validarAnimal(index)} className="btn-icon" style={{ width: 'auto' }}><Search size={14} /></button>}
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
                                    <td style={{ padding: '16px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                        {a.propietario || '-'}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <button
                                            onClick={() => removeFila(index)}
                                            className="btn-icon"
                                            style={{ color: 'rgba(255,255,255,0.2)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--error)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
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
                            {loading ? 'Procesando...' : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckCircle2 size={24} /> Confirmar Venta de {animales.length} Animales
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {showReport && reportData && (
                <SalesReport
                    fincaNombre={userFincas.find((f: any) => f.id_finca === fincaId)?.nombre_finca || 'Finca'}
                    fechaVenta={reportData.fecha}
                    animales={reportData.animales}
                    comprador={reportData.comprador}
                    onClose={() => setShowReport(false)}
                />
            )}
        </div>
    );
}
