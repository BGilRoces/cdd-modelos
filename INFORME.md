# Resultados de la comparación de modelos

Corrida del 22/11/2026 sobre los 3.981 episodios maduros del snapshot del 01/11. Todas las cifras salen de `resultados/` y se reproducen con `python -m modelado`.

## Resumen

- Con las 58 variables del protocolo, bosque y árbol llegan a una Average Precision de 0,88 y 0,86 en test.
- Esa cifra depende en buena parte del **largo del texto** del primer mensaje del cliente. Ese largo se concentra en unos pocos valores exactos (54 caracteres en el 29 % de los episodios, 58 en el 14 %, 48 en el 12 %), compatibles con el mensaje que el anuncio precarga en WhatsApp. Cambiar el texto del anuncio cambia ese valor y el modelo deja de funcionar. No tenemos el texto de los mensajes para confirmarlo.
- Por eso el análisis central se hace **sin las dos variables de largo de texto** (`inbound_text_chars` y `anchor_useful_text_chars`), quedando 56 variables. Resultado: las variables operativas solas no predicen nada (Average Precision 0,50, igual que el azar) y las señales de familia de producto sí (0,88).
- Con las 56 variables, árbol y bosque empatan. Se recomienda el **árbol**, que es más simple y explicable.

## Particiones

| Partición | Episodios | Con respuesta humana |
|---|---|---|
| Train (antes de septiembre) | 1.635 | 53,2 % |
| Validation (septiembre) | 1.165 | 62,1 % |
| Test (octubre) | 1.042 | 49,0 % |
| Purgados | 139 | — |

La proporción de respuestas humanas cambia entre meses. Con el umbral de 0,5 los modelos tienden a predecir "con humano" de más (recall alto, precision cerca de 0,70). Por eso la comparación principal usa Average Precision, que no depende del umbral.

## Qué queda sin el largo del texto

Average Precision en test (octubre). Dummy: 0,490.

| Variables | Árbol | Bosque | MLP |
|---|---|---|---|
| 10 operativas | 0,810 | 0,845 | 0,640 |
| 9 operativas, sin largo de texto | 0,503 | 0,503 | 0,489 |
| 58 (protocolo) | 0,855 | 0,878 | 0,842 |
| 56, sin largo de texto | 0,875 | 0,877 | 0,852 |

Sin el largo de texto, las variables operativas (hora, día, horario laboral, cantidad de mensajes, duración) no distinguen nada. Agregarles las señales comerciales sube la Average Precision en 0,36 a 0,37 para los tres modelos (intervalos 95 %: árbol 0,329–0,416, bosque 0,323–0,421, MLP 0,317–0,412). Las 56 variables dan prácticamente lo mismo que las 58: la información útil está en las señales comerciales.

## Qué señales son las que importan

Permutando bloques de variables en validation (bosque, 56 variables), lo que más baja la métrica es la familia ofrecida por el bot (0,046), seguida de la familia pedida (0,035) y la coincidencia entre pedido y oferta (0,022). Las operativas aportan 0,008.

La tasa de respuesta humana depende mucho de qué producto se pide (sobre los 3.981 episodios):

| Familia pedida | Episodios | Con respuesta humana |
|---|---|---|
| Broches | 1.217 | 14 % |
| Abrojos | 195 | 31 % |
| Elásticos | 349 | 32 % |
| Telas | 112 | 68 % |
| Cintas | 204 | 74 % |
| Cierres | 85 | 75 % |
| "Ambos" | 1.314 | 94 % |
| Chalecos | 77 | 99 % |

Hay productos que el bot resuelve casi solo (broches) y otros que casi siempre pasan a una persona (chalecos). Conviene confirmar con la empresa si algunas familias se derivan por regla y no por decisión de una persona.

## Comparación entre modelos con las 56 variables

| Modelo | Average Precision (IC 95 %) | ROC-AUC | Precision | Recall | F1 | Brier |
|---|---|---|---|---|---|---|
| Dummy | 0,490 (0,460–0,521) | 0,500 | 0,490 | 1,000 | 0,658 | 0,252 |
| Árbol | 0,875 (0,843–0,902) | 0,890 | 0,665 | 0,918 | 0,771 | 0,169 |
| Bosque | 0,877 (0,840–0,909) | 0,900 | 0,702 | 0,939 | 0,803 | 0,155 |
| MLP | 0,852 (0,815–0,894) | 0,890 | 0,750 | 0,922 | 0,827 | 0,140 |

