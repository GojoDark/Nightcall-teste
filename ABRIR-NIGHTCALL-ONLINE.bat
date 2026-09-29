@echo off
setlocal
cd /d "%~dp0"
title Nightcall Online
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Nightcall] Node.js nao foi encontrado.
  echo Instale o Node.js 22 ou superior e tente novamente.
  echo.
  pause
  exit /b 1
)

echo.
echo ========================================
echo         NIGHTCALL ONLINE - TESTE
echo ========================================
echo.
echo Este modo cria um link HTTPS temporario para testar
 echo com outra pessoa fora da sua rede.
echo O link deixa de funcionar quando esta janela for fechada.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\online.ps1"
if errorlevel 1 (
  echo.
  echo O modo online foi encerrado com erro.
  pause
)
