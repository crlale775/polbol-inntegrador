import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowRight, CheckCheck, FileCheck2, Fingerprint, Layers3, LockKeyhole, Route, ShieldCheck } from 'lucide-react';
import Escudo from '../../js/components/ui/Escudo';
import RedInstitucional3D from '../../js/components/landing/RedInstitucional3D';
import { navegarConTransicion } from '../../js/components/ui/TransicionAcceso';
import { useAuth } from '../../js/context/AuthContext';
import { FOTOS_SECCION, FOTOS_GALERIA } from '../../js/components/landing/fotosInicio';
import '../../css/inicio.css';

/** Devuelve solo las fotos que existen y cargaron; las ausentes no dejan huecos. */
function useFotosDisponibles(fotos) {
    const [listas, setListas] = useState([]);
    useEffect(() => {
        let vivo = true;
        Promise.all(fotos.map((f) => new Promise((resolve) => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve(f);
            img.onerror = () => resolve(null);
            img.src = f.src;
        }))).then((r) => { if (vivo) setListas(r.filter(Boolean)); });
        return () => { vivo = false; };
    }, [fotos]);
    return listas;
}

function Foto({ foto, className = '' }) {
    return <figure className={`pb-inicio-foto ${className}`}>
        <img src={foto.src} alt={foto.alt} loading="lazy" decoding="async" />
        {foto.credito && <figcaption>{foto.credito}</figcaption>}
    </figure>;
}

const LISTA_SECCION = Object.values(FOTOS_SECCION);

