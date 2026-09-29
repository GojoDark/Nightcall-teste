@echo off
setlocal
cd /d "%~dp0"
title Nightcall
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Nightcall] Node.js nao foi encontrado.
  echo Instale o Node.js 24 ou superior e tente novamente.
  echo.
  pause
  exit /b 1
)
start "" "http://localhost:3000"
echo.
echo ========================================
echo              NIGHTCALL
echo ========================================
echo Servidor: http://localhost:3000
echo Para encerrar, feche esta janela ou use Ctrl+C.
echo.
node --env-file-if-exists=.env server/index.js
if errorlevel 1 (
  echo.
  echo O Nightcall foi encerrado com erro.
  pause
)
