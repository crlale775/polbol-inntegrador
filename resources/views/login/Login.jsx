/**
 * Acceso institucional de la Policía Boliviana con personajes reactivos.
 *
 * La ilustración acompaña los estados del formulario sin acceder a claves.
 */
import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../js/context/AuthContext';
import api from '../../js/lib/api';
import Alert from '../../js/components/ui/Alert';
import Spinner from '../../js/components/ui/Spinner';
import Escudo from '../../js/components/ui/Escudo';
import PoliceCharacters from '../../js/components/ui/PoliceCharacters';
import { prefetchRuta } from '../../js/lib/prefetch';
import { navegarConTransicion } from '../../js/components/ui/TransicionAcceso';
import { User, Lock, LogIn, FileText, Send, ClipboardCheck, Archive, Eye, EyeOff, AlertTriangle, ArrowLeft } from 'lucide-react';

// Etapas del flujo documental (panel lateral animado)
const ETAPAS = [
    { icon: FileText, nombre: 'Secretaría EPI', detalle: 'Emisión del trámite' },
    { icon: Send, nombre: 'Comando Dptal.', detalle: 'Recepción y revisión' },
    { icon: ClipboardCheck, nombre: 'Validación', detalle: 'Control normativo' },
    { icon: Archive, nombre: 'Registro', detalle: 'Escalafón oficial' },
];

