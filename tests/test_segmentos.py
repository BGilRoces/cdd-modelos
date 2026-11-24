import unittest

import numpy as np
import pandas as pd

from modelado import segmentos


def _matriz(filas):
    columnas = ["requested_ambos", "offered_ambos", "requested_chalecos", "offered_chalecos",
                "requested_broches", "prefix_duration_seconds"]
    return pd.DataFrame(filas, columns=columnas)


class Impulsados(unittest.TestCase):
    def test_marca_ambos_y_chalecos_pedidos_u_ofrecidos(self):
        m = _matriz([
            [1, 0, 0, 0, 0, 10],   # pidió ambos
            [0, 1, 0, 0, 0, 10],   # el bot ofreció ambos
            [0, 0, 1, 0, 0, 10],   # pidió chalecos
            [0, 0, 0, 1, 0, 10],   # el bot ofreció chalecos
            [0, 0, 0, 0, 1, 10],   # solo broches
            [0, 0, 0, 0, 0, 10],   # nada
        ])
        self.assertEqual(segmentos.es_impulsado(m).tolist(), [True, True, True, True, False, False])


class PorSegmento(unittest.TestCase):
    def test_separa_los_dos_grupos_y_calcula_prevalencia(self):
        azar = np.random.default_rng(0)
        impulsado = np.array([True] * 100 + [False] * 200)
        y = np.concatenate([(azar.random(100) < 0.94).astype(int), (azar.random(200) < 0.15).astype(int)])
        score = np.where(impulsado, 0.9, 0.2) + azar.normal(0, 0.05, 300)
        filas = {f["segmento"]: f for f in segmentos.metricas_por_segmento(y, score, impulsado)}
        self.assertEqual(filas["todos"]["chats"], 300)
        self.assertEqual(filas["impulsados"]["chats"], 100)
        self.assertEqual(filas["resto"]["chats"], 200)
        self.assertAlmostEqual(filas["resto"]["prevalencia"], y[~impulsado].mean())
        self.assertGreater(filas["todos"]["roc_auc"], 0.8)
        self.assertLess(filas["impulsados"]["roc_auc"], 0.7)

    def test_un_segmento_con_una_sola_clase_no_define_auc(self):
        y = np.array([1, 1, 1, 0, 1, 0])
        filas = {f["segmento"]: f for f in
                 segmentos.metricas_por_segmento(y, np.linspace(0, 1, 6), np.array([True, True, True, False, False, False]))}
        self.assertTrue(np.isnan(filas["impulsados"]["roc_auc"]))


class EvolucionMensual(unittest.TestCase):
    def test_agrupa_por_mes_y_calcula_porcentajes(self):
        df = pd.DataFrame({
            "anchor_at": pd.to_datetime(["2026-07-01", "2026-07-15", "2026-08-02", "2026-08-03"]),
            "origin_key": ["unknown", "ad_inferred_business_rule", "ad_observed", "ad_observed"],
            "human_replied_24h": [1, 0, 1, 1],
        })
        m = _matriz([[0, 0, 0, 0, 1, 5], [0, 0, 0, 0, 0, 20], [1, 0, 0, 0, 0, 5], [1, 0, 0, 0, 0, 9]])
        t = segmentos.evolucion_mensual(df, m).set_index("mes")
        self.assertEqual(t.loc["2026-07", "chats"], 2)
        self.assertAlmostEqual(t.loc["2026-07", "con_anuncio"], 0.5)
        self.assertAlmostEqual(t.loc["2026-08", "con_anuncio"], 1.0)
        self.assertAlmostEqual(t.loc["2026-08", "pide_ambos"], 1.0)
        self.assertAlmostEqual(t.loc["2026-07", "pide_broches"], 0.5)
        self.assertAlmostEqual(t.loc["2026-07", "duracion_hasta_7_5s"], 0.5)


class Composicion(unittest.TestCase):
    def test_la_tabla_tiene_una_columna_por_particion_y_el_mes_como_indice(self):
        df = pd.DataFrame({"anchor_at": pd.to_datetime(["2026-08-01", "2026-08-02", "2026-09-05"])})
        particion = pd.Series(["train", "train", "validation"])
        t = segmentos.composicion_entrenamiento(df, particion).reset_index()
        self.assertEqual(list(t.columns), ["mes", "train", "validation"])
        self.assertEqual(t.set_index("mes").loc["2026-08", "train"], 2)


if __name__ == "__main__":
    unittest.main()
