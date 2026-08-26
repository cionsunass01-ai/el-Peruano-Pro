param (
    [switch]$DryRun,
    [string]$MockResult = "READY_FOR_BACKEND",
    [string]$MockJsonScenario = "VALID"
)

$ErrorActionPreference = "Stop"
if ($PSScriptRoot) {
    $ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $ProjectPath = Get-Location
}
Set-Location -Path $ProjectPath

$DateStr = Get-Date -Format "yyyyMMdd"
$LogPath = "logs\$DateStr.log"
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" | Out-Null }

function Write-Log {
    param ([string]$Message)
    $TimeStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogMessage = "[$TimeStamp] $Message"
    Write-Host $LogMessage
    Add-Content -Path $LogPath -Value $LogMessage
}

Write-Log "=== INICIANDO TAREA DIARIA EL PERUANO $(if($DryRun){'[DRY-RUN]'}) ==="

# 5. ConfiguraciÃ³n de reintentos
$RetryIntervalMinutes = 30
$RetryDeadlineHour = 10
$RetryDeadlineMinute = 30

$ExecutionId = [guid]::NewGuid().ToString()
$env:ORCHESTRATION_ID = $ExecutionId
Write-Log "Execution ID: $ExecutionId"

# 6. Lock resistente a fallos
$LockFile = ".run.lock"
if (Test-Path $LockFile) {
    try {
        $lockData = Get-Content $LockFile | ConvertFrom-Json
        $lockPid = $lockData.PID
        $lockStartTime = [datetime]$lockData.StartTime

        $process = Get-Process -Id $lockPid -ErrorAction SilentlyContinue
        if ($process -ne $null -and $lockData.Computer -eq $env:COMPUTERNAME -and $process.StartTime -le $lockStartTime.AddMinutes(5)) {
            Write-Log "ALREADY_RUNNING: El proceso PID $lockPid continÃºa activo y corresponde a esta ejecuciÃ³n. Terminando."
            exit 0
        } else {
            Write-Log "STALE_LOCK: El proceso $lockPid ya no existe o pertenece a otra sesiÃ³n. Removiendo lock obsoleto."
            Remove-Item $LockFile -Force
        }
    } catch {
        Write-Log "STALE_LOCK: Archivo de lock invÃ¡lido o corrupto. Removiendo lock obsoleto."
        Remove-Item $LockFile -Force
    }
}

$startTime = Get-Date
$lockContent = @{
    PID = $PID
    StartTime = $startTime.ToString("o")
    Computer = $env:COMPUTERNAME
    ExecutionId = $ExecutionId
} | ConvertTo-Json
Set-Content -Path $LockFile -Value $lockContent -Force

