
class ScraperError(Exception):
    """Base exception for scraper errors"""
    pass


class ElementNotFoundError(ScraperError):
    """Raised when a required element is not found on the page"""
    pass


class DownloadError(ScraperError):
    """Raised when download fails or times out"""
    pass


class ConfigurationError(ScraperError):
    """Raised when configuration is invalid"""
    pass