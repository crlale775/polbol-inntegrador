import { BufferGeometry, BufferAttribute, Mesh } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Unir superficies inmóviles que comparten material evita cientos de draw calls. */
export function agruparEscena(scene, dinamicos) {
    scene.updateMatrixWorld(true);
    const buckets=new Map(), originales=new Set(), descartados=new Set(), conservados=new Set();
    const meshes=[];
    scene.traverse(object=>{
        if(object.isMesh&&!object.isInstancedMesh&&!dinamicos.has(object))meshes.push(object);
        else if(object.material)for(const material of Array.isArray(object.material)?object.material:[object.material])conservados.add(material);
    });
    for(const object of meshes){
        const materials=Array.isArray(object.material)?object.material:[object.material];
        if(materials.some(material=>!material.isMeshBasicMaterial&&!material.isMeshStandardMaterial))continue;
        const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        const groups=Array.isArray(object.material)?object.geometry.groups:[{start:0,count:geometry.attributes.position.count,materialIndex:0}];
        for(const group of groups){
            const material=materials[group.materialIndex];
            const key=JSON.stringify([material.type,material.color?.getHex(),material.emissive?.getHex(),material.emissiveIntensity,material.roughness,material.metalness,material.map?.uuid,material.emissiveMap?.uuid,material.normalMap?.uuid,material.side,material.transparent,material.opacity,material.blending,material.depthWrite,material.depthTest,material.toneMapped,material.wireframe,material.vertexColors,material.fog,material.alphaTest,Object.keys(geometry.attributes).sort()]);
            let bucket=buckets.get(key);
            if(!bucket){bucket={material,geometries:[]};buckets.set(key,bucket);conservados.add(material);}
            descartados.add(material);
            const part=new BufferGeometry();
            for(const [name,attribute] of Object.entries(geometry.attributes)){
                const start=group.start*attribute.itemSize,end=(group.start+group.count)*attribute.itemSize;
                part.setAttribute(name,new BufferAttribute(attribute.array.slice(start,end),attribute.itemSize,attribute.normalized));
            }
            bucket.geometries.push(part);
        }
        geometry.dispose();originales.add(object.geometry);object.removeFromParent();
    }
    for(const {material,geometries} of buckets.values()){
        const geometry=geometries.length===1?geometries[0]:mergeGeometries(geometries,false);
        if(geometry){const mesh=new Mesh(geometry,material);mesh.matrixAutoUpdate=false;scene.add(mesh);if(geometries.length>1)geometries.forEach(part=>part.dispose());}
        else for(const part of geometries){const mesh=new Mesh(part,material);mesh.matrixAutoUpdate=false;scene.add(mesh);}
    }
    originales.forEach(geometry=>geometry.dispose());
    descartados.forEach(material=>{if(!conservados.has(material))material.dispose();});
    scene.updateMatrixWorld(true);
}