try {
    # 3. Verificando Docker
    if (-not $DryRun) {
        Write-Log "Verificando disponibilidad de Docker Engine..."
        $dockerAvailable = $false
        $maxRetries = 10
        $retryWaitSeconds = 30
        
        for ($i = 1; $i -le $maxRetries; $i++) {
            Write-Log "Intento $i de $maxRetries ejecutando 'docker info'..."
            try {
                $null = docker info 2>&1
                if ($?) {
                    $dockerAvailable = $true
                    Write-Log "Docker Engine está disponible y respondiendo."
                    break
                }
            } catch {}
            
            if ($i -lt $maxRetries) {
                Write-Log "Docker aún no responde. Esperando $retryWaitSeconds segundos..."
                # Opcional: Intentar iniciar Docker Desktop en el primer fallo
                if ($i -eq 1) {
                    $dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
                    if (Test-Path $dockerDesktopExe) {
                        Write-Log "Iniciando proceso de Docker Desktop en background..."
                        Start-Process -FilePath $dockerDesktopExe -WindowStyle Hidden -ErrorAction SilentlyContinue
                    }
                }
                Start-Sleep -Seconds $retryWaitSeconds
            }
        }

        if (-not $dockerAvailable) {
            Write-Log "DOCKER_ERROR: Docker Engine no respondió después de $maxRetries intentos. Abortando."
            exit 1
        }
    }

    if (Test-Path ".env") {
        Get-Content ".env" | ForEach-Object {
            if ($_ -match '^\s*([^#=]+)=(.*)$') {
                $key = $matches[1].Trim()
                $val = $matches[2].Trim()
                if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                    [System.Environment]::SetEnvironmentVariable($key, $val)
                }
            }
        }
    }
    if (-not $env:TARGET_DATE) { $env:TARGET_DATE = "" }
    if (-not $env:FORCE_REPROCESS) { $env:FORCE_REPROCESS = "false" }

    $internalResultFile = "downloads\run-result.json"
    $rootResultFile = "run-result.json"

    $attempt = 1
    $maxAttempts = 5 # Arbitrario para la lÃ³gica temporal, aunque se rige por la hora
    $scraperStatus = "NOT_AVAILABLE"

    while ($true) {
        Write-Log "--- Intento $attempt ---"

        if (Test-Path $internalResultFile) { Remove-Item $internalResultFile -Force }
        if (Test-Path $rootResultFile) { Remove-Item $rootResultFile -Force }

        if ($DryRun) {
            Write-Log "[DryRun] Simulando ejecuciÃ³n de Scraper..."
            # AquÃ­ podrÃ­amos simular escribir un JSON mock, pero usaremos el flag para testear casos
            # Por simplicidad el usuario dijo "Simular los resultados: READY_FOR_BACKEND..."
            # Tomaremos el input interactivo o asumiremos un resultado para validarlo:
            $mockJson = @{
                result = $MockResult
                date = $DateStr
                run_id = "mock-run-id"
                manifest_id = "mock-manifest"
                message = "DryRun mock message"
                timestamp = $startTime.ToUniversalTime().AddMinutes(1).ToString("o")
                execution_id = $ExecutionId
            }

            if ($MockJsonScenario -eq "CORRUPT") {
                Set-Content -Path $internalResultFile -Value "{ invalid json"
            } elseif ($MockJsonScenario -eq "MISSING") {
                # No escribir nada
            } elseif ($MockJsonScenario -eq "WRONG_DATE") {
                $mockJson.date = "19900101"
                $mockJson | ConvertTo-Json | Set-Content -Path $internalResultFile
            } elseif ($MockJsonScenario -eq "WRONG_ID") {
                $mockJson.execution_id = "other-id"
                $mockJson | ConvertTo-Json | Set-Content -Path $internalResultFile
            } elseif ($MockJsonScenario -eq "OLD_TIMESTAMP") {
                $mockJson.timestamp = $startTime.ToUniversalTime().AddDays(-1).ToString("o")
                $mockJson | ConvertTo-Json | Set-Content -Path $internalResultFile
            } elseif ($MockJsonScenario -eq "UNKNOWN_RESULT") {
                $mockJson.result = "UNKNOWN_CODE"
                $mockJson | ConvertTo-Json | Set-Content -Path $internalResultFile
            } else {
                $mockJson | ConvertTo-Json | Set-Content -Path $internalResultFile
            }

            $scraperExitCode = 0
        } else {
            Write-Log "Ejecutando Scraper en Docker..."
            & docker compose --profile scraper run --rm --build scraper
            $scraperExitCode = $LASTEXITCODE
            Write-Log "Scraper exit code: $scraperExitCode"
        }

        $resultStatus = "SCRAPER_ERROR"

        if (Test-Path $internalResultFile) {
            Copy-Item $internalResultFile -Destination $rootResultFile -Force
            try {
                $resultData = Get-Content $rootResultFile -Raw | ConvertFrom-Json

                # Validar el JSON y proteger contra antiguo
                $isValidJson = $true
                if ($resultData.date -ne $DateStr) { Write-Log "Error: Fecha en JSON no coincide."; $isValidJson = $false }
                if ($resultData.execution_id -ne $ExecutionId) { Write-Log "Error: execution_id no coincide."; $isValidJson = $false }

                $resultTimestamp = [datetime]$resultData.timestamp
                if ($resultTimestamp.ToUniversalTime() -lt $startTime.ToUniversalTime()) { Write-Log "Error: Timestamp es anterior a esta ejecuciÃ³n."; $isValidJson = $false }

                $allowedResults = @("READY_FOR_BACKEND", "ALREADY_PROCESSED", "NOT_AVAILABLE", "VALIDATION_FAILED", "SCRAPER_ERROR")
                if ($resultData.result -notin $allowedResults) { Write-Log "Error: Resultado desconocido."; $isValidJson = $false }

                if ($isValidJson) {
                    $resultStatus = $resultData.result
                    $message = $resultData.message
                    Write-Log "Resultado vÃ¡lido: $resultStatus - $message"
                } else {
                    Write-Log "JSON de resultado corrupto o antiguo."
                    $resultStatus = "SCRAPER_ERROR"
                }
            } catch {
                Write-Log "Error parseando run-result.json."
                $resultStatus = "SCRAPER_ERROR"
            }
        } else {
            Write-Log "No se encontrÃ³ run-result.json. Asumiendo SCRAPER_ERROR."
            $resultStatus = "SCRAPER_ERROR"
        }

        $scraperStatus = $resultStatus

        if ($scraperStatus -eq "NOT_AVAILABLE") {
            $currentTime = Get-Date
            $deadline = (Get-Date).Date.AddHours($RetryDeadlineHour).AddMinutes($RetryDeadlineMinute)

            if ($currentTime -lt $deadline) {
                Write-Log "Cuadernillo aÃºn NO disponible. Reintentando en $RetryIntervalMinutes minutos..."
                if ($DryRun) {
                    Write-Log "[DryRun] Simulando espera de 30 minutos y reintentando..."
                    Start-Sleep -Seconds 1
                    # En la simulaciÃ³n rompemos el bucle despuÃ©s del primer reintento para probar el backend
                    # pero aquÃ­ lo limitaremos a 1 intento extra para no colgarse
                    if ($attempt -ge 2) { break }
                } else {
                    Start-Sleep -Seconds ($RetryIntervalMinutes * 60)
                }
                $attempt++
                continue
            } else {
                Write-Log "LÃ­mite de tiempo alcanzado ($($RetryDeadlineHour):$($RetryDeadlineMinute)). Abortando reintentos diarios."
                break
            }
        } elseif ($scraperStatus -eq "SCRAPER_ERROR") {
            if ($attempt -eq 1) {
                Write-Log "SCRAPER_ERROR detectado. Reintentando inmediatamente 1 sola vez por fallo tÃ©cnico."
                $attempt++
                continue
            } else {
                Write-Log "Segundo SCRAPER_ERROR detectado. Abortando ejecuciones."
                break
            }
        } else {
            # READY_FOR_BACKEND, ALREADY_PROCESSED, VALIDATION_FAILED no se reintentan
            break
        }
    }

    if ($scraperStatus -eq "READY_FOR_BACKEND") {
        Write-Log "Iniciando Backend..."
        if ($DryRun) {
            Write-Log "[DryRun] Backend would run"
            $backendExitCode = 0
        } else {
            & docker compose --profile backend run --rm --build backend
            $backendExitCode = $LASTEXITCODE
        }
        Write-Log "Backend exit code: $backendExitCode"

        if ($backendExitCode -eq 0) {
            Write-Log "Backend ejecutado con exit code 0. Realizando comprobaciÃ³n posterior READ_ONLY..."
            $backendConfirmExitCode = 1
            if ($DryRun) {
                if ($MockResult -eq "BACKEND_CONFIRMATION_FAILED") {
                    Write-Log "[DryRun] Simulando confirmaciÃ³n posterior fallida."
                    $backendConfirmExitCode = 1
                } else {
                    Write-Log "[DryRun] Simulando manifest procesado correctamente."
                    $backendConfirmExitCode = 0
                }
            } else {
                $manifestId = $resultData.manifest_id
                $runId = $resultData.run_id
                $processedDate = $resultData.date

                if (-not $manifestId -or -not $runId -or -not $processedDate) {
                    Write-Log "BACKEND_CONFIRMATION_FAILED: Identificadores (manifest_id, run_id, date) no encontrados en run-result.json"
                    $backendConfirmExitCode = 1
                } else {
                    $checkScript = "import sys; from src.drive_uploader import verify_manifest_processed; sys.exit(0 if verify_manifest_processed('$manifestId', '$runId', '$processedDate') else 1)"
                    & docker compose --profile scraper run --rm --entrypoint python scraper -c $checkScript
                    $backendConfirmExitCode = $LASTEXITCODE
                }
            }

            if ($backendConfirmExitCode -eq 0) {
                Write-Log "BACKEND_CONFIRMED: Backend procesado con Ã©xito y manifest verificado (status=processed, email_sent=true)."
            } else {
                Write-Log "BACKEND_CONFIRMATION_FAILED: Backend terminÃ³ con exit code 0 pero la verificaciÃ³n posterior del manifest fallÃ³."
            }
        } else {
            Write-Log "BACKEND_ERROR: Fallo en la ejecuciÃ³n del Backend (exit code: $backendExitCode)."
        }
    } elseif ($scraperStatus -eq "ALREADY_PROCESSED") {
        Write-Log "ALREADY_PROCESSED: Fecha ya procesada. No se ejecutarÃ¡ el Backend."
    } elseif ($scraperStatus -eq "NOT_AVAILABLE") {
        Write-Log "NOT_AVAILABLE definitivo: No se ejecutarÃ¡ el Backend por hoy."
    } elseif ($scraperStatus -eq "VALIDATION_FAILED") {
        Write-Log "VALIDATION_FAILED: FallÃ³ validaciÃ³n del PDF. No se ejecutarÃ¡ el Backend."
    } else {
        Write-Log "SCRAPER_ERROR: Error en Scraper. No se ejecutarÃ¡ el Backend."
    }

} finally {
    if (Test-Path $LockFile) {
        $currentLockData = $null
        try { $currentLockData = Get-Content $LockFile -ErrorAction SilentlyContinue | ConvertFrom-Json } catch {}
        if ($currentLockData -and $currentLockData.PID -eq $PID) {
            Remove-Item $LockFile -Force
        }
    }

    $endTime = Get-Date
    $duration = $endTime - $startTime
    Write-Log "DuraciÃ³n Total: $($duration.TotalSeconds) segundos."
    Write-Log "=== TAREA DIARIA FINALIZADA ==="
}
