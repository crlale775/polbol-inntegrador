# Regenerar el mapa de OFBOL

Estos scripts son los que se usan cuando el CLI oficial de Graphify no se puede instalar. Requieren:
- Una copia del código de Graphify en `/tmp/gh/graphify` (`git clone https://github.com/Graphify-Labs/graphify`).
- `tree_sitter_stub.py` copiado como `/tmp/gstub/tree_sitter/__init__.py`.
- Los scripts en `/tmp/gscripts/`.
- El código fuente del proyecto en `/tmp/ofbol`.

Pasos:
```
python3 -I extract_ofbol.py /tmp/ofbol extract.json
python3 -I run_pipeline.py /tmp/ofbol graphify-out extract.json
python3 -I build_map.py extract.json graphify-out
```

Con cada cambio, agrega una entrada en `cambios.md`. Aparece en la sección "Cambios recientes" del mapa.

Si Graphify está instalado (`pipx install graphifyy`), alcanza con `/graphify . --update` en Claude Code.
