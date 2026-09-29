$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$tools = Join-Path $root 'tools'
$cloudflared = Join-Path $tools 'cloudflared.exe'
$serverOut = Join-Path $env:TEMP 'nightcall-server.out.log'
$serverErr = Join-Path $env:TEMP 'nightcall-server.err.log'
$tunnelOut = Join-Path $env:TEMP 'nightcall-tunnel.out.log'
$tunnelErr = Join-Path $env:TEMP 'nightcall-tunnel.err.log'
New-Item -ItemType Directory -Force -Path $tools | Out-Null
Remove-Item $serverOut,$serverErr,$tunnelOut,$tunnelErr -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $cloudflared)) {
  Write-Host '[Nightcall] Baixando Cloudflare Tunnel oficial...' -ForegroundColor Cyan
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}

$server = $null
$tunnel = $null
try {
  Write-Host '[Nightcall] Iniciando servidor local...' -ForegroundColor Cyan
  $server = Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory $root -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru -WindowStyle Hidden

  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 400
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
      if ($health.ok) { $ready = $true; break }
    } catch {}
    if ($server.HasExited) { break }
  }
  if (-not $ready) { throw 'O servidor local nao iniciou. Veja os logs em %TEMP%.' }

  Write-Host '[Nightcall] Criando link HTTPS temporario...' -ForegroundColor Cyan
  $tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel','--url','http://127.0.0.1:3000','--no-autoupdate') -WorkingDirectory $root -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr -PassThru -WindowStyle Hidden

  $url = $null
  for ($i=0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    $text = ((Get-Content $tunnelOut -Raw -ErrorAction SilentlyContinue) + "`n" + (Get-Content $tunnelErr -Raw -ErrorAction SilentlyContinue))
    $m = [regex]::Match($text, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value; break }
    if ($tunnel.HasExited) { break }
  }
  if (-not $url) { throw 'Nao foi possivel obter o link do tunnel. Verifique sua internet/firewall.' }

  try { Set-Clipboard -Value $url } catch {}
  Write-Host ''
  Write-Host '========================================' -ForegroundColor Magenta
  Write-Host ' NIGHTCALL ESTA ONLINE PARA TESTE' -ForegroundColor Magenta
  Write-Host '========================================' -ForegroundColor Magenta
  Write-Host ''
  Write-Host $url -ForegroundColor Green
  Write-Host ''
  Write-Host 'O link foi copiado para a area de transferencia.'
  Write-Host 'Envie esse MESMO link para sua esposa.'
  Write-Host 'Nao compartilhe publicamente: e um ambiente de teste.' -ForegroundColor Yellow
  Write-Host 'Mantenha esta janela aberta. Ctrl+C encerra o acesso online.'
  Write-Host ''
  Start-Process $url
  Wait-Process -Id $tunnel.Id
}
finally {
  if ($tunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