export default function Login() {
    const [form, setForm] = useState({ usuario: '', password: '', recordar: false });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [verPassword, setVerPassword] = useState(false);
    const [bloqMayus, setBloqMayus] = useState(false);
    const [focusedField, setFocusedField] = useState('');
    const passwordInput = useRef(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
        if (error) setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.usuario.trim() || !form.password.trim()) {
            setError('Por favor completa todos los campos.');
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const found = await api.post('/login', {
                usuario: form.usuario.trim(),
                password: form.password,
            });

            const epiNombre = found.epi?.nombre ?? 'EPI Asignada';
            const rolNombre = found.rol?.nombre ?? 'Usuario';

            const sessionUser = {
                id_usuario: found.id_usuario,
                usuario: found.usuario,
                correo: found.correo,
                id_epi: found.id_epi,
                id_rol: found.id_rol,
                epi: epiNombre,
                rol: rolNombre,
                estado: found.estado,
                foto: found.foto,
            };

            login(sessionUser, form.recordar);

            const rolLower = rolNombre.toLowerCase();
            if (rolLower.includes('departamental')) {
                void prefetchRuta('/comando-departamental/dashboard');
                navegarConTransicion(navigate, '/comando-departamental/dashboard', 'Abriendo Comando Departamental', { replace: true });
            } else if (rolLower.includes('general')) {
                void prefetchRuta('/comando-general/dashboard');
                navegarConTransicion(navigate, '/comando-general/dashboard', 'Abriendo Comando General', { replace: true });
            } else {
                void prefetchRuta('/secretario/dashboard');
                navegarConTransicion(navigate, '/secretario/dashboard', 'Abriendo tu Secretaría EPI', { replace: true });
            }
        } catch (err) {
            setError(err.message || 'Error al conectar con el servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main id="main-content" tabIndex={-1} className="pb-login min-h-screen flex ofbol-animate-fade-in">
            <aside className="ofbol-login-brand pb-login-brand" aria-label="Policía Boliviana">
                <div className="pb-login-brand-inner">
                    <div className="pb-login-top">
                        <Link to="/" className="pb-login-volver">
                            <ArrowLeft size={16} aria-hidden="true" /> Volver a la página inicial
                        </Link>
                        <div className="pb-login-wordmark">
                            <Escudo className="w-10 h-14 shrink-0" />
                            <strong>POLICÍA BOLIVIANA</strong>
                        </div>
                    </div>
                    <div className="pb-login-intro">
                        <h1>El trámite policial,<br /><span>de principio a fin.</span></h1>
                        <p className="pb-login-description">
                            Emisión, revisión normativa y registro oficial del escalafón, en una sola vía institucional trazable.
                        </p>
                        <PoliceCharacters focusedField={focusedField} usernameLength={form.usuario.length}
                            passwordVisible={verPassword} loading={loading} error={!!error} />
                        <ol className="pb-login-flow" aria-label="Etapas del trámite">
                            {ETAPAS.map(({icon: Icono,nombre}) => <li key={nombre}><Icono size={14} aria-hidden="true" /><span>{nombre}</span></li>)}
                        </ol>
                    </div>
                    <div className="pb-login-brand-footer">
                        <p>© 2026 · Comando Departamental La Paz<br />Uso oficial exclusivo</p>
                        <span>RESERVADO</span>
                    </div>
                </div>
            </aside>

            {/* ═══ PANEL DE FORMULARIO ═══ */}
            <div className="ofbol-login-form flex-1 flex items-center justify-center p-6 lg:p-12 ofbol-animate-fade-in" style={{ background: 'var(--ofbol-paper)' }}>
                <div className="w-full max-w-sm">
                    {/* Logo móvil */}
                    <div className="pb-login-mobile-wordmark lg:hidden flex items-center gap-3 mb-10">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ background: '#3d4a2c', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)' }}
                        >
                            <Escudo className="w-8 h-10" />
                        </div>
                        <div>
                            <p style={{ color: '#0a0f0d', fontWeight: 800, fontSize: '13px' }}>POLICÍA BOLIVIANA</p>
                        </div>
                    </div>

                    {/* Título */}
                    <div className="mb-8">
                        <h2 style={{ color: '#14181a', fontWeight: 900, fontSize: '28px', letterSpacing: '-0.025em', marginBottom: '6px' }}>
                            Iniciar sesión
                        </h2>
                        <p style={{ color: '#5a615f', fontSize: '13px' }}>
                            Ingresa tus credenciales institucionales.
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-6">
                            <Alert type="error" onClose={() => setError(null)}>
                                {error}
                            </Alert>
                        </div>
                    )}

                    {/* Formulario */}
                    <form onSubmit={handleSubmit} onInvalidCapture={() => setError('Por favor completa todos los campos.')} className="space-y-5" aria-busy={loading}>
                        {/* Usuario */}
                        <div>
                            <label
                                htmlFor="login-usuario"
                                style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#3f4849', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}
                            >
                                Usuario
                            </label>
                            <div className="relative">
                                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#a8a5a0' }} />
                                <input
                                    type="text"
                                    id="login-usuario"
                                    name="usuario"
                                    onFocus={() => setFocusedField('usuario')}
                                    onBlur={() => setFocusedField('')}
                                    value={form.usuario}
                                    onChange={handleChange}
                                    placeholder="tu.usuario…"
                                    autoComplete="username"
                                    required
                                    maxLength={50}
                                    disabled={loading}
                                    spellCheck={false}
                                    autoFocus
                                    className="ofbol-input w-full pl-10"
                                />
                            </div>
                        </div>

                        {/* Contraseña */}
                        <div>
                            <label
                                htmlFor="login-password"
                                style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#3f4849', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' }}
                            >
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#a8a5a0' }} />
                                <input aria-label="Contraseña institucional"
                                    type={verPassword ? 'text' : 'password'}
                                    id="login-password"
                                    name="password"
                                    ref={passwordInput}
                                    onFocus={() => setFocusedField('password')}
                                    value={form.password}
                                    onChange={handleChange}
                                    onKeyUp={(e) => setBloqMayus(e.getModifierState?.('CapsLock') ?? false)}
                                    onBlur={() => { setBloqMayus(false); setFocusedField(''); }}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                    disabled={loading}
                                    className="ofbol-input w-full pl-10 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => { setVerPassword((v) => !v); passwordInput.current?.focus({ preventScroll: true }); }}
                                    disabled={loading}
                                    aria-controls="login-password"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center rounded-md transition-colors"
                                    style={{ color: '#a8a5a0' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = '#3d4a2c'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = '#a8a5a0'; }}
                                    aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                    aria-pressed={verPassword}
                                >
                                    {verPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {bloqMayus && (
                                <p className="text-[10.5px] font-bold mt-1.5 flex items-center gap-1" style={{ color: '#7f5a07' }}>
                                    <AlertTriangle size={12} aria-hidden="true" /> Bloq Mayús está activado
                                </p>
                            )}
                        </div>

                        {/* Recordarme */}
                        <div className="flex items-center gap-2.5">
                            <input
                                type="checkbox"
                                id="recordar"
                                name="recordar"
                                checked={form.recordar}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-[#d1cec8] accent-[#3d4a2c]"
                            />
                            <label htmlFor="recordar" style={{ fontSize: '12px', color: '#5a615f', cursor: 'pointer' }}>
                                Recordar sesión
                            </label>
                        </div>

                        {/* Botón */}
                        <button type="submit" disabled={loading} className="ofbol-btn-primary ofbol-sheen w-full text-sm">
                            {loading ? (
                                <>
                                    <Spinner size="sm" />
                                    Verificando…
                                </>
                            ) : (
                                <>
                                    Ingresar al sistema
                                    <LogIn size={15} />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Demo accounts */}
                    {import.meta.env.DEV && <div className="mt-8 pt-6" style={{ borderTop: '1px solid #e8e6e1' }}>
                        <p style={{ fontSize: '10px', fontWeight: 800, color: '#3d4a2c', letterSpacing: '0.1em', textTransform: 'uppercase', textAlign: 'center', marginBottom: '12px' }}>
                            Selección rápida de usuario
                        </p>
                        <p className="mb-3 text-center text-xs text-[#5a615f]">Por seguridad, ingresa la contraseña manualmente.</p>

                        <div className="space-y-2">
                            <select aria-label="Filtro"
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setForm({ usuario: e.target.value, password: '', recordar: false });
                                    }
                                }}
                                className="ofbol-input w-full text-xs"
                                defaultValue=""
                            >
                                <option value="" disabled>Seleccionar Secretario EPI…</option>
                                <option value="sec_sanpedro">sec_sanpedro · EPI 1 San Pedro</option>
                                <option value="sec_sur">sec_sur · EPI 2 Sur</option>
                                <option value="sec_ferroviaria">sec_ferroviaria · EPI 3 Ferroviaria</option>
                                <option value="sec_munaypata">sec_munaypata · EPI 4 Munaypata</option>
                                <option value="sec_cotahuma">sec_cotahuma · EPI 5 Cotahuma</option>
                                <option value="sec_chijini">sec_chijini · EPI 6 Chijini</option>
                                <option value="sec_centro">sec_centro · EPI 7 Centro</option>
                                <option value="sec_bosquecillo">sec_bosquecillo · EPI 8 Bosquecillo</option>
                                <option value="sec_merced">sec_merced · EPI 9 Merced</option>
                            </select>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setForm({ usuario: 'revisor_lapaz', password: '', recordar: false })}
                                    className="ofbol-lift py-2.5 px-3 rounded-lg text-xs font-bold transition-colors"
                                    style={{
                                        background: 'rgba(154, 111, 10, 0.08)',
                                        color: '#7f5a07',
                                        border: '1px solid rgba(154, 111, 10, 0.15)',
                                    }}
                                >
                                    Comando Dptal.
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm({ usuario: 'comando_general', password: '', recordar: false })}
                                    className="ofbol-lift py-2.5 px-3 rounded-lg text-xs font-bold transition-colors"
                                    style={{
                                        background: 'rgba(26, 92, 82, 0.08)',
                                        color: '#1a5c52',
                                        border: '1px solid rgba(26, 92, 82, 0.15)',
                                    }}
                                >
                                    Comando General
                                </button>
                            </div>
                        </div>
                    </div>}

                    {/* Footer */}
                    <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--ofbol-slate)', marginTop: '32px' }}>
                        Policía Boliviana · Acceso institucional
                    </p>
                </div>
            </div>
        </main>
    );
}
