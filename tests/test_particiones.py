import unittest

import pandas as pd

from modelado import particiones


class AsignacionTemporal(unittest.TestCase):
    def test_reparte_y_purga_en_las_fronteras(self):
        anclas = ["2026-08-31 10:00", "2026-08-31 10:00", "2026-09-15 08:00",
                  "2026-09-30 20:00", "2026-10-31 23:00", "2026-10-02 09:00"]
        fines = ["2026-08-31 23:00", "2026-09-01 10:00", "2026-09-16 08:00",
                 "2026-10-01 20:00", "2026-11-01 23:00", "2026-10-03 09:00"]
        resultado = particiones.asignar(anclas, fines).tolist()
        self.assertEqual(resultado, ["train", "purgado", "validation", "purgado", "test", "test"])

    def test_conteos_suman_el_total(self):
        p = pd.Series(["train", "train", "test", "purgado"])
        self.assertEqual(particiones.conteos(p), {"train": 2, "test": 1, "purgado": 1})

    def test_huella_no_depende_del_orden(self):
        a = particiones.huella(["a", "b"], ["train", "test"])
        b = particiones.huella(["b", "a"], ["test", "train"])
        self.assertEqual(a, b)

    def test_huella_cambia_si_cambia_una_asignacion(self):
        a = particiones.huella(["a", "b"], ["train", "test"])
        b = particiones.huella(["a", "b"], ["train", "validation"])
        self.assertNotEqual(a, b)

    def test_verificar_conteos_rechaza_valores_distintos(self):
        with self.assertRaises(ValueError):
            particiones.verificar_conteos(pd.Series(["train", "test"]))


if __name__ == "__main__":
    unittest.main()
