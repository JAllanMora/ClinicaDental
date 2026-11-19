@echo off
rem Arranca el bot de WhatsApp y lo vuelve a levantar si se cierra por un error.
rem Se abre solo al iniciar Windows (acceso directo en la carpeta Inicio).
title Bot WhatsApp Clinica
cd /d "%~dp0"
:loop
echo %date% %time% Iniciando bot...>> bot.log
call npm start >> bot.log 2>&1
echo %date% %time% El bot se detuvo; reinicio en 15 segundos.>> bot.log
timeout /t 15 /nobreak > nul
goto loop
