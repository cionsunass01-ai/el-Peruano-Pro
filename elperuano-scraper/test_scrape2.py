import time
import logging
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

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
time.sleep(5)

date = "19/07/2026"
logging.info(f"Llenando fecha {date}")
try:
    date_input = driver.find_element(By.ID, "cddesde")
    driver.execute_script("arguments[0].value = '';", date_input)
    driver.execute_script(f"arguments[0].value = '{date}';", date_input)
    
    date_input_hasta = driver.find_element(By.ID, "cdhasta")
    driver.execute_script("arguments[0].value = '';", date_input_hasta)
    driver.execute_script(f"arguments[0].value = '{date}';", date_input_hasta)
    
    btn_buscar = driver.find_element(By.ID, "btnBuscar")
    btn_buscar.click()
    
    logging.info("Click en Buscar, esperando 10s...")
    time.sleep(10)
    
    # Save again
    driver.save_screenshot("/downloads/test_screenshot2.png")
    with open("/downloads/test_page2.html", "w", encoding="utf-8") as f:
        f.write(driver.page_source)
        
    btn = driver.find_element(By.CSS_SELECTOR, "input[data-tipo='CuNl']")
    logging.info(f"Encontrado CuNl: {btn.get_attribute('data-url')}")
except Exception as e:
    logging.error(f"Error: {e}")

driver.quit()
