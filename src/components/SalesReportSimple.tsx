import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';

interface AnimalSimple {
    numero_chapeta: string;
    peso_salida: string | number;
}

interface SalesReportSimpleProps {
    fincaNombre: string;
    fechaVenta: string;
    animales: AnimalSimple[];
    comprador: string;
    onClose: () => void;
}

export default function SalesReportSimple({ fincaNombre, fechaVenta, animales, comprador, onClose }: SalesReportSimpleProps) {
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_salida.toString()), 0);
    const totalAnimales = animales.length;
    const pesoPromedio = totalAnimales > 0 ? totalKilos / totalAnimales : 0;

    const handlePrint = () => window.print();

    return (
        <div className="report-modal-overlay">
            <style>{`
                @media print {
                    @page { margin: 1cm; }
                    body * { visibility: hidden; }
                    .report-simple-container, .report-simple-container * { visibility: visible; }
                    .report-simple-container {
                        position: absolute;
                        left: 0; top: 0;
                        width: 100%;
                        padding: 0;
                        background: white !important;
                        color: black !important;
                        box-shadow: none !important;
                    }
                    .no-print { display: none !important; }
                }
                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(8px);
                    z-index: 2000;
                    display: flex;
                    justify-content: center;
                    padding: 20px;
                    overflow-y: auto;
                }
                .report-simple-container {
                    background: white;
                    color: #333;
                    width: 100%;
                    max-width: 500px;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                    height: fit-content;
                    font-family: 'Inter', sans-serif;
                    position: relative;
                }
                .rs-header {
                    text-align: center;
                    margin-bottom: 28px;
                    border-bottom: 2px solid #f0f0f0;
                    padding-bottom: 20px;
                }
                .rs-title {
                    font-size: 22px;
                    font-weight: 800;
                    margin-bottom: 8px;
                    color: black;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .rs-subtitle {
                    font-size: 14px;
                    line-height: 1.7;
                    color: #666;
                }
                .rs-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                    margin-bottom: 24px;
                }
                .rs-table th, .rs-table td {
                    border: 1px solid #ddd;
                    padding: 8px 14px;
                    text-align: center;
                }
                .rs-table th {
                    background-color: #f8f9fa;
                    font-weight: 700;
                    color: #444;
                    font-size: 12px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .rs-table tr:nth-child(even) {
                    background-color: #fafafa;
                }
                .rs-table td:first-child {
                    font-weight: 700;
                    text-align: left;
                    color: #222;
                }
                .rs-table td:last-child {
                    font-weight: 700;
                    color: #111;
                }
                .rs-summary {
                    display: flex;
                    border: 1px solid #e0e0e0;
                    border-radius: 8px;
                    overflow: hidden;
                }
                .rs-summary-item {
                    flex: 1;
                    padding: 16px;
                    text-align: center;
                }
                .rs-summary-item + .rs-summary-item {
                    border-left: 1px solid #e0e0e0;
                }
                .rs-summary-label {
                    display: block;
                    font-size: 10px;
                    color: #999;
                    text-transform: uppercase;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    margin-bottom: 6px;
                }
                .rs-summary-value {
                    font-size: 22px;
                    font-weight: 800;
                    color: #111;
                }
                .rs-summary-value span {
                    font-size: 13px;
                    font-weight: 500;
                    color: #777;
                }
            `}</style>

            <div className="report-simple-container">
                {/* Botones acción */}
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '24px' }}>
                    <button
                        onClick={handlePrint}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 22px', background: '#222', border: 'none',
                            borderRadius: '8px', color: 'white', fontWeight: '600',
                            cursor: 'pointer', fontSize: '0.9rem'
                        }}
                    >
                        <Printer size={16} /> Imprimir / PDF
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#f0f0f0', color: '#666', border: 'none',
                            borderRadius: '8px', cursor: 'pointer', padding: '10px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Encabezado */}
                <div className="rs-header">
                    <div className="rs-title">Salida Ganado — {fincaNombre}</div>
                    <div className="rs-subtitle">
                        <strong>Comprador:</strong> {comprador}<br />
                        <strong>Fecha de salida:</strong> {format(new Date(fechaVenta + 'T12:00:00'), 'dd/MM/yyyy')}
                    </div>
                </div>

                {/* Tabla simple */}
                <table className="rs-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Chapeta</th>
                            <th>Peso (kg)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {animales.map((a, i) => (
                            <tr key={i}>
                                <td style={{ color: '#aaa', fontSize: '11px', fontWeight: 400, textAlign: 'center' }}>{i + 1}</td>
                                <td style={{ textAlign: 'left' }}>{a.numero_chapeta}</td>
                                <td style={{ textAlign: 'center' }}>{parseFloat(a.peso_salida.toString()).toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Resumen */}
                <div className="rs-summary">
                    <div className="rs-summary-item">
                        <span className="rs-summary-label">Animales</span>
                        <div className="rs-summary-value">{totalAnimales}</div>
                    </div>
                    <div className="rs-summary-item">
                        <span className="rs-summary-label">Kilos Totales</span>
                        <div className="rs-summary-value">{totalKilos.toLocaleString('es-CO', { maximumFractionDigits: 1 })} <span>kg</span></div>
                    </div>
                    <div className="rs-summary-item">
                        <span className="rs-summary-label">Peso Promedio</span>
                        <div className="rs-summary-value">{pesoPromedio.toFixed(1)} <span>kg</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
