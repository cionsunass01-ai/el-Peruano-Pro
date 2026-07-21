import json
from pathlib import Path
from bs4 import BeautifulSoup
from datetime import datetime
from zoneinfo import ZoneInfo

from .logger import setup_logger
from .scraper import ElPeruanoScraper
from .config import Config


def get_peru_date_str():
    peru_tz = ZoneInfo("America/Lima")
    return datetime.now(peru_tz).strftime("%Y%m%d")


def scrape_normas_index(fecha=None):
    logger = setup_logger("elperuano_index")
    if not fecha:
        fecha = get_peru_date_str()

    logger.info(f"Scrapeando índice HTML renderizado para fecha: {fecha}")

    config = Config()
    scraper = ElPeruanoScraper(config, browser="auto")

    try:
        html = scraper.get_rendered_normas_html(fecha)

        soup = BeautifulSoup(html, "lxml")
        normas = []

        articles = soup.select("article.edicionesoficiales_articulos")

        logger.info(f"Artículos encontrados: {len(articles)}")

        for art in articles:
            texto = art.select_one("div.ediciones_texto")
            if not texto:
                continue

            sector_tag = texto.select_one("h4")
            link_tag = texto.select_one("h5 a")

            if not link_tag:
                continue

            normas.append({
                "sector": sector_tag.get_text(strip=True) if sector_tag else None,
                "titulo": link_tag.get_text(strip=True),
                "url": link_tag.get("href")
            })

        output = {
            "fecha": fecha,
            "total_normas": len(normas),
            "normas": normas
        }

        output_path = Path("downloads") / f"indice_normas_{fecha}.json"
        output_path.parent.mkdir(exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        logger.info(f"✓ Índice generado: {output_path.name} ({len(normas)} normas)")
        return output_path

    finally:
        if scraper.driver:
            logger.info("Cerrando navegador de índice...")
            scraper.driver.quit()
