import os
from pathlib import Path
from typing import Optional


class Config:
    
    BASE_URL = "https://diariooficial.elperuano.pe/Normas"
    
    INPUT_FROM_SELECTOR = "input[name='FechaDesde']"
    INPUT_TO_SELECTOR = "input[name='FechaHasta']"
    SEARCH_BUTTON_SELECTOR = "button[type='submit'], input[type='submit']"
    DOWNLOAD_FULL_BULLETIN_TEXT = "todo el cuadernillo"
    
    PAGE_LOAD_TIMEOUT = 30
    ELEMENT_TIMEOUT = 10
    DOWNLOAD_TIMEOUT = 300 
    
    HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"
    
    DOWNLOAD_DIR = Path(os.getenv("DOWNLOAD_DIR", "./downloads"))
    
    MAX_RETRIES = 3
    RETRY_DELAY = 5 
    
    def __init__(self):
        self.DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    def get_download_path(self, filename: Optional[str] = None) -> Path:
        if filename:
            return self.DOWNLOAD_DIR / filename
        return self.DOWNLOAD_DIR
    
    def validate(self) -> bool:
        if not self.DOWNLOAD_DIR.exists():
            raise ValueError(f"Download directory does not exist: {self.DOWNLOAD_DIR}")
        
        if not self.DOWNLOAD_DIR.is_dir():
            raise ValueError(f"Download path is not a directory: {self.DOWNLOAD_DIR}")
        
        return True