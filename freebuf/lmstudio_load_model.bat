@echo off
REM =====================================================
REM  OFBOL - Reaplica la config de carga del modelo IA
REM  en LM Studio tras un reinicio:
REM    qwen2.5-vl-3b-instruct · context 4096 · parallel 1
REM    flash attention ON · KV cache en GPU · offload maximo
REM
REM  - Doble click: ejecuta y muestra el resultado.
REM  - Autoarranque: Win+R -> shell:startup -> crear acceso
REM    directo a este .bat. En LM Studio deja activado
REM    "Start server on startup".
REM =====================================================
title OFBOL - LM Studio modelo optimizado
echo === OFBOL: reaplicando config del modelo en LM Studio ===
REM --calentar: hace una consulta descartable del tamano real de trabajo para
REM que la primera revision de un secretario no pague ~4 s de inicializacion.
python "C:\laragon\www\ofbol\freebuf\lmstudio_load_model.py" --espera 300 --calentar
echo.
echo === Cerrando en 10 segundos... ===
REM `timeout` de cmd es un ejecutable del sistema; si el PATH tiene el de
REM Git/MSYS, gana ese y falla con "/t". `ping` es siempre el de Windows.
ping -n 11 127.0.0.1 >nul
