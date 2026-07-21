import time
import logging
import requests
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo  

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from selenium.webdriver.edge.options import Options as EdgeOptions


class ElPeruanoScraper:
    
    SUPPORTED_BROWSERS = ['chrome', 'firefox', 'edge', 'auto']
    
    def __init__(self, config_or_path, headless: bool = True, browser: str = 'auto'):
      
        if hasattr(config_or_path, 'DOWNLOAD_DIR'):
            self.config = config_or_path
            self.download_dir = config_or_path.DOWNLOAD_DIR
            self.headless = getattr(config_or_path, 'HEADLESS', headless)
        else:
            self.config = None
            self.download_dir = Path(config_or_path)
            self.headless = headless
        
        self.download_dir.mkdir(parents=True, exist_ok=True)
        
        self.browser = browser.lower()
        if self.browser not in self.SUPPORTED_BROWSERS:
            raise ValueError(f"Navegador no soportado. Use: {', '.join(self.SUPPORTED_BROWSERS)}")
        
        self.logger = logging.getLogger("elperuano_scraper")
        self.driver = None
        
        mode = "HEADLESS (sin ventana)" if self.headless else "VISIBLE (con ventana)"
        self.logger.info(f"Modo de navegador: {mode}")
    
    def get_peru_date(self) -> str:
        self.logger.info("Hardcoding fecha a 19/07/2026 para asegurar cuadernillo")
        return "19/07/2026"
    
    def _setup_chrome(self) -> webdriver.Chrome:
        options = ChromeOptions()
        options.binary_location = '/usr/bin/chromium'
        
        if self.headless:
            options.add_argument("--headless=new")
            self.logger.info("Chrome configurado en modo HEADLESS")
        
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--log-level=3")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option('excludeSwitches', ['enable-logging'])
        options.add_experimental_option("prefs", {
            "download.default_directory": str(self.download_dir.absolute()),
            "download.prompt_for_download": False,
            "plugins.always_open_pdf_externally": True
        })
        
        driver = webdriver.Chrome(options=options)
        driver.set_page_load_timeout(60)
        
        self.logger.info("✓ Chrome configurado")
        return driver
    
    def _setup_firefox(self) -> webdriver.Firefox:
        options = FirefoxOptions()
        
        if self.headless:
            options.add_argument("--headless")
            self.logger.info("Firefox configurado en modo HEADLESS")
        
        options.set_preference("browser.download.folderList", 2)
        options.set_preference("browser.download.dir", str(self.download_dir.absolute()))
        options.set_preference("browser.helperApps.neverAsk.saveToDisk", "application/pdf")
        options.set_preference("pdfjs.disabled", True)
        
        driver = webdriver.Firefox(options=options)
        driver.set_page_load_timeout(60)
        
        self.logger.info("✓ Firefox configurado")
        return driver
    
    def _setup_edge(self) -> webdriver.Edge:
        options = EdgeOptions()
        
        if self.headless:
            options.add_argument("--headless=new")
            self.logger.info("Edge configurado en modo HEADLESS")
        
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--log-level=3")
        
        driver = webdriver.Edge(options=options)
        driver.set_page_load_timeout(60)
        
        self.logger.info("✓ Edge configurado")
        return driver
        
    def _detect_available_browser(self):
        self.logger.info("Auto-detectando navegadores disponibles...")

        browsers_to_try = ['chrome', 'firefox', 'edge']

        for browser in browsers_to_try:
            try:
                self.logger.info(f"Probando {browser.upper()}...")

                if browser == 'chrome':
                    options = ChromeOptions()
                    options.add_argument("--headless=new")
                    options.add_argument("--no-sandbox")
                    options.add_argument("--disable-dev-shm-usage")
                    options.add_argument("--disable-gpu")
                    driver = webdriver.Chrome(options=options)

                elif browser == 'firefox':
                    options = FirefoxOptions()
                    options.add_argument("--headless")
                    driver = webdriver.Firefox(options=options)

                elif browser == 'edge':
                    options = EdgeOptions()
                    options.add_argument("--headless=new")
                    options.add_argument("--no-sandbox")
                    options.add_argument("--disable-dev-shm-usage")
                    options.add_argument("--disable-gpu")
                    driver = webdriver.Edge(options=options)

                driver.quit()
                self.logger.info(f"✓ {browser.upper()} disponible")
                return browser

            except Exception as e:
                self.logger.warning(f"✗ {browser.upper()} no disponible: {e}")
                continue

        raise RuntimeError(
            "❌ No se encontró ningún navegador instalado. "
            "Instala Chrome, Firefox o Edge."
        )

    def _setup_driver(self):
        """Configura el driver del navegador"""
        self.logger.info(f"Configurando navegador: {self.browser.upper()}")
        
        try:
            if self.browser == 'auto':
                self.browser = self._detect_available_browser()
            
            if self.browser == 'chrome':
                return self._setup_chrome()
            elif self.browser == 'firefox':
                return self._setup_firefox()
            elif self.browser == 'edge':
                return self._setup_edge()
                
        except Exception as e:
            self.logger.error(f"Error configurando {self.browser}: {e}")
            
            if self.browser != 'auto':
                self.logger.info("Intentando auto-detección de navegadores...")
                try:
                    self.browser = self._detect_available_browser()
                    return self._setup_driver()
                except Exception as fallback_error:
                    raise RuntimeError(
                        f"No se pudo inicializar ningún navegador. "
                        f"Error original: {e}. "
                        f"Fallback: {fallback_error}"
                    )
    
    def _fill_date_field(self, field_id: str, date: str):
        self.logger.info(f"Llenando campo {field_id} con fecha: {date}")
        
        date_input = WebDriverWait(self.driver, 20).until(
            EC.presence_of_element_located((By.ID, field_id))
        )
        
        self.driver.execute_script(
            "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", 
            date_input
        )
        time.sleep(0.5)
        
        self.driver.execute_script("arguments[0].value = '';", date_input)
        time.sleep(0.3)
        self.driver.execute_script(f"arguments[0].value = '{date}';", date_input)
        
        self.logger.info(f"✓ Campo {field_id} llenado")
    
    
    def _download_single_cuadernillo(self, date: str) -> str:
        try:
            self.logger.info(f"Buscando cuadernillo para la fecha {date}...")
            
            # Selector robusto: Buscar un enlace <a> cuyo href contenga 'cuadernillo/NL/' y la fecha requerida
            xpath_selector = f"//a[contains(@href, 'cuadernillo/NL/{date}')]"
            
            self.logger.info(f"Esperando elemento con XPath: {xpath_selector}")
            
            # Esperar a que la lista de resultados y el enlace carguen tras el click en Buscar
            cuadernillo_btn = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.XPATH, xpath_selector))
            )
            
            viewer_url = cuadernillo_btn.get_attribute("href")
            
            if not viewer_url or not viewer_url.startswith("https://") or "elperuano.pe" not in viewer_url:
                self.logger.error(f"URL de cuadernillo invalida o vacia: {viewer_url}")
                return None
            
            self.logger.info(f"✓ Visor de Cuadernillo encontrado: {viewer_url}")
            
            # Fetch the viewer page to get the real PDF URL
            self.logger.info("Obteniendo URL real del PDF desde el visor...")
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            viewer_response = requests.get(viewer_url, headers=headers)
            
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(viewer_response.text, 'html.parser')
            iframe = soup.find('iframe', id='visor_id')
            
            if not iframe or not iframe.get('src'):
                self.logger.error("No se encontro el iframe #visor_id en la pagina del cuadernillo.")
                return None
                
            pdf_url = iframe.get('src')
            self.logger.info(f"✓ URL real del PDF encontrada: {pdf_url}")
            
            self.logger.info("Descargando PDF...")
            output_path = Path(self.download_dir) / f"{date}_cuadernillo.pdf"
            
            response = requests.get(pdf_url, headers=headers)
            
            if response.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(response.content)
                
                # Validacion estricta del PDF descargado
                if not output_path.exists():
                    self.logger.error("Error: El archivo PDF no se guardó en el disco.")
                    return None
                    
                file_size = output_path.stat().st_size
                if file_size == 0:
                    self.logger.error("Error: El PDF descargado tiene 0 bytes (corrupto).")
                    output_path.unlink()
                    return None
                    
                # Validar la firma magica %PDF
                with open(output_path, "rb") as f:
                    header = f.read(4)
                    if header != b"%PDF":
                        self.logger.error(f"Error: El archivo no es un PDF valido. Cabecera encontrada: {header}")
                        output_path.unlink()
                        return None
                    
                self.logger.info(f"✓ Descarga completa y valida: {output_path.name} ({(file_size / (1024 * 1024)):.2f} MB)")
                return str(output_path)
            else:
                self.logger.error(f"Error HTTP al descargar: {response.status_code}")
                return None
                
        except Exception as e:
            self.logger.error(f"Error al descargar cuadernillo: {e}")
            return None
    
    def _cleanup_file(self, file_path: str) -> bool:
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
                self.logger.info(f" Archivo borrado: {path.name}")
                return True
            else:
                self.logger.warning(f"Archivo no encontrado para borrar: {file_path}")
                return False
        except PermissionError:
            self.logger.error(f"Sin permisos para borrar: {file_path}")
            return False
        except Exception as e:
            self.logger.error(f"Error al borrar archivo: {e}")
            return False
    
    def get_rendered_normas_html(self, date_str: str) -> str:
        """
        Devuelve el HTML renderizado de la página de Normas
        (con JavaScript ejecutado).
        """
        try:
            self.logger.info("Obteniendo HTML renderizado de Normas...")

            if not self.driver:
                self.logger.info("Inicializando navegador para HTML renderizado...")
                self.driver = self._setup_driver()
                self.driver.get("https://diariooficial.elperuano.pe/Normas")
                time.sleep(5)
                
                # Tambien necesitamos buscar la fecha aqui porque los articulos cambian por fecha
                year = date_str[0:4]
                month = date_str[4:6]
                day = date_str[6:8]
                date = f"{day}/{month}/{year}"
                
                self._fill_date_field("cddesde", date)
                self._fill_date_field("cdhasta", date)
                
                btn_buscar = WebDriverWait(self.driver, 20).until(
                    EC.element_to_be_clickable((By.ID, "btnBuscar"))
                )
                self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", btn_buscar)
                time.sleep(0.5)
                btn_buscar.click()
                time.sleep(5)

            return self.driver.page_source

        except Exception as e:
            self.logger.error(f"Error obteniendo HTML renderizado: {e}")
            raise


    def download_bulletin(self, date: str, delete_after_upload: bool = False, 
                         upload_callback=None) -> str:

        try:
            # date llega como YYYYMMDD
            date_str = date
            year = date_str[0:4]
            month = date_str[4:6]
            day = date_str[6:8]
            date_formatted = f"{day}/{month}/{year}"
            
            self.logger.info("Iniciando navegador...")
            self.driver = self._setup_driver()
            
            url = "https://diariooficial.elperuano.pe/Normas"
            self.logger.info(f"Navegando a {url}")
            self.driver.get(url)
            time.sleep(5)
            
            # Llenar fechas
            self._fill_date_field("cddesde", date_formatted)
            self._fill_date_field("cdhasta", date_formatted)
            
            # Hacer click en buscar
            self.logger.info("Presionando el boton de Buscar...")
            btn_buscar = WebDriverWait(self.driver, 20).until(
                EC.element_to_be_clickable((By.ID, "btnBuscar"))
            )
            self.driver.execute_script("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", btn_buscar)
            time.sleep(0.5)
            btn_buscar.click()
            
            # Esperar a que la tabla se actualice
            self.logger.info("Esperando que carguen los resultados...")
            time.sleep(5) 
            
            # Descargar PDF con el selector robusto usando la fecha en YYYYMMDD
            file_path = self._download_single_cuadernillo(date_str)

            if file_path:
                self.logger.info("=" * 60)
                self.logger.info(f"✓ DESCARGA EXITOSA: {file_path}")
                self.logger.info("=" * 60)
                
                # Si se debe borrar después de subir
                if delete_after_upload and upload_callback:
                    self.logger.info("Procediendo a subir archivo...")
                    try:
                        upload_result = upload_callback(file_path)
                        
                        if upload_result is not None:
                            self.logger.info("✓ Subida exitosa, borrando archivo local...")
                            self._cleanup_file(file_path)
                        else:
                            self.logger.warning("⚠️  Subida falló, archivo conservado")
                    except Exception as e:
                        self.logger.error(f"Error durante la subida: {e}")
                        self.logger.info("Archivo conservado debido al error")

            return file_path
            
        except Exception as e:
            self.logger.error(f"Error durante el scraping: {e}")
            if self.driver:
                try:
                    self.driver.save_screenshot(str(self.download_dir / "error_screenshot.png"))
                    self.logger.info(f"Screenshot guardado: {self.download_dir}/error_screenshot.png")
                except:
                    pass
            return None
            
        finally:
            if self.driver:
                self.logger.info("Cerrando navegador...")
                time.sleep(2)
                self.driver.quit()
