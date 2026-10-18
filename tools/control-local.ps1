param([ValidateSet('Actualizar','Iniciar','Detener','Estado','Respaldar','Preparar')][string]$Accion='Estado')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')); Set-Location -LiteralPath $root
$local=Join-Path $root '.local'; New-Item -ItemType Directory -Force -Path $local | Out-Null
$mutex=New-Object Threading.Mutex($false,'Local\ControlCajaLocal'); $locked=$false; $transcript=$false; $resume=$false
function Run([string]$Command,[string[]]$Arguments){ & $Command @Arguments; if($LASTEXITCODE -ne 0){throw "$Command fallo (codigo $LASTEXITCODE)."} }
function RequireNode { if(!(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Instala Node.js 24 o posterior.'}; $major=& node.exe -p 'parseInt(process.versions.node)'; if([int]$major -lt 24){throw 'Control Caja requiere Node.js 24 o posterior.'} }
function Listeners { @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in 4100,5174}) }
function Ports { foreach($c in (Listeners)){ $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($c.OwningProcess)"; Write-Host "Puerto $($c.LocalPort): PID $($c.OwningProcess) $($p.Name)"; Write-Host "Comando: $($p.CommandLine)" } }
function Owned { $file=Join-Path $local 'processes.json'; if(!(Test-Path $file)){return}; $entries=Get-Content $file -Raw | ConvertFrom-Json; foreach($e in $entries){ $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($e.Id)"; if($p -and $p.Name -eq 'node.exe' -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $e.Created -and $p.CommandLine.Contains($e.Script) -and $e.Script.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){$p} } }
function FreePorts { if(@(Listeners).Count){Ports;throw 'Los puertos 4100/5174 estan ocupados. No se detendra ningun servicio ajeno.'} }
function StopOwn { foreach($p in @(Owned)){Write-Host "Deteniendo Control Caja PID $($p.ProcessId)";Stop-Process -Id $p.ProcessId -ErrorAction Stop}; $file=Join-Path $local 'processes.json'; if(Test-Path $file){Remove-Item $file -Force} }
function Backup {
  $dest=Join-Path $local ('backups\'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)); New-Item -ItemType Directory -Force -Path $dest|Out-Null
  foreach($relative in @('server\.env','client\.env','.env')){ $src=Join-Path $root $relative; if(Test-Path $src){$target=Join-Path $dest $relative;New-Item -ItemType Directory -Force -Path (Split-Path $target)|Out-Null;Copy-Item $src $target} }
  if(Test-Path 'server\.env'){Run 'node.exe' @('tools/local-db.mjs','backup',$dest)}
  git rev-parse HEAD 2>$null | Set-Content (Join-Path $dest 'commit.txt')
  Write-Host "Respaldo: $dest"
}
function GitReady { if((git branch --show-current) -ne 'main'){throw 'Usa la rama main.'}; if((git remote get-url origin) -ne 'https://github.com/ManuelAcostaGuerrero/control-caja.git'){throw 'Origin no corresponde a control-caja.'}; $dirty=@(git status --porcelain); if($dirty.Count){$dirty|Write-Host;throw 'Hay cambios locales. No se hizo reset, stash ni descarte automatico.'} }
function StartOwn {
  if(@(Owned).Count){throw 'Control Caja ya esta iniciado.'}; FreePorts
  if(!(Test-Path 'server\.env') -or !(Test-Path 'client\.env')){throw 'Falta configuracion. Ejecuta Preparar.bat.'}
  if(!(Test-Path 'client\dist\index.html')){throw 'Falta compilar la pantalla. Ejecuta Actualizar.bat.'}
  Run 'node.exe' @('tools/local-db.mjs','check')
  $entries=@(); try { foreach($name in @('server','client')){ $script=if($name -eq 'server'){Join-Path $root 'tools\start-backend.mjs'}else{Join-Path $root 'tools\start-web.mjs'}; $p=Start-Process node.exe -ArgumentList ('"'+$script+'"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $local "$name.out.log") -RedirectStandardError (Join-Path $local "$name.err.log"); $info=Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)"; $entries+=@{Id=$p.Id;Created=$info.CreationDate.ToUniversalTime().ToString('o');Script=$script}; ConvertTo-Json -InputObject @($entries)|Set-Content (Join-Path $local 'processes.json') }
    $ready=$false; for($i=0;$i -lt 15;$i++){Start-Sleep 1; try{$h=Invoke-RestMethod 'http://127.0.0.1:4100/api/health' -TimeoutSec 2;$w=Invoke-WebRequest 'http://127.0.0.1:5174' -UseBasicParsing -TimeoutSec 2;if($h.service -eq 'control-caja-api' -and $w.StatusCode -eq 200){$ready=$true;break}}catch{}}
    if(!$ready){throw 'Control Caja no respondio. Revisa .local/*.err.log.'}; Write-Host 'Control Caja listo: http://localhost:5174'
  } catch {StopOwn;throw}
}
try {
  $locked=$mutex.WaitOne(0); if(!$locked){throw 'Otro control de Control Caja esta en ejecucion.'}; Start-Transcript -Path (Join-Path $local ((Get-Date -Format 'yyyyMMdd-HHmmss')+"-$Accion.log")) -Append|Out-Null; $transcript=$true
  Write-Host "CONTROL CAJA - $Accion - $root"; if(Test-Path 'VERSION'){Write-Host "Version: $((Get-Content VERSION -Raw).Trim())"}
  if($Accion -ne 'Estado' -and $Accion -ne 'Detener'){RequireNode}
  switch($Accion){
    'Estado' {Ports;Write-Host "Procesos propios: $(@(Owned).Count)";git status --short --branch;Write-Host "server/.env: $(Test-Path 'server\.env') | client/.env: $(Test-Path 'client\.env')"}
    'Detener' {StopOwn;Ports}
    'Preparar' {if(@(Owned).Count){throw 'Deten Control Caja antes de preparar.'};FreePorts;if(!(Test-Path 'node_modules')){Run 'npm.cmd' @('install')};Run 'node.exe' @('tools/local-db.mjs','configure');Run 'node.exe' @('tools/validate-update.mjs');Run 'npm.cmd' @('run','build');Write-Host 'Preparacion lista. Usa Iniciar.bat.'}
    'Respaldar' {Backup}
    'Iniciar' {StartOwn}
    'Actualizar' {
      GitReady; $ownIds=@(Owned|ForEach-Object {$_.ProcessId}); if(@(Listeners|Where-Object {$_.OwningProcess -notin $ownIds}).Count){Ports;throw 'Hay un servicio ajeno usando los puertos del proyecto.'}; $resume=@(Owned).Count -gt 0
      if(!(Test-Path 'node_modules')){Run 'npm.cmd' @('install')}; Backup; Run 'git.exe' @('fetch','origin','main'); & git.exe merge-base --is-ancestor HEAD origin/main; if($LASTEXITCODE -ne 0){throw 'La rama local diverge o tiene commits no publicados. No se hizo reset ni merge forzado.'}
      if($resume){StopOwn}; FreePorts; Run 'git.exe' @('merge','--ff-only','origin/main'); Run 'npm.cmd' @('install'); Run 'node.exe' @('tools/validate-update.mjs'); Run 'npm.cmd' @('run','test'); Run 'npm.cmd' @('run','build'); if(Test-Path 'server\.env'){Run 'node.exe' @('tools/local-db.mjs','check')}
      if($resume){StartOwn;Write-Host 'Actualizacion completada y sistema reiniciado.'}else{Write-Host 'Actualizacion completada. El sistema estaba detenido; usa Iniciar.bat.'}
    }
  }
} catch {Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red; if($Accion -eq 'Actualizar'){Write-Host 'No se forzaron cambios ni se restauraron datos automaticamente.'}; exit 1}
finally {if($transcript){Stop-Transcript|Out-Null};if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
