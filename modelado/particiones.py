import hashlib

import numpy as np
import pandas as pd

from . import config as cfg


def asignar(anclas, fines):
    """Partición temporal con purga de los episodios cuyo horizonte cruza una frontera."""
    c_val = pd.Timestamp(cfg.CORTE_VALIDACION)
    c_test = pd.Timestamp(cfg.CORTE_TEST)
    c_fin = pd.Timestamp(cfg.FIN_TEST)
    anclas = pd.Series(pd.to_datetime(anclas)).reset_index(drop=True)
    fines = pd.Series(pd.to_datetime(fines)).reset_index(drop=True)
    train = (anclas < c_val) & (fines < c_val)
    validation = (anclas >= c_val) & (anclas < c_test) & (fines < c_test)
    test = (anclas >= c_test) & (anclas < c_fin)
    return pd.Series(
        np.select([train, validation, test], ["train", "validation", "test"], default="purgado"),
        name="particion",
    )


def conteos(particion):
    return {k: int(v) for k, v in particion.value_counts().items()}


def huella(claves, particion):
    lineas = sorted(f"{k}:{p}" for k, p in zip(claves, particion))
    return hashlib.sha256("\n".join(lineas).encode()).hexdigest()


def verificar_conteos(particion):
    real = conteos(particion)
    if real != cfg.PARTICIONES_ESPERADAS:
        raise ValueError(f"Conteos {real} distintos de los fijados {cfg.PARTICIONES_ESPERADAS}")
