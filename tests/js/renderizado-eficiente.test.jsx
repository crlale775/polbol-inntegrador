import React, { Profiler } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene } from 'three';
import { agruparEscena } from '../../resources/js/components/landing/agruparEscena';
import CountUp from '../../resources/js/components/ui/CountUp';

afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('Renderizado eficiente',()=>{
    it('agrupa superficies sin perder geometría ni sus posiciones en el mundo',()=>{
        const scene=new Scene(),group=new Group();group.position.x=10;scene.add(group);
        const a=new Mesh(new BoxGeometry(),new MeshBasicMaterial({color:'#285343'}));a.position.x=2;group.add(a);
        const b=new Mesh(new BoxGeometry(),new MeshBasicMaterial({color:'#285343'}));b.position.x=-3;scene.add(b);
        agruparEscena(scene,new Set());
        const meshes=[];scene.traverse(object=>{if(object.isMesh)meshes.push(object);});
        expect(meshes).toHaveLength(1);
        const geometry=meshes[0].geometry;geometry.computeBoundingBox();
        expect(geometry.attributes.position.count/3).toBe(24);
        expect(geometry.boundingBox.min.x).toBe(-3.5);
        expect(geometry.boundingBox.max.x).toBe(12.5);
    });

    it('conserva los elementos que deben seguir animándose por separado',()=>{
        const scene=new Scene(),material=new MeshBasicMaterial();
        const fixed=new Mesh(new BoxGeometry(),material),animated=new Mesh(new BoxGeometry(),material);scene.add(fixed,animated);
        agruparEscena(scene,new Set([animated]));animated.rotation.y=.5;
        expect(animated.parent).toBe(scene);
        expect(animated.rotation.y).toBe(.5);
    });

    it('anima y actualiza las cifras sin producir commits de React por fotograma',()=>{
        vi.useFakeTimers();
        vi.stubGlobal('requestAnimationFrame',callback=>setTimeout(()=>callback(performance.now()),16));
        vi.stubGlobal('cancelAnimationFrame',clearTimeout);
        const commit=vi.fn();
        const view=render(<Profiler id="cifra" onRender={commit}><CountUp valor="20%" /></Profiler>);
        const initial=commit.mock.calls.length;
        act(()=>vi.advanceTimersByTime(700));
        expect(view.container.textContent).toBe('20%');
        expect(commit).toHaveBeenCalledTimes(initial);
        view.rerender(<Profiler id="cifra" onRender={commit}><CountUp valor="30%" /></Profiler>);
        act(()=>vi.advanceTimersByTime(700));
        expect(view.container.textContent).toBe('30%');
        expect(view.container.querySelector('[aria-label="30%"]')).toBeTruthy();
    });

    it('presenta la cifra completa sin animación con movimiento reducido',()=>{
        vi.spyOn(window,'matchMedia').mockReturnValue({matches:true});
        const view=render(<CountUp valor="61.8%" />);
        expect(view.container.textContent).toBe('61.8%');
    });
});
