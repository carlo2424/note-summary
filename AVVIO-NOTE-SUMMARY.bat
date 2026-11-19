@echo off
cd /d "%~dp0"
title Note Summary
echo Avvio Note Summary su http://127.0.0.1:5174/
echo Chiudi questa finestra per fermare l'app.
call npm run dev
pause