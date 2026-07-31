# OperaciÃ³n Local Programada (Temporal)

Esta documentaciÃ³n describe la ejecuciÃ³n automÃ¡tica diaria configurada localmente en Windows mediante Task Scheduler y Docker Desktop.

> [!WARNING]
> **Naturaleza Temporal y Exclusividad**
> Esta soluciÃ³n es provisional y se utiliza Ãºnicamente hasta que el pipeline productivo se migre a los servidores de OTI usando GitLab CI/CD.

## Exclusividad del Programador de Tareas (Scheduler)

- **Ãšnico Programador Autorizado:** Durante el perÃ­odo de operaciÃ³n local, Windows Task Scheduler es el **Ãºnico** programador automÃ¡tico autorizado para la ejecuciÃ³n diaria del proceso.
- **DesactivaciÃ³n de GitHub Actions (cron):** Los disparadores automÃ¡ticos (`schedule` / cron) en los workflows de GitHub Actions (`run&upload.yml` y `tania-daily.yml`) deben permanecer completamente deshabilitados para evitar ejecuciones duplicadas o conflictos.
- **Uso Manual Controlado:** Los disparadores manuales (`workflow_dispatch`) en GitHub Actions se mantienen exclusivamente para pruebas o ejecuciones manuales puntuales y controladas.
- **Regla de No Coexistencia:** Nunca deben coexistir dos programadores automÃ¡ticos activos en simultÃ¡neo.
- **TransiciÃ³n Futura:** Antes de migrar o activar la automatizaciÃ³n en GitLab CI/CD u OTI, es obligatorio desactivar y remover primero la tarea programada local de Windows Task Scheduler (`SUNASS-ElPeruano-Daily`).

## Requisitos de la MÃ¡quina

Para asegurar la ejecuciÃ³n correcta todos los dÃ­as a las **05:30 a. m.**, la PC debe cumplir con:
- **Encendido Continuo:** La PC debe permanecer encendida.
- **Sin SuspensiÃ³n:** La configuraciÃ³n de energÃ­a no debe permitir que el equipo entre en modo de suspensiÃ³n o hibernaciÃ³n.
- **SesiÃ³n Iniciada:** La sesiÃ³n del usuario configurado (propietario de los permisos de Docker) debe permanecer iniciada (puede estar bloqueada).
- **Docker Desktop:** Debe estar configurado para iniciar automÃ¡ticamente junto con el arranque del sistema o el inicio de sesiÃ³n del usuario.

## UbicaciÃ³n de los Logs

El orquestador (`scripts/run-local-daily.ps1`) genera un registro pormenorizado en cada ejecuciÃ³n.
- **Directorio de logs:** `logs/` (en la raÃ­z del proyecto `elPeruano`).
- **Formato del archivo:** `YYYYMMDD.log` (ej. `20260730.log`).

## Operaciones de la Tarea Programada

### EjecuciÃ³n Manual
Para ejecutar la rutina manualmente (o para verificar su funcionamiento en un momento arbitrario):
1. Abre PowerShell.
2. Ejecuta:
   ```powershell
   cd C:\Users\cion\Downloads\elPeruano
   .\scripts\run-local-daily.ps1
   ```

### Detener o Deshabilitar la Tarea
1. Abre el "Programador de Tareas" (Task Scheduler) de Windows.
2. Busca la tarea llamada **SUNASS-ElPeruano-Daily**.
3. Haz clic derecho y selecciona **Deshabilitar** (Disable) para pausar la automatizaciÃ³n, o **Eliminar** para removerla.

### Revisar la Ãšltima EjecuciÃ³n
Consulta el archivo log del dÃ­a actual en el directorio `logs/`. En Ã©l verÃ¡s detalles como el cÃ³digo de finalizaciÃ³n del scraper, si se encontrÃ³ el cuadernillo, o si se ejecutÃ³ el backend.

## Destinatarios (Mailing)

Los destinatarios del reporte final se configuran a travÃ©s de la variable de entorno `EMAIL_RECIPIENTS` (separados por coma) del archivo `.env`.

> [!IMPORTANT]
> - Las direcciones utilizadas deben ser **institucionales**.
> - En repositorios y versionamientos no deben compartirse ni guardarse correos personales o secretos reales.
> - Ninguna configuraciÃ³n de contraseÃ±as u OAuth se compromete a Git.
