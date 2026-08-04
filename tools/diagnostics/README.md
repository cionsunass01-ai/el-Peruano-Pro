# Herramientas de Diagnóstico Manual

**IMPORTANTE**: Estos scripts son herramientas manuales de soporte. **No** forman parte del pipeline productivo y **no deben ejecutarse** en el flujo automatizado de GitLab CI/CD.

## Características Generales
- Todas las operaciones son estrictamente **READ_ONLY** (solo lectura). No modifican estados en Drive ni envían correos electrónicos.
- Requieren credenciales reales inyectadas mediante variables de entorno (no utilice valores locales hardcodeados en el código).

## Variables de Entorno Necesarias
Para utilizar estos scripts de diagnóstico, asegúrese de tener configuradas las siguientes variables de entorno:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID` (requerido para `audit_drive_run.py`)

## Herramientas

### 1. `audit_drive_run.py`
Audita la estructura y los archivos procesados en una carpeta específica de Google Drive para una fecha dada.
- **Ejemplo**: `python tools/diagnostics/audit_drive_run.py --date 20260101`

### 2. `find_sent_reports.py`
Busca correos electrónicos enviados desde la cuenta autenticada para confirmar la emisión de los reportes.
- **Ejemplo**: `python tools/diagnostics/find_sent_reports.py --subject "Reporte Diario" --max-results 3`

### 3. `inspect_report_attachments.py`
Descarga o imprime en pantalla el contenido de los archivos CSV adjuntos en el último correo enviado que coincida con el filtro.
- **Ejemplo**: `python tools/diagnostics/inspect_report_attachments.py --subject "Reporte Diario"`

### 4. `verify_sent_report.py`
Filtra y valida los correos enviados buscando coincidencias específicas de ID de ejecución (Run ID) y fecha de la ejecución.
- **Ejemplo**: `python tools/diagnostics/verify_sent_report.py --date 20260101 --run-id abc123def`
