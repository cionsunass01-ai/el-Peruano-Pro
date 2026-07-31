import unittest
from unittest.mock import patch
import sys
import os

# Ensure src can be imported
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.drive_uploader import verify_manifest_processed

class TestManifestVerification(unittest.TestCase):

    def setUp(self):
        self.manifest_id = "manifest-123"
        self.run_id = "run-456"
        self.date = "20260730"

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_a_correct_manifest(self, mock_get_manifest):
        """Escenario A: Manifest correcto -> BACKEND_CONFIRMED"""
        mock_get_manifest.return_value = {
            "_drive_file_id": "manifest-123",
            "run_id": "run-456",
            "date": "20260730",
            "status": "processed",
            "email_sent": True
        }
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertTrue(result, "Escenario A debe devolver True (BACKEND_CONFIRMED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_b_manifest_not_found(self, mock_get_manifest):
        """Escenario B: Manifest no encontrado -> BACKEND_CONFIRMATION_FAILED"""
        mock_get_manifest.side_effect = RuntimeError("Manifest no encontrado en Drive")
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertFalse(result, "Escenario B debe devolver False (BACKEND_CONFIRMATION_FAILED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_c_manifest_id_mismatch(self, mock_get_manifest):
        """Escenario C: manifest_id diferente -> BACKEND_CONFIRMATION_FAILED"""
        mock_get_manifest.return_value = {
            "_drive_file_id": "manifest-DIFFERENT",
            "run_id": "run-456",
            "date": "20260730",
            "status": "processed",
            "email_sent": True
        }
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertFalse(result, "Escenario C debe devolver False (BACKEND_CONFIRMATION_FAILED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_d_run_id_mismatch(self, mock_get_manifest):
        """Escenario D: run_id diferente -> BACKEND_CONFIRMATION_FAILED"""
        mock_get_manifest.return_value = {
            "_drive_file_id": "manifest-123",
            "run_id": "run-DIFFERENT",
            "date": "20260730",
            "status": "processed",
            "email_sent": True
        }
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertFalse(result, "Escenario D debe devolver False (BACKEND_CONFIRMATION_FAILED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_e_date_mismatch(self, mock_get_manifest):
        """Escenario E: date diferente -> BACKEND_CONFIRMATION_FAILED"""
        mock_get_manifest.return_value = {
            "_drive_file_id": "manifest-123",
            "run_id": "run-456",
            "date": "19990101",
            "status": "processed",
            "email_sent": True
        }
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertFalse(result, "Escenario E debe devolver False (BACKEND_CONFIRMATION_FAILED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_f_status_not_processed(self, mock_get_manifest):
        """Escenario F: status complete o processing -> BACKEND_CONFIRMATION_FAILED"""
        for invalid_status in ["complete", "processing", "failed"]:
            mock_get_manifest.return_value = {
                "_drive_file_id": "manifest-123",
                "run_id": "run-456",
                "date": "20260730",
                "status": invalid_status,
                "email_sent": True
            }
            result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
            self.assertFalse(result, f"Escenario F con status '{invalid_status}' debe devolver False (BACKEND_CONFIRMATION_FAILED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_g_email_sent_false(self, mock_get_manifest):
        """Escenario G: email_sent false -> BACKEND_CONFIRMATION_FAILED"""
        mock_get_manifest.return_value = {
            "_drive_file_id": "manifest-123",
            "run_id": "run-456",
            "date": "20260730",
            "status": "processed",
            "email_sent": False
        }
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertFalse(result, "Escenario G debe devolver False (BACKEND_CONFIRMATION_FAILED)")

    @patch("src.drive_uploader.get_manifest_by_file_id")
    def test_scenario_h_corrupt_json(self, mock_get_manifest):
        """Escenario H: JSON corrupto -> BACKEND_CONFIRMATION_FAILED"""
        mock_get_manifest.side_effect = ValueError("JSONDecodeError: Expecting value: line 1 column 1")
        result = verify_manifest_processed(self.manifest_id, self.run_id, self.date)
        self.assertFalse(result, "Escenario H debe devolver False (BACKEND_CONFIRMATION_FAILED)")

if __name__ == "__main__":
    unittest.main()
