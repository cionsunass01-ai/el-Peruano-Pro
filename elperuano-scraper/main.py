import os
import uuid
import sys
from datetime import datetime, timezone
from pathlib import Path
from src import ElPeruanoScraper, Config, setup_logger
from src.drive_uploader import find_or_create_subfolder, upload_file_to_drive, upload_manifest, get_manifest
from split_pdf import split_pdf
from src.index_scraper import scrape_normas_index, get_peru_date_str
import re
import traceback
import json

def write_result(result, date_str, run_id=None, manifest_id=None, message=""):
    execution_id = os.environ.get("ORCHESTRATION_ID")
    result_data = {
        "execution_id": execution_id,
        "result": result,
        "date": date_str,
        "run_id": run_id,
        "manifest_id": manifest_id,
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    out_dir = Path("/app/downloads") if Path("/app/downloads").exists() else Path(".")
    tmp_path = out_dir / "run-result.tmp.json"
    final_path = out_dir / "run-result.json"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(result_data, f, indent=2)
    tmp_path.replace(final_path)


def get_target_date(logger):
    target_date = os.environ.get("TARGET_DATE", "").strip()
    if target_date:
        try:
            datetime.strptime(target_date, "%Y%m%d")
        except ValueError:
            raise ValueError(
                f"TARGET_DATE invalido: '{target_date}'. Use una fecha real con formato YYYYMMDD, por ejemplo 20260828."
            )
        logger.info(f"Usando fecha TARGET_DATE: {target_date} (Prueba Historica / Reproceso)")
        return target_date

    date_str = get_peru_date_str()
    logger.info(f"Usando fecha automatica (America/Lima): {date_str} (Ejecucion diaria)")
    return date_str

def main():
    logger = setup_logger(log_level=10)
    logger.info("Starting El Peruano Scraper")

    date_str = ""
    run_id = None
    manifest_id_global = None

    try:
        date_str = get_target_date(logger)
        force_reprocess_env = os.environ.get("FORCE_REPROCESS", "false").strip().lower()
        force_reprocess = force_reprocess_env == "true"

        if force_reprocess:
            logger.info("REPROCESO MANUAL ACTIVADO mediante FORCE_REPROCESS=true")

        # 0. Verificamos la subcarpeta en Drive antes de iniciar
        folder_name = date_str
        logger.info(f"Buscando subcarpeta en Drive: {folder_name}")
        folder_id, was_created = find_or_create_subfolder(folder_name)

        manifest = None
        if not was_created:
            logger.info(f"La subcarpeta ya existe. Verificando estado...")
            manifest = get_manifest(folder_id)
            if manifest:
                status = manifest.get("status")
                if status == "processed":
                    if force_reprocess:
                        logger.warning(f"El manifest estaba '{status}', pero FORCE_REPROCESS=true. Se procedera al reproceso reutilizando la carpeta.")
                    else:
                        logger.info(f"El cuadernillo {date_str} ya fue procesado completamente (Estado: {status}). Finalizando correctamente.")
                        write_result("ALREADY_PROCESSED", date_str, message=f"Estado previo: {status}")
                        return
                elif status == "complete":
                    if force_reprocess:
                        logger.warning(f"El manifest estaba '{status}', pero FORCE_REPROCESS=true. Se procedera al reproceso reutilizando la carpeta.")
                    else:
                        logger.info(f"El cuadernillo {date_str} ya fue descargado y esta listo para el backend (Estado: {status}).")
                        write_result("READY_FOR_BACKEND", date_str, run_id=manifest.get("run_id"), manifest_id=manifest.get("_drive_file_id"), message="Manifest existente en estado complete")
                        return
                else:
                    logger.info(f"La carpeta existe pero el estado es '{status}'. Reutilizando la carpeta y reiniciando proceso.")
            else:
                logger.info("La carpeta existe pero no tiene manifest completo. Reutilizando la carpeta.")
        else:
            logger.info("Carpeta nueva creada en Drive.")

        # 1. Scraping del PDF principal
        config = Config()
        scraper = ElPeruanoScraper(
            config,
            browser="auto"
        )

        pdf_path = scraper.download_bulletin(
            date=date_str,
            delete_after_upload=False,
            upload_callback=None
        )

        if not pdf_path:
            logger.error(f"El cuadernillo {date_str} aun no esta disponible o fallo la descarga.")
            # Si el scraper devolvio None de forma natural (el visor no existia y no hubo excepcion no controlada)
            write_result("NOT_AVAILABLE", date_str, message="No se encontrÃ³ el enlace o visor del cuadernillo en el portal para esta fecha.")
            sys.exit(1)

        # 2. ValidaciÃ³n estricta del PDF real
        pdf_size = os.path.getsize(pdf_path)
        logger.info(f"Validating real PDF: {pdf_path}")
        logger.info(f"File size: {pdf_size} bytes")

        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(str(pdf_path))
            num_pages = len(reader.pages)
            logger.info(f"Number of pages: {num_pages}")
            if num_pages == 0:
                raise Exception("PDF has 0 pages")

            first_page_text = reader.pages[0].extract_text()
            if not first_page_text or len(first_page_text.strip()) == 0:
                raise Exception("PDF does not contain extractable text on page 1")

            logger.info(f"Sample text from page 1: {first_page_text[:100].replace(chr(10), ' ')}...")
        except Exception as ve:
            logger.error(f"Fallo de validacion PDF: {ve}")
            write_result("VALIDATION_FAILED", date_str, message=str(ve))
            sys.exit(1)

        # Copiar PDF original a ruta real
        real_dir = Path("/app/downloads/real")
        real_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        dest_path = real_dir / os.path.basename(pdf_path)
        shutil.copy2(pdf_path, dest_path)
        logger.info(f"Copia del PDF real guardada en: {dest_path}")

        # 3. Scraping del Ãndice
        index_file = scrape_normas_index(date_str)

        # 4. DivisiÃ³n en bloques
        logger.info("Splitting PDF into chunks...")
        chunks = split_pdf(Path(pdf_path))
        logger.info(f"{len(chunks)} chunks created")

        # 5. Estructura del Manifest
        run_id = str(uuid.uuid4())

        # Si habia un manifest, mantenemos _drive_file_id
        drive_file_id = None
        if manifest and '_drive_file_id' in manifest:
            drive_file_id = manifest['_drive_file_id']

        manifest = {
            "schema_version": "1.0",
            "run_id": run_id,
            "date": date_str,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expected_blocks": len(chunks),
            "total_pages": 0,
            "status": "processing",
            "index_file": None,
            "uploaded_files": []
        }
        if drive_file_id:
            manifest['_drive_file_id'] = drive_file_id

        # Sube el manifest incompleto para asegurar que quede trazabilidad en 'processing'
        upload_manifest(manifest, folder_id)

        # 6. Subir Ãndice (se sobrescribe si existe por el mismo nombre)
        logger.info(f"Uploading index file {index_file.name} to Drive...")
        index_res = upload_file_to_drive(index_file, folder_id, "application/json")
        manifest["index_file"] = {
            "id": index_res["id"],
            "name": index_res["name"],
            "size": int(index_res["size"])
        }

        # 7. Subir Bloques
        max_page = 0
        pattern = re.compile(r'_p(\d+)-(\d+)\.pdf$')

        for chunk in chunks:
            logger.info(f"Uploading {chunk.name} to Drive...")
            res = upload_file_to_drive(chunk, folder_id, "application/pdf")

            start_page, end_page = 0, 0
            match = pattern.search(chunk.name)
            if match:
                start_page = int(match.group(1))
                end_page = int(match.group(2))
                max_page = max(max_page, end_page)

            manifest["uploaded_files"].append({
                "id": res["id"],
                "name": res["name"],
                "size": int(res["size"]),
                "start_page": start_page,
                "end_page": end_page
            })

        manifest["total_pages"] = max_page

        # 8. Marcar como completado y subir Manifest Final
        manifest["status"] = "complete"
        manifest_id = upload_manifest(manifest, folder_id)

        logger.info(f"âœ“ All chunks uploaded. Manifest ID: {manifest_id}")
        manifest_id_global = manifest_id
        write_result("READY_FOR_BACKEND", date_str, run_id=run_id, manifest_id=manifest_id, message="Subida completada con exito")

    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        write_result("SCRAPER_ERROR", date_str, run_id=run_id, manifest_id=manifest_id_global, message=f"ExcepciÃ³n no controlada: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
