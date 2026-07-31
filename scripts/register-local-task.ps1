param (
    [switch]$Replace,
    [switch]$DryRun
)

$TaskName = "SUNASS-ElPeruano-Daily"
$TaskDescription = "Descarga y anÃ¡lisis diario de Normas Legales de El Peruano."
$ScriptPath = "C:\Users\cion\Downloads\elPeruano\scripts\run-local-daily.ps1"
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask -and -not $Replace) {
    Write-Host "La tarea '$TaskName' ya existe. Usa -Replace para sobrescribirla."
    exit 1
}

$Principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At 05:30
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

if ($DryRun) {
    Write-Host "=== DRY RUN (SimulaciÃ³n de Registro) ==="
    Write-Host "Nombre de tarea: $TaskName"
    Write-Host "Hora: 05:30"
    Write-Host "Usuario: $User"
    Write-Host "Ruta del script: $ScriptPath"
    Write-Host "LogonType: Interactive"
    Write-Host "RunLevel: Limited"
    Write-Host "StartWhenAvailable: True"
    Write-Host "MultipleInstances: IgnoreNew"
    Write-Host "Ya existe: $(if($existingTask){'SÃ­'}else{'No'})"
    exit 0
}

if ($existingTask -and $Replace) {
    Write-Host "Reemplazando tarea existente..."
    Set-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null
    Write-Host "Tarea '$TaskName' reemplazada correctamente."
} else {
    Register-ScheduledTask -TaskName $TaskName -Description $TaskDescription -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null
    Write-Host "Tarea '$TaskName' registrada correctamente para ejecutarse diariamente a las 05:30 a. m. con el usuario '$User'."
}
