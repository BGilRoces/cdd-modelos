# Modelos de prioridad de atención — Hitelac

Comparación de cuatro clasificadores supervisados (Dummy, árbol de decisión, random forest y MLP) para predecir si un chat va a recibir respuesta humana en las 24 horas posteriores a la primera respuesta comercial del bot. Trabajo práctico de Ciencia de Datos (UADE). Implementa el protocolo de `PROTOCOLO_MODELADO.md` del repositorio CDD.

Los resultados y la justificación del modelo elegido están en [INFORME.md](INFORME.md).

## Requisitos

- Python 3.12
- El repositorio CDD clonado como carpeta hermana (`../CDD`). Los datos no se copian a este repo: se leen desde `CDD/datasets/`. Si CDD está en otro lugar, definir la variable de entorno `CDD_DATOS` con la ruta a esa carpeta.

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Uso

```powershell
.venv\Scripts\python -m modelado
```

Tarda unos dos minutos. Antes de entrenar verifica los hashes de los dos SQLite contra sus manifiestos, valida el esquema de las 58 variables y comprueba que los conteos de las particiones coincidan con los fijados en el protocolo. Si algo no cierra, se detiene.

Tests:

```powershell
.venv\Scripts\python -m unittest discover -s tests -v
```

## Qué hace

1. **Datos.** Une las 58 variables al ancla con el resultado de cada episodio y se queda con los 3.981 episodios maduros.
2. **Particiones.** Train antes del 01/09, validation en septiembre y test en octubre, sin barajar. Los episodios cuyo horizonte de 24 h cruza una frontera se purgan (139). Se guarda una huella de la asignación.
3. **Búsqueda.** Cada modelo, con las 10 variables operativas y con las 58, se ajusta sobre train y se elige la configuración con mayor Average Precision en validation. Presupuesto: 1 configuración para Dummy, 70 para el árbol, 18 para el bosque y 18 para el MLP.
4. **Evaluación en test.** Matriz de confusión, accuracy, precision, recall, F1, Average Precision, ROC-AUC y Brier, con intervalos que remuestrean contactos completos. Se reporta también el umbral de 0,5 y un umbral elegido en validation.
5. **Chequeo del ranking.** Se parte el test en cinco tramos según el puntaje y se mide cuánta atención humana recibió cada tramo (mensajes de una persona, fotos o documentos enviados). Esos indicadores se usan solo para evaluar, nunca como variables del modelo.

## Estructura

```
modelado/
  config.py          rutas, semilla, cortes y grupos de variables
  datos.py           carga, validaciones e indicadores de atención
  particiones.py     split temporal con purga y huella
  modelos.py         definición de los cuatro modelos y sus grillas
  entrenamiento.py   búsqueda de configuración
  evaluacion.py      métricas, intervalos, importancia por bloque
  graficos.py        figuras
  ejecutar.py        corrida completa
tests/               pruebas unitarias
resultados/          tablas, figuras y configuración de la última corrida
```

`resultados/local/` (predicciones por episodio) no se versiona.

## Límites

- La etiqueta es una conducta histórica: indica que una persona respondió, no que el chat lo necesitara.
- Octubre ya había sido inspeccionado en el trabajo previo: el test es retrospectivo, no virgen.
- Los datos son seudonimizados, no anónimos. No se publican filas individuales ni se copian las bases.
