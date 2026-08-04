# Configuración de la PC Dedicada para El Peruano

Este documento registra los requisitos ambientales de Windows y energía para asegurar que la automatización se ejecute puntualmente y de forma autónoma en la PC dedicada.

## 1. Requisitos de Ejecución
- **Hora del Trigger:** La tarea se dispara diariamente a las **05:30 a. m.** local.
- **Sesión de Usuario:** La sesión del usuario asignado debe permanecer iniciada. **Windows SÍ puede estar bloqueado** (Pantalla de bloqueo activa con `Win+L`).
- **Docker Desktop:** Debe estar ejecutándose en el background. El script verifica su disponibilidad antes de lanzar el scraper.

## 2. Configuración Energética
Para que la PC pueda disparar tareas a las 05:30 a. m. cuando no hay nadie físicamente usándola, el plan de energía activo debe modificarse para evitar estados de procesador dormido (`S3`):

- **Suspensión en corriente:** Nunca
- **Hibernación en corriente:** Nunca
- **Apagado de pantalla:** SÍ puede estar activo (es recomendable para proteger el monitor y ahorrar energía).

Los comandos requeridos y ya aplicados (`cmd` o `powershell` como Administrador) son:
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

## 3. Resiliencia de la Tarea Programada (Task Scheduler)
La tarea registrada cuenta con dos mecanismos de seguridad configurados en su XML (`register-local-task.ps1`):
1. **WakeToRun (`-WakeToRun`):** Actúa como respaldo físico de hardware (RTC Wake) si, por algún fallo o cambio manual, la PC llegó a entrar en estado de Suspensión (S3).
2. **StartWhenAvailable (`-StartWhenAvailable`):** Si por fuerza mayor la PC estuvo completamente apagada (shut down) a las 05:30, permite que la tarea se encole y se ejecute automáticamente apenas la PC arranque y un usuario inicie sesión.

## 4. Riesgos Conocidos
Si el equipo de Windows se **reinicia por una actualización automática (Windows Update) o un corte de energía**, y ningún usuario inicia sesión presencialmente o remotamente, Docker Desktop no arrancará su motor WSL2 (ya que requiere un entorno de escritorio cargado) y la tarea fallará, aunque Task Scheduler intente arrancarla en estado `InteractiveToken`. Es indispensable usar Autologon de Windows o iniciar sesión al menos una vez tras un reinicio físico.
