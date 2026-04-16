import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../src/lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import logoIteo from '../public/logo-iteo-azul.png';

export const PatientPrintLabel: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!id) return;
            try {
                const { data: surgeryData, error } = await supabase
                    .from('surgeries')
                    .select(`
                        id,
                        surgery_date,
                        procedure_name,
                        patients (full_name, document_number, allergies, birth_date)
                    `)
                    .eq('id', id)
                    .single();

                if (error) throw error;
                setData(surgeryData);
            } catch (err) {
                console.error('Error fetching data for print:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDetails();
    }, [id]);

    useEffect(() => {
        if (!loading && data) {
            setTimeout(() => {
                window.print();
            }, 600);
        }
    }, [loading, data]);

    if (loading) {
        return <div className="p-10 text-center text-slate-500">Cargando datos para impresión...</div>;
    }

    if (!data) {
        return <div className="p-10 text-center text-red-500">Error: No se encontraron los datos.</div>;
    }

    const patient = data.patients;
    const trackingUrl = `${window.location.origin}/#/tracking/${id}`;

    // Calculate age
    let ageText = '';
    if (patient.birth_date) {
        const today = new Date();
        const birth = new Date(patient.birth_date);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        ageText = age >= 0 ? `${age} años` : '';
    }

    const nameLong = patient.full_name?.length > 25;

    return (
        <>
            <style>{`
                /* ── screen preview ── */
                body {
                    margin: 0;
                    background: #f1f5f9;
                    display: flex;
                    align-items: flex-start;
                    justify-content: center;
                    padding: 40px;
                    min-height: 100vh;
                    font-family: 'Arial', sans-serif;
                }

                /* ── the band ── */
                .wristband {
                    width: 720px;
                    background: #fff;
                    border: 2px dashed #cbd5e1;
                    border-radius: 12px;
                    display: flex;
                    align-items: stretch;
                    overflow: hidden;
                }

                /* left accent strip */
                .accent-strip {
                    width: 8px;
                    background: #1d4ed8;
                    flex-shrink: 0;
                }

                /* logo column */
                .logo-col {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 12px;
                    border-right: 1.5px solid #e2e8f0;
                    flex-shrink: 0;
                    gap: 6px;
                    min-width: 80px;
                }
                .logo-col img {
                    width: 60px;
                    object-fit: contain;
                }
                .logo-col span {
                    font-size: 7px;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #475569;
                    text-align: center;
                }

                /* patient info – the "safe zone" center */
                .info-col {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    padding: 12px 16px;
                    gap: 4px;
                    overflow: hidden;
                }
                .patient-name {
                    font-size: ${nameLong ? '16px' : '22px'};
                    font-weight: 900;
                    text-transform: uppercase;
                    line-height: 1.1;
                    letter-spacing: -0.01em;
                    color: #0f172a;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    word-break: break-word;
                }
                .patient-meta {
                    font-size: 12px;
                    font-weight: 700;
                    color: #334155;
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .allergy-row {
                    display: flex;
                    align-items: flex-start;
                    gap: 6px;
                    margin-top: 2px;
                }
                .allergy-badge {
                    background: #1e293b;
                    color: #fff;
                    font-size: 8px;
                    font-weight: 900;
                    padding: 2px 6px;
                    border-radius: 3px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .allergy-text {
                    font-size: 10px;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #0f172a;
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    word-break: break-word;
                    line-height: 1.4;
                }

                /* QR column */
                .qr-col {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 10px 14px;
                    border-left: 1.5px solid #e2e8f0;
                    flex-shrink: 0;
                    gap: 4px;
                }
                .qr-col svg {
                    display: block;
                }
                .qr-label {
                    font-size: 7px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #64748b;
                    text-align: center;
                }

                /* right accent strip */
                .accent-strip-right {
                    width: 8px;
                    background: #1d4ed8;
                    flex-shrink: 0;
                }

                /* ── print styles ── */
                @media print {
                    body {
                        padding: 0;
                        background: #fff;
                        display: block;
                    }
                    .wristband {
                        width: 100%;
                        border: none;
                        border-radius: 0;
                    }
                    @page {
                        size: landscape;
                        margin: 6mm 8mm;
                    }
                }
            `}</style>

            <div className="wristband">
                {/* Left blue strip */}
                <div className="accent-strip" />

                {/* Logo column */}
                <div className="logo-col">
                    <img src={logoIteo} alt="Logo ITEO" />
                    <span>Cirugía</span>
                </div>

                {/* Patient info - centered safe zone */}
                <div className="info-col">
                    <p className="patient-name">{patient.full_name}</p>
                    <div className="patient-meta">
                        <span>DNI: {patient.document_number}</span>
                        {ageText && <span>EDAD: {ageText}</span>}
                    </div>
                    <div className="allergy-row">
                        <span className="allergy-badge">Alergias</span>
                        <span className="allergy-text">
                            {patient.allergies ? patient.allergies : 'Sin alergias registradas'}
                        </span>
                    </div>
                </div>

                {/* QR Code column */}
                <div className="qr-col">
                    <QRCodeSVG
                        value={trackingUrl}
                        size={95}
                        level="H"
                        includeMargin={false}
                    />
                    <span className="qr-label">Escanear</span>
                    <span className="qr-label font-black text-[35px] mt-1 text-slate-900 border-t border-slate-100 pt-1 w-full text-center leading-none">
                        {id?.slice(-8).toUpperCase()}
                    </span>
                </div>

                {/* Right blue strip */}
                <div className="accent-strip-right" />
            </div>
        </>
    );
};