const SECCIONES = ['Presentación', 'Preparar', 'Revisar', 'Dar seguimiento'];
export default function Inicio() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [active, setActive] = useState(0);
    const fotosSeccion = useFotosDisponibles(LISTA_SECCION);
    const galeria = useFotosDisponibles(FOTOS_GALERIA);
    const foto = (clave) => fotosSeccion.find((f) => f.src === FOTOS_SECCION[clave].src);
    const target = user ? `${Number(user.id_rol)===3?'/comando-general':Number(user.id_rol)===2?'/comando-departamental':'/secretario'}/dashboard` : '/login';
    const enter = event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button>0) return; event.preventDefault(); navegarConTransicion(navigate,target,user?'Abriendo tu espacio de trabajo':'Preparando el acceso institucional'); };
    useEffect(() => {
        const previous = document.title;
        document.title = 'Policía Boliviana · Gestión documental';
        window.scrollTo(0,0);
        const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) setActive(Number(entry.target.dataset.section)); }, { threshold: .5 });
        document.querySelectorAll('.pb-inicio-section').forEach(item => observer.observe(item));
        return () => { observer.disconnect(); document.title = previous; };
    }, []);
    return <div className="pb-inicio" data-pagina-lista="inicio">
        <RedInstitucional3D />
        <header className="pb-inicio-header">
            <a href="#inicio-0" className="pb-inicio-brand" aria-label="Policía Boliviana, inicio"><Escudo className="pb-inicio-escudo" /><span>Policía<br /><strong>Boliviana</strong></span></a>
            <nav aria-label="Navegación principal"><a href="#como-funciona" className="pb-inicio-how">Cómo funciona</a><Link to={target} onClick={enter} className="pb-inicio-access">{user?'Mi espacio':'Acceso institucional'}<ArrowRight size={17} /></Link></nav>
        </header>
        <nav className="pb-inicio-dots" aria-label="Secciones de la portada">{SECCIONES.map((title,i)=><a href={`#inicio-${i}`} key={title} aria-label={title} aria-current={active===i?'step':undefined}><span />{title}</a>)}</nav>
        <main id="main-content" tabIndex={-1}>
            <section className="pb-inicio-section" id="inicio-0" data-section="0" aria-labelledby="inicio-titulo">
                <div className="pb-inicio-card pb-inicio-hero">
                    <h1 id="inicio-titulo">Cada documento.<br />Un camino <em>claro.</em></h1>
                    <p className="pb-inicio-description">Preparar, revisar y dar seguimiento al trámite policial en una sola ruta.</p>
                    <Link className="pb-inicio-primary" to={target} onClick={enter}>{user?'Continuar en mi espacio':'Ingresar al sistema'}<ArrowRight size={19} /></Link>
                    <div className="pb-inicio-micro"><LockKeyhole size={15} />Uso institucional · Acceso por roles</div>
                    <a href="#como-funciona" className="pb-inicio-scroll"><ArrowDown size={16} />Explorar el recorrido</a>
                </div>
                <div className="pb-inicio-scene-label"><span className="pb-inicio-dot" />RED DE ESTACIONES EPI<small>Representación ilustrativa del flujo documental</small></div>
            </section>
            <div id="como-funciona" className="pb-inicio-anchor" />
            <section className="pb-inicio-section pb-inicio-right" id="inicio-1" data-section="1" aria-labelledby="inicio-preparar">
                <div className="pb-inicio-card pb-inicio-paso">
                    {foto('preparar') && <Foto foto={foto('preparar')} />}
                    <p className="pb-inicio-eyebrow">01 · Preparar</p>
                    <h2 id="inicio-preparar">Bien preparado.<br /><em>Desde el origen.</em></h2>
                    <p className="pb-inicio-description">La Secretaría EPI registra al oficial, elige el memorándum y adjunta el PDF.</p>
                    <ul className="pb-inicio-chips"><li><Fingerprint size={15} />Identidad</li><li><Layers3 size={15} />Formatos</li><li><FileCheck2 size={15} />Revisión previa</li></ul>
                    <span className="pb-inicio-role">Secretaría EPI</span>
                </div>
            </section>
            <section className="pb-inicio-section" id="inicio-2" data-section="2" aria-labelledby="inicio-revisar">
                <div className="pb-inicio-card pb-inicio-paso">
                    {foto('revisar') && <Foto foto={foto('revisar')} />}
                    <p className="pb-inicio-eyebrow">02 · Revisar</p>
                    <h2 id="inicio-revisar">La tecnología orienta.<br /><em>La persona decide.</em></h2>
                    <div className="pb-inicio-flow"><span>Recepción</span><ArrowRight size={15} /><span>Revisión</span><ArrowRight size={15} /><span>Dictamen</span></div>
                    <span className="pb-inicio-role">Comando Departamental</span>
                </div>
            </section>
            <section className="pb-inicio-section pb-inicio-right" id="inicio-3" data-section="3" aria-labelledby="inicio-seguimiento">
                <div className="pb-inicio-card pb-inicio-paso">
                    {foto('seguimiento') && <Foto foto={foto('seguimiento')} />}
                    <p className="pb-inicio-eyebrow">03 · Dar seguimiento</p>
                    <h2 id="inicio-seguimiento">El trámite avanza.<br /><em>Su historia permanece.</em></h2>
                    <ul className="pb-inicio-chips"><li><Route size={15} />Trazabilidad</li><li><CheckCheck size={15} />Reportes</li></ul>
                    <Link className="pb-inicio-primary" to={target} onClick={enter}>Abrir acceso institucional<ArrowRight size={19} /></Link>
                    <span className="pb-inicio-role">Comando General · Registro y seguimiento</span>
                </div>
            </section>
            {galeria.length > 0 && <section className="pb-inicio-galeria" aria-labelledby="inicio-galeria">
                <h2 id="inicio-galeria">Al servicio de <em>La Paz.</em></h2>
                <div className={`pb-inicio-galeria-grid pb-inicio-galeria--${galeria.length}`}>
                    {galeria.map((f) => <figure key={f.src} className="pb-inicio-foto pb-inicio-galeria-item">
                        <img src={f.src} alt={f.alt} loading="lazy" decoding="async" />
                        <figcaption><strong>{f.titulo}</strong>{f.credito && <small>{f.credito}</small>}</figcaption>
                    </figure>)}
                </div>
            </section>}
        </main>
        <footer className="pb-inicio-footer"><span>Policía Boliviana<span className="pb-inicio-footer-divider"> / </span>Gestión documental</span><p>Información institucional. Los expedientes requieren una cuenta autorizada.</p></footer>
    </div>;
}
