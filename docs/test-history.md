# Historial de Pruebas y Parches (Test History)

## skip_old.py
- **Propósito original**: Parche temporal utilizado para buscar carpetas de prueba relacionadas con la fecha `20260719`.
- **Efectos en Drive**: Modificaba los `manifest.json` de dichas carpetas marcándolas como `processed` y `email_sent: true`.
- **Naturaleza**: Fue una simulación que omitía el procesamiento real del backend para apartar ejecuciones antiguas de la cola.
- **Estado actual**: Retirado del código fuente antes de preparar el despliegue institucional.
- **Advertencia**: No representa un procesamiento real y no debe volver a utilizarse en producción ni en GitLab CI.
