import logging

def setup_logger(level=logging.DEBUG):
    logger = logging.getLogger("NHP_Synth")
    if isinstance(level, str):
        level = getattr(logging, level.upper(), logging.DEBUG)
    logger.setLevel(level)
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(message)s')
    handler.setFormatter(formatter)
    if not logger.hasHandlers():
        logger.addHandler(handler)
    return logger
