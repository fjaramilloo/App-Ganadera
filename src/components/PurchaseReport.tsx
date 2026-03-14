import { format } from 'date-fns';
import { Printer, X } from 'lucide-react';

interface AnimalReport {
    numero_chapeta: string;
    peso_ingreso: string | number;
    propietario: string;
}

interface PurchaseReportProps {
    fincaNombre: string;
    fechaIngreso: string;
    animales: AnimalReport[];
    onClose: () => void;
}

export default function PurchaseReport({ fincaNombre, fechaIngreso, animales, onClose }: PurchaseReportProps) {
    // Cálculos
    const totalKilos = animales.reduce((sum, a) => sum + parseFloat(a.peso_ingreso.toString()), 0);
    const totalAnimales = animales.length;

    // Agrupación por propietario (Marca)
    const porMarca = animales.reduce((acc: any, a) => {
        const marca = a.propietario || 'No definida';
        if (!acc[marca]) {
            acc[marca] = { count: 0, kilos: 0 };
        }
        acc[marca].count += 1;
        acc[marca].kilos += parseFloat(a.peso_ingreso.toString());
        return acc;
    }, {});

    const resumenMarcas = Object.keys(porMarca).map(marca => ({
        marca,
        count: porMarca[marca].count,
        kilos: porMarca[marca].kilos,
        promedio: porMarca[marca].kilos / porMarca[marca].count
    }));

    const promedioPeso = totalAnimales > 0 ? totalKilos / totalAnimales : 0;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="report-modal-overlay">
            <style>
                {`
                @media print {
                    @page { margin: 1cm; }
                    body * { visibility: hidden; }
                    .report-container, .report-container * { visibility: visible; }
                    .report-container { 
                        position: absolute; 
                        left: 0; 
                        top: 0; 
                        width: 100%; 
                        padding: 0;
                        background: white !important;
                        color: black !important;
                    }
                    .no-print { display: none !important; }
                }
                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85);
                    z-index: 2000;
                    display: flex;
                    justify-content: center;
                    padding: 40px 20px;
                    overflow-y: auto;
                }
                .report-container {
                    background: white;
                    color: #333;
                    width: 100%;
                    max-width: 750px;
                    padding: 30px;
                    border-radius: 4px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    height: fit-content;
                    font-family: 'Inter', sans-serif;
                }
                .report-header {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .report-title {
                    font-size: 22px;
                    font-weight: 800;
                    margin-bottom: 5px;
                    color: black;
                }
                .report-subtitle {
                    font-size: 13px;
                    color: #666;
                    margin-bottom: 15px;
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                }
                .report-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                .summary-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .summary-item {
                    background: #f8f9fa;
                    border: 1px solid #eee;
                    border-radius: 6px;
                    padding: 12px;
                    text-align: center;
                }
                .summary-label { 
                    display: block;
                    font-size: 11px;
                    text-transform: uppercase;
                    color: #666;
                    margin-bottom: 4px;
                }
                .summary-value {
                    font-size: 16px;
                    font-weight: 700;
                    color: #333;
                }
                .report-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                    margin-bottom: 20px;
                }
                .report-table th, .report-table td {
                    border: 1px solid #ddd;
                    padding: 6px 8px;
                    text-align: left;
                    border-bottom: 1px solid #ddd;
                }
                .report-table th {
                    background-color: #f8f9fa;
                    font-weight: 600;
                    color: #555;
                    border-bottom: 2px solid #ddd;
                }
                .report-table tbody tr:nth-child(even) {
                    background-color: #fafafa;
                }
                .report-footer-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                    margin-top: 5px;
                }
                .report-footer-table th, .report-footer-table td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: center;
                }
                .report-footer-table th {
                    background-color: #f8f9fa;
                    font-weight: 600;
                    color: #555;
                    border-bottom: 2px solid #ddd;
                }
                .table-title {
                    font-size: 14px;
                    font-weight: 700;
                    margin-bottom: 8px;
                    color: #333;
                }
                `}
            </style>

            <div className="report-container">
                <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '20px' }}>
                    <button onClick={handlePrint} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}>
                        <Printer size={18} /> Imprimir / PDF
                    </button>
                    <button onClick={onClose} style={{ background: '#eee', color: '#333', border: 'none', borderRadius: '8px', cursor: 'pointer', padding: '10px' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className="report-header">
                    <div className="report-title">Ingreso Ganado - {fincaNombre}</div>
                    <div className="report-subtitle">
                        <span><strong>Fecha Informe:</strong> {format(new Date(), 'dd/MM/yyyy')}</span>
                        <span><strong>Fecha Ingreso Lote:</strong> {format(new Date(fechaIngreso + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                    </div>
                </div>

                <div className="summary-grid">
                    <div className="summary-item">
                        <span className="summary-label">Total Animales</span>
                        <div className="summary-value">{totalAnimales} <span style={{fontSize: '0.8em', fontWeight: 'normal', color: '#888'}}>Cabezas</span></div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Peso Total</span>
                        <div className="summary-value">{totalKilos.toLocaleString()} <span style={{fontSize: '0.8em', fontWeight: 'normal', color: '#888'}}>kg</span></div>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Peso Promedio</span>
                        <div className="summary-value">{promedioPeso.toFixed(1)} <span style={{fontSize: '0.8em', fontWeight: 'normal', color: '#888'}}>kg</span></div>
                    </div>
                </div>

                <div className="table-title">Detalle de Ingresos</div>
                <table className="report-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th>Chapeta</th>
                            <th>Peso de Ingreso</th>
                            <th>Marca / Propietario</th>
                        </tr>
                    </thead>
                    <tbody>
                        {animales.map((a, i) => (
                            <tr key={i}>
                                <td style={{ color: '#888', fontSize: '10px' }}>{i + 1}</td>
                                <td style={{ fontWeight: '600' }}>{a.numero_chapeta}</td>
                                <td style={{ fontWeight: '700' }}>{a.peso_ingreso} kg</td>
                                <td style={{ color: '#666' }}>{a.propietario}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="table-title" style={{ marginTop: '20px' }}>Resumen por Marca</div>
                <table className="report-footer-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left' }}>Propietario</th>
                            <th>Nro Animales</th>
                            <th>Kilos Total</th>
                            <th>Peso Promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {resumenMarcas.map((r, i) => (
                            <tr key={i}>
                                <td style={{ textAlign: 'left', fontWeight: '600' }}>{r.marca}</td>
                                <td>{r.count}</td>
                                <td>{r.kilos.toLocaleString()} kg</td>
                                <td style={{ fontWeight: '700' }}>{Math.round(r.promedio)} kg</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
