import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DATOS = Path(os.environ.get("CDD_DATOS", RAIZ.parent / "CDD" / "datasets"))
MART = DATOS / "hitelac_20261101_v2" / "research_mart_v2.sqlite"
FEATURES = DATOS / "predictive_v3_1" / "episode_features_v3.sqlite"
SALIDA = RAIZ / "resultados"

SEMILLA = 42
VERSION_FEATURES = "predictive_family_anchor_v3_1"
COHORTE = 3981

# Argentina no tiene horario de verano desde 2009; el mart guarda UTC y hora local.
DESFASE_LOCAL_HORAS = -3

CORTE_VALIDACION = "2026-09-01"
CORTE_TEST = "2026-10-01"
FIN_TEST = "2026-11-01"
PARTICIONES_ESPERADAS = {"train": 1635, "validation": 1165, "test": 1042, "purgado": 139}

OPERATIVAS = [
    "prefix_messages",
    "prefix_inbound",
    "prefix_bot_messages",
    "prefix_duration_seconds",
    "hour",
    "weekday",
    "business_hours",
    "inbound_text_messages",
    "inbound_nontext_messages",
    "inbound_text_chars",
]

# El largo del texto identifica el mensaje precargado del anuncio, que cambia cuando
# se rota la creatividad; la ablación los excluye para medir qué queda sin ese atajo.
LARGO_DE_TEXTO = ["inbound_text_chars", "anchor_useful_text_chars"]

FAMILIAS = [
    "abrojos", "ambos", "botones", "broches", "chalecos", "cierres",
    "cintas", "elasticos", "entretelas", "etiquetas", "hilos", "telas",
]

TIPOS_ADJUNTO = ("image", "document", "video")
UMBRAL = 0.5
REPETICIONES_BOOTSTRAP = 1000
