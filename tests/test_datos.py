import json
import unittest
from unittest import mock

import pandas as pd

from modelado import config as cfg
from modelado import datos


def _episodios(n=3):
    return pd.DataFrame({
        "episode_key": [f"e{i}" for i in range(n)],
        "session_key": [f"s{i}" for i in range(n)],
        "anchor_at": ["2026-10-05 10:00:00"] * n,
        "anchor_mart": ["2026-10-05 10:00:00"] * n,
        "available_through": ["2026-10-05 10:00:00"] * n,
        "feature_version": [cfg.VERSION_FEATURES] * n,
        "horizon_end": ["2026-10-06 10:00:00"] * n,
        "label_status": ["mature"] * n,
        "human_replied_24h": [1, 0, 1][:n],
        "customer_returned_24h": [0, 0, 1][:n],
        "contact_key": [f"c{i}" for i in range(n)],
    })


def _matriz(n=3):
    columnas = datos.grupos_de_variables()["completo"]
    return pd.DataFrame(1.0, index=range(n), columns=columnas)


class Variables(unittest.TestCase):
    def test_los_grupos_tienen_10_y_58_variables_sin_repetir(self):
        grupos = datos.grupos_de_variables()
        self.assertEqual(len(grupos["operativas"]), 10)
        self.assertEqual(len(grupos["completo"]), 58)
        self.assertEqual(len(set(grupos["completo"])), 58)

    def test_los_bloques_cubren_las_58(self):
        bloques = datos.bloques_de_variables()
        todas = [c for cols in bloques.values() for c in cols]
        self.assertEqual(sorted(todas), sorted(datos.grupos_de_variables()["completo"]))


class Validacion(unittest.TestCase):
    def test_datos_correctos_pasan(self):
        datos.validar(_episodios(), _matriz())

    def test_rechaza_features_posteriores_al_ancla(self):
        df = _episodios()
        df.loc[1, "available_through"] = "2026-10-05 10:00:01"
        with self.assertRaisesRegex(ValueError, "después del ancla"):
            datos.validar(df, _matriz())

    def test_rechaza_esquema_distinto(self):
        with self.assertRaisesRegex(ValueError, "esquema"):
            datos.validar(_episodios(), _matriz().drop(columns=["hour"]))

    def test_rechaza_valores_no_finitos(self):
        matriz = _matriz()
        matriz.loc[0, "hour"] = float("inf")
        with self.assertRaisesRegex(ValueError, "no finitos"):
            datos.validar(_episodios(), matriz)

    def test_cohorte_madura_descarta_pendientes(self):
        df = _episodios()
        df.loc[2, "label_status"] = "pending"
        df.loc[2, "human_replied_24h"] = None
        with mock.patch.object(cfg, "COHORTE", 2):
            maduros, matriz = datos.cohorte_madura(df, _matriz())
        self.assertEqual(len(maduros), 2)
        self.assertEqual(len(matriz), 2)

    def test_cohorte_con_tamano_inesperado_falla(self):
        with self.assertRaises(ValueError):
            datos.cohorte_madura(_episodios(), _matriz())


class IndicadoresAtencion(unittest.TestCase):
    def test_cuenta_solo_mensajes_humanos_dentro_del_horizonte(self):
        episodios = pd.DataFrame({
            "episode_key": ["e1"], "session_key": ["s1"],
            "anchor_at": pd.to_datetime(["2026-10-05 10:00:00"]),
            "horizon_end": pd.to_datetime(["2026-10-06 10:00:00"]),
        })
        # La hora local es UTC-3: las 13:05 UTC son las 10:05 locales.
        mensajes = pd.DataFrame([
            ("s1", "2026-10-05T12:59:00+00:00", "outbound", "text", 1),   # antes del ancla
            ("s1", "2026-10-05T13:05:00+00:00", "outbound", "text", 1),   # cuenta
            ("s1", "2026-10-05T13:06:00+00:00", "outbound", "image", 1),  # cuenta, con adjunto
            ("s1", "2026-10-05T13:07:00+00:00", "outbound", "text", 0),   # lo mandó el bot
            ("s1", "2026-10-05T13:08:00+00:00", "inbound", "text", 0),    # lo mandó el cliente
            ("s1", "2026-10-06T13:01:00+00:00", "outbound", "text", 1),   # después del horizonte
        ], columns=["session_key", "event_at_utc", "direction", "message_type", "human_author"])
        resultado = datos.indicadores_atencion(episodios, mensajes)
        self.assertEqual(resultado.loc["e1", "mensajes_humanos"], 2)
        self.assertEqual(resultado.loc["e1", "adjuntos_humanos"], 1)
        self.assertEqual(resultado.loc["e1", "con_adjuntos"], 1)

    def test_episodio_sin_mensajes_humanos_queda_en_cero(self):
        episodios = pd.DataFrame({
            "episode_key": ["e1"], "session_key": ["s1"],
            "anchor_at": pd.to_datetime(["2026-10-05 10:00:00"]),
            "horizon_end": pd.to_datetime(["2026-10-06 10:00:00"]),
        })
        mensajes = pd.DataFrame(
            [("s1", "2026-10-05T13:08:00+00:00", "inbound", "text", 0)],
            columns=["session_key", "event_at_utc", "direction", "message_type", "human_author"],
        )
        resultado = datos.indicadores_atencion(episodios, mensajes)
        self.assertEqual(resultado.loc["e1", "mensajes_humanos"], 0)
        self.assertEqual(resultado.loc["e1", "con_adjuntos"], 0)


class Integridad(unittest.TestCase):
    def test_hash_distinto_al_del_manifiesto_se_rechaza(self):
        manifiesto = json.dumps({"sqlite_sha256": "0" * 64})
        with mock.patch("pathlib.Path.read_text", return_value=manifiesto):
            with self.assertRaisesRegex(ValueError, "hash"):
                datos.verificar_hashes()


if __name__ == "__main__":
    unittest.main()
