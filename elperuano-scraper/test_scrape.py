import time
import logging
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

logging.basicConfig(level=logging.INFO)

options = Options()
options.binary_location = '/usr/bin/chromium'
options.add_argument("--headless=new")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--disable-gpu")
options.add_argument("--window-size=1920,1080")

driver = webdriver.Chrome(options=options)
url = "https://diariooficial.elperuano.pe/Normas"
logging.info(f"Navegando a {url}")
driver.get(url)
time.sleep(10)

logging.info(f"URL actual: {driver.current_url}")
logging.info(f"Titulo: {driver.title}")

# Guardar screenshot
driver.save_screenshot("/downloads/test_screenshot.png")
logging.info("Screenshot guardado en /downloads/test_screenshot.png")

# Guardar HTML
with open("/downloads/test_page.html", "w", encoding="utf-8") as f:
    f.write(driver.page_source)
logging.info("HTML guardado en /downloads/test_page.html")

# Buscar selectores
try:
    btn = driver.find_element(By.CSS_SELECTOR, "input[data-tipo='CuNl']")
    logging.info(f"Encontrado CuNl: {btn.get_attribute('data-url')}")
except Exception as e:
    logging.error(f"No se encontro CuNl: {e}")

driver.quit()