Precision, recall, F1 y Brier son con umbral 0,5. Los intervalos remuestrean contactos completos, no episodios sueltos.

Diferencias de Average Precision entre modelos (test, intervalo 95 %):

| Comparación | Diferencia | IC 95 % |
|---|---|---|
| Bosque − árbol | +0,003 | −0,014 a 0,020 |
| Bosque − MLP | +0,025 | −0,012 a 0,057 |
| Árbol − MLP | +0,023 | −0,012 a 0,053 |

Los tres modelos son estadísticamente indistinguibles en test. Con las 58 variables el bosque sí le ganaba al árbol (+0,023, IC 0,005 a 0,040), pero esa ventaja desaparece al sacar el largo de texto.

## Modelo recomendado

**Árbol de decisión con las 56 variables** (profundidad 8, 39 hojas). Es el más simple de los tres que empatan y el protocolo pide preferirlo en ese caso. Se puede dibujar y explicar a la gerencia en términos de producto pedido y producto ofrecido. El bosque queda como alternativa si el grupo prefiere el mejor valor puntual (fue el mejor en validation, 0,946, y el mejor calibrado entre los dos de árbol). La decisión final es del grupo.

## Utilidad para quien supervisa

Si el gerente revisa solo los chats con mayor puntaje del árbol (56 variables, test):

| Chats revisados | Con respuesta humana | Cobertura de los chats con respuesta humana | Mejora sobre azar |
|---|---|---|---|
| 10 % | 94 % | 19 % | 1,9 veces |
| 20 % | 93 % | 38 % | 1,9 veces |
| 30 % | 93 % | 57 % | 1,9 veces |
| 50 % | 82 % | 83 % | 1,7 veces |

Con el 20 % de arriba se revisan unos 210 chats de 1.042 y casi todos terminan con una persona.

## ¿El ranking ordena por atención real?

Se dividió el test en cinco tramos según el puntaje. En el árbol con 56 variables, el tramo de mayor puntaje tuvo 4,1 mensajes humanos por chat y 92 % con foto o documento; el de menor puntaje, 0,2 y 2 %. La correlación de Spearman entre puntaje y cantidad de mensajes humanos es 0,62 (bosque 0,63). Es el mismo orden que con las 58 variables. Esto describe conducta histórica, no necesidad.

## Limitaciones

- La etiqueta mide si una persona respondió, no si el chat lo necesitaba.
- El test es retrospectivo (octubre ya había sido inspeccionado) y cubre un solo mes.
- Hay un fuerte componente de producto: buena parte de lo que predice el modelo puede ser una regla de derivación del negocio. Si cambia el catálogo o las reglas del bot, hay que reentrenar.
- La hipótesis sobre el largo del texto (mensaje precargado del anuncio) no está verificada porque la copia del repo no trae el contenido de los mensajes.
- Las 56 variables son un análisis adicional: el protocolo fija las 58.
- No se recalibró: se reporta Brier y la curva de calibración (`figuras/05_calibracion.png`), pero los puntajes no son probabilidades confiables sin recalibrar.
- El MLP usa solo escalado, como fija el protocolo.

## Archivos de resultados

| Archivo | Contenido |
|---|---|
| `metricas.csv` | todas las métricas por modelo, grupo de variables, partición y umbral |
| `intervalos_test.csv` | Average Precision y ROC-AUC con intervalos por contacto |
| `aporte_comerciales_test.csv` | diferencia entre usar o no las señales comerciales, con y sin largo de texto |
| `diferencias_entre_modelos_test.csv` | diferencias de Average Precision entre modelos |
| `cobertura_top_k_test.csv` | qué pasa si se revisa solo el 10, 20, 30 o 50 % de mayor puntaje |
| `atencion_por_tramo_test.csv` | ranking contra atención humana observada |
| `importancia_bloques.csv` | caída de la métrica al permutar cada bloque |
| `sensibilidad_contactos.csv` | test con un episodio por contacto |
| `busqueda.csv` | las 107 configuraciones probadas por grupo de variables |
| `configuracion.json` | configuraciones elegidas, particiones, hashes, versiones |
| `figuras/` | gráficos 01 a 11 |
