FROM python:3.10-slim

WORKDIR /app

# Instalar dependencias del sistema operativo
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Configurar zona horaria por defecto (aunque ZoneInfo lo manejará, es buena práctica)
ENV TZ=America/Lima

# Copiar requirements primero
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY . .

# Comando principal
CMD ["python", "main.py"]
