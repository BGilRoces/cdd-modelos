(function () {
  "use strict";
  const R = DATOS.resultados;
  const M = DATOS.modelos;
  const COL = { dummy: "#8a94a0", arbol: "#2f5da8", bosque: "#6b54a6", mlp: "#d9822b", verde: "#1d5c4e", hilo: "#cf432c", cinta: "#f2c230" };
  const NOMBRE = { dummy: "Dummy", arbol: "Árbol", bosque: "Bosque", mlp: "MLP" };
  const GRUPO = "completo_sin_largo";

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v, d = 0) => Number(v).toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 0) => num(v * 100, d) + " %";
  const dec = (v, d = 2) => num(v, d);

  /* ---------- equipo (editable, se guarda en el navegador) ---------- */
  const EQUIPO = [
    { rol: "Dominio y problema", nombre: "Integrante 1" },
    { rol: "Arquitectura y datos", nombre: "Integrante 2" },
    { rol: "Análisis exploratorio", nombre: "Integrante 3" },
    { rol: "Técnica de minería", nombre: "Integrante 4" },
    { rol: "Conclusión y relato", nombre: "Integrante 5" },
    { rol: "Aplicación funcional", nombre: "Integrante 6" },
  ];
  try {
    const guardado = JSON.parse(localStorage.getItem("cdd_equipo") || "null");
    if (Array.isArray(guardado)) guardado.forEach((g, i) => { if (EQUIPO[i] && g && g.nombre) EQUIPO[i].nombre = g.nombre; });
  } catch (e) { /* sin almacenamiento: se usan los nombres por defecto */ }
  const guardarEquipo = () => { try { localStorage.setItem("cdd_equipo", JSON.stringify(EQUIPO)); } catch (e) { /* ignorar */ } };

  /* ---------- simulador: de la descripción del chat al vector de 56 variables ---------- */
  const FAM = DATOS.familias_ids;
  const FAM_NOMBRE = DATOS.familias_nombres;
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  const sim = { pide: new Set(["broches"]), ofrece: new Set(["broches"]), dia: 1, hora: 15, texto: 1, media: 0, bot: 1, seg: 12 };

  const enHorario = (dia, hora) => dia <= 4 && ((hora >= 8 && hora <= 12) || (hora >= 14 && hora <= 17));

  function vectorDe(s) {
    const f = {};
    const pide = FAM.filter((id) => s.pide.has(id));
    const ofrece = FAM.filter((id) => s.ofrece.has(id));
    const coincide = pide.filter((id) => s.ofrece.has(id));
    for (const id of FAM) {
      f["requested_" + id] = s.pide.has(id) ? 1 : 0;
      f["offered_" + id] = s.ofrece.has(id) ? 1 : 0;
      f["matched_" + id] = s.pide.has(id) && s.ofrece.has(id) ? 1 : 0;
    }
    f.requested_family_count = pide.length;
    f.offered_family_count = ofrece.length;
    f.matched_family_count = coincide.length;
    f.request_family_detected = pide.length > 0 ? 1 : 0;
    f.request_family_not_detected = pide.length > 0 ? 0 : 1;
    f.offer_family_detected = ofrece.length > 0 ? 1 : 0;
    f.offer_family_not_detected = ofrece.length > 0 ? 0 : 1;
    f.has_matching_family = coincide.length > 0 ? 1 : 0;
    f.has_unmatched_request = pide.some((id) => !s.ofrece.has(id)) ? 1 : 0;
    f.has_additional_offer = ofrece.some((id) => !s.pide.has(id)) ? 1 : 0;
    f.request_text_available = s.texto > 0 ? 1 : 0;
    f.prefix_inbound = s.texto + s.media;
    f.prefix_bot_messages = s.bot;
    f.prefix_messages = s.texto + s.media + s.bot;
    f.prefix_duration_seconds = s.seg;
    f.hour = s.hora;
    f.weekday = s.dia;
    f.business_hours = enHorario(s.dia, s.hora) ? 1 : 0;
    f.inbound_text_messages = s.texto;
    f.inbound_nontext_messages = s.media;
    return DATOS.columnas.map((c) => {
      if (f[c] === undefined) throw new Error("Falta la variable " + c);
      return f[c];
    });
  }

  const EJEMPLOS = [
    { nombre: "Pide cintas, el bot ofrece cintas", pide: ["cintas"], ofrece: ["cintas"] },
    { nombre: "Pide elásticos, el bot ofrece elásticos", pide: ["elasticos"], ofrece: ["elasticos"] },
    { nombre: "Consulta sin producto", pide: [], ofrece: [] },
    { nombre: "Pide abrojos, el bot ofrece abrojos", pide: ["abrojos"], ofrece: ["abrojos"] },
    { nombre: "Pide broches, el bot ofrece broches", pide: ["broches"], ofrece: ["broches"] },
  ];
  const detalleEjemplo = (e) => {
    const n = (ids) => ids.map((i) => FAM_NOMBRE[FAM.indexOf(i)].toLowerCase()).join(" y ") || "nada";
    return "Pide " + n(e.pide) + " · el bot ofrece " + n(e.ofrece);
  };
  const probEjemplo = (e) => motor.predecirBosque(M.bosque, vectorDe({ ...sim, pide: new Set(e.pide), ofrece: new Set(e.ofrece), hora: 15, dia: 1, texto: 1, media: 0, bot: 1, seg: 12 }));

  /* ---------- descripción de reglas del árbol ---------- */
  const BIN = new Set(DATOS.binarias);
  const etiqueta = (i) => DATOS.etiquetas[DATOS.columnas[i]];
  function reglaTexto(paso) {
    const col = DATOS.columnas[paso.variable];
    if (BIN.has(col)) return etiqueta(paso.variable) + ": " + (paso.izquierda ? "no" : "sí");
    return etiqueta(paso.variable) + (paso.izquierda ? " ≤ " : " > ") + num(paso.umbral, 1);
  }

  /* ---------- gráficos SVG ---------- */
  const svg = (w, h, dentro) => `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">${dentro}</svg>`;

  function graficoFamilias() {
    const filas = R.familias.filter((f) => f.tasa !== null).sort((a, b) => b.tasa - a.tasa);
    const w = 1040, fila = 44, x0 = 330, ancho = 560, h = filas.length * fila + 60;
    let s = "";
    s += `<line class="rejilla" x1="${x0 + ancho / 2}" x2="${x0 + ancho / 2}" y1="20" y2="${h - 40}"/>`;
    s += `<text class="chico suave" x="${x0 + ancho / 2}" y="14" text-anchor="middle" font-size="21">mitad de los chats</text>`;
    filas.forEach((f, i) => {
      const y = 40 + i * fila;
      const chica = f.episodios < 30;
      const color = f.tasa < 0.35 ? COL.verde : f.tasa > 0.6 ? COL.hilo : COL.dummy;
      s += `<g opacity="${chica ? 0.42 : 1}">`;
      s += `<text x="${x0 - 18}" y="${y + 23}" text-anchor="end" font-size="26" font-weight="600">${esc(f.nombre)}</text>`;
      s += `<rect x="${x0}" y="${y}" width="${f.tasa * ancho}" height="30" fill="${color}" rx="3"/>`;
      s += `<text x="${x0 + f.tasa * ancho + 12}" y="${y + 24}" font-size="26" font-weight="700" class="disp">${pct(f.tasa)}</text>`;
      s += `<text x="${w - 4}" y="${y + 23}" text-anchor="end" font-size="22" class="suave">${num(f.episodios)} chats${chica ? "*" : ""}</text>`;
      s += `</g>`;
    });
    return svg(w, h, s);
  }

  function graficoAblacion() {
    const w = 1040, h = 560, izq = 72, arriba = 54, abajo = 104, alto = h - arriba - abajo;
    const y = (v) => arriba + alto * (1 - (v - 0.4) / 0.6);
    const grupos = [
      ["operativas", ["10 operativas"]],
      ["operativas_sin_largo", ["9 operativas", "sin largo de texto"]],
      ["completo", ["58 variables", "(protocolo)"]],
      ["completo_sin_largo", ["56 variables", "sin largo de texto"]],
    ];
    const gw = (w - izq - 10) / 4;
    let s = "";
    for (let v = 0.4; v <= 1.0001; v += 0.1) {
      s += `<line class="rejilla" x1="${izq}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 12}" y="${y(v) + 7}" text-anchor="end" font-size="21" class="suave">${dec(v, 1)}</text>`;
    }
    s += `<rect x="${izq + gw * 3 + 6}" y="${arriba - 14}" width="${gw - 12}" height="${alto + 14}" fill="#cfe3d9" opacity=".75" rx="4"/>`;
    const orden = ["arbol", "bosque", "mlp"];
    grupos.forEach(([g, etiquetas], gi) => {
      orden.forEach((m, mi) => {
        const v = R.metricas[g][m].ap;
        const bx = izq + gi * gw + (gw - 3 * 60 - 2 * 8) / 2 + mi * 68;
        s += `<rect x="${bx}" y="${y(v)}" width="60" height="${y(0.4) - y(v)}" fill="${COL[m]}" rx="3"/>`;
        s += `<text x="${bx + 30}" y="${y(v) - 9}" text-anchor="middle" font-size="24" font-weight="700" class="disp">${dec(v, 2)}</text>`;
      });
      etiquetas.forEach((t, ti) => { s += `<text x="${izq + gi * gw + gw / 2}" y="${h - abajo + 38 + ti * 28}" text-anchor="middle" font-size="25" font-weight="${ti ? 400 : 600}">${esc(t)}</text>`; });
    });
    const azar = R.metricas.completo_sin_largo.dummy.ap;
    s += `<line x1="${izq}" x2="${w - 10}" y1="${y(azar)}" y2="${y(azar)}" stroke="#18222d" stroke-width="3" stroke-dasharray="10 7"/>`;
    s += `<line x1="${izq + 460}" x2="${izq + 496}" y1="21" y2="21" stroke="#18222d" stroke-width="3" stroke-dasharray="8 5"/><text x="${izq + 506}" y="29" font-size="24" font-weight="600">Azar ${dec(azar, 2)}</text>`;
    orden.forEach((m, i) => { s += `<rect x="${izq + i * 150}" y="10" width="22" height="22" fill="${COL[m]}" rx="3"/><text x="${izq + i * 150 + 32}" y="29" font-size="24" font-weight="600">${NOMBRE[m]}</text>`; });
    return svg(w, h, s);
  }

  function graficoTopK() {
    const filas = R.top_k[GRUPO + "/bosque"];
    const azarPrec = R.particiones.test.positivos;
    const w = 940, h = 500, izq = 70, arriba = 50, abajo = 90, alto = h - arriba - abajo;
    const y = (v) => arriba + alto * (1 - v);
    const gw = (w - izq - 10) / filas.length;
    let s = "";
    for (let v = 0; v <= 1.0001; v += 0.25) s += `<line class="rejilla" x1="${izq}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 12}" y="${y(v) + 7}" text-anchor="end" font-size="21" class="suave">${Math.round(v * 100)} %</text>`;
    filas.forEach((f, i) => {
      const bx = izq + i * gw + (gw - 2 * 70 - 10) / 2;
      s += `<rect x="${bx}" y="${y(f.precision)}" width="70" height="${y(0) - y(f.precision)}" fill="${COL.bosque}" rx="3"/>`;
      s += `<text x="${bx + 35}" y="${y(f.precision) - 9}" text-anchor="middle" font-size="24" font-weight="700" class="disp">${Math.round(f.precision * 100)} %</text>`;
      s += `<rect x="${bx + 80}" y="${y(f.cobertura)}" width="70" height="${y(0) - y(f.cobertura)}" fill="${COL.verde}" rx="3"/>`;
      s += `<text x="${bx + 115}" y="${y(f.cobertura) - 9}" text-anchor="middle" font-size="24" font-weight="700" class="disp">${Math.round(f.cobertura * 100)} %</text>`;
      s += `<line x1="${bx + 80}" x2="${bx + 150}" y1="${y(f.fraccion)}" y2="${y(f.fraccion)}" stroke="#18222d" stroke-width="3" stroke-dasharray="6 5"/>`;
      s += `<text x="${izq + i * gw + gw / 2}" y="${h - abajo + 40}" text-anchor="middle" font-size="26" font-weight="600">Primeros ${Math.round(f.fraccion * 100)} %</text>`;
      s += `<text x="${izq + i * gw + gw / 2}" y="${h - abajo + 68}" text-anchor="middle" font-size="21" class="suave">${num(f.chats_revisados)} chats</text>`;
    });
    s += `<line x1="${izq}" x2="${w - 10}" y1="${y(azarPrec)}" y2="${y(azarPrec)}" stroke="#18222d" stroke-width="3" stroke-dasharray="10 7" opacity=".55"/>`;
    s += `<rect x="${izq}" y="8" width="22" height="22" fill="${COL.bosque}" rx="3"/><text x="${izq + 32}" y="27" font-size="23" font-weight="600">Acierto: terminan con una persona</text>`;
    s += `<rect x="${izq + 440}" y="8" width="22" height="22" fill="${COL.verde}" rx="3"/><text x="${izq + 472}" y="27" font-size="23" font-weight="600">Cobertura</text>`;
    return svg(w, h, s);
  }

  function graficoTramos() {
    const filas = R.tramos[GRUPO + "/bosque"].filas;
    const w = 940, h = 500, izq = 70, arriba = 40, abajo = 120, alto = h - arriba - abajo;
    const y = (v) => arriba + alto * (1 - v);
    const gw = (w - izq - 10) / filas.length;
    let s = "";
    for (let v = 0; v <= 1.0001; v += 0.25) s += `<line class="rejilla" x1="${izq}" x2="${w - 10}" y1="${y(v)}" y2="${y(v)}"/><text x="${izq - 12}" y="${y(v) + 7}" text-anchor="end" font-size="21" class="suave">${Math.round(v * 100)} %</text>`;
    filas.forEach((f, i) => {
      const bx = izq + i * gw + (gw - 96) / 2;
      const color = f.tasa_respuesta > 0.6 ? COL.hilo : f.tasa_respuesta < 0.3 ? COL.verde : COL.dummy;
      s += `<rect x="${bx}" y="${y(f.tasa_respuesta)}" width="96" height="${y(0) - y(f.tasa_respuesta)}" fill="${color}" rx="3"/>`;
      s += `<text x="${bx + 48}" y="${y(f.tasa_respuesta) - 9}" text-anchor="middle" font-size="26" font-weight="700" class="disp">${Math.round(f.tasa_respuesta * 100)} %</text>`;
      s += `<text x="${bx + 48}" y="${h - abajo + 34}" text-anchor="middle" font-size="26" font-weight="600">${esc(f.tramo)}</text>`;
      s += `<text x="${bx + 48}" y="${h - abajo + 64}" text-anchor="middle" font-size="22" class="suave">${dec(f.mensajes_humanos, 1)} mensajes</text>`;
      s += `<text x="${bx + 48}" y="${h - abajo + 90}" text-anchor="middle" font-size="22" class="suave">${Math.round(f.con_adjuntos * 100)} % con foto</text>`;
    });
    return svg(w, h, s);
  }

  function graficoLargo() {
    const filas = R.largo_texto;
    const w = 860, fila = 96, h = filas.length * fila + 44;
    let s = `<text x="256" y="24" font-size="22" class="suave">Parte de todos los chats</text><text x="560" y="24" font-size="22" class="suave">Chats con una persona</text>`;
    filas.forEach((f, i) => {
      const y = 48 + i * fila;
      s += `<text x="236" y="${y + 38}" text-anchor="end" font-size="29" font-weight="700" class="disp">${f.caracteres} caracteres</text>`;
      s += `<rect x="256" y="${y + 6}" width="${f.porcentaje * 560}" height="46" fill="${COL.dummy}" rx="3"/>`;
      s += `<text x="${256 + f.porcentaje * 560 + 10}" y="${y + 40}" font-size="26" font-weight="600">${pct(f.porcentaje)}</text>`;
      const color = f.tasa > 0.6 ? COL.hilo : f.tasa < 0.35 ? COL.verde : COL.dummy;
      s += `<rect x="560" y="${y + 6}" width="${f.tasa * 200}" height="46" fill="${color}" rx="3"/>`;
      s += `<text x="${560 + f.tasa * 200 + 10}" y="${y + 40}" font-size="26" font-weight="700" class="disp">${pct(f.tasa)}</text>`;
    });
    return svg(w, h, s);
  }

  function graficoBloques() {
    const filas = [...R.bloques].sort((a, b) => b.caida_ap - a.caida_ap);
    const w = 1000, fila = 64, h = filas.length * fila + 20, x0 = 330, maximo = Math.max(...filas.map((f) => f.caida_ap));
    let s = "";
    filas.forEach((f, i) => {
      const y = 10 + i * fila, l = (f.caida_ap / maximo) * 520;
      s += `<text x="${x0 - 18}" y="${y + 33}" text-anchor="end" font-size="26" font-weight="600">${esc(f.bloque)}</text>`;
      s += `<rect x="${x0}" y="${y + 6}" width="${l}" height="40" fill="${f.bloque === "Operativas" ? COL.dummy : COL.verde}" rx="3"/>`;
      s += `<text x="${x0 + l + 12}" y="${y + 36}" font-size="25" font-weight="700" class="disp">${dec(f.caida_ap, 3)}</text>`;
    });
    return svg(w, h, s);
  }

  /* ---------- árbol navegable ---------- */
  function arbolHTML(camino) {
    const a = M.arbol;
    const enCamino = new Set(camino.pasos.map((p) => p.nodo));
    enCamino.add(camino.hoja);
    const colorProb = (p) => (p >= 0.7 ? "#cf432c" : p <= 0.3 ? "#1d5c4e" : "#8a94a0");
    function rec(i, ramaTxt, ramaClase, profundidad) {
      const rama = ramaTxt ? `<span class="rama ${ramaClase}">${esc(ramaTxt)}</span>` : "";
      const marca = enCamino.has(i) ? " en-camino" : "";
      if (a.f[i] < 0) {
        const p = a.pn[i];
        return `<div class="hoja-nodo${marca}">${rama}<span class="prob-hoja" style="background:${colorProb(p)}">${pct(p)}</span> ${p >= 0.5 ? "interviene una persona" : "lo resuelve el bot"} <span class="chico">(${num(a.n[i])} chats de entrenamiento)</span></div>`;
      }
      const col = DATOS.columnas[a.f[i]];
      const binaria = BIN.has(col);
      const pregunta = binaria ? esc(etiqueta(a.f[i])) + "?" : esc(etiqueta(a.f[i])) + " ≤ " + num(a.t[i], 1) + "?";
      const abierto = profundidad < 2 || enCamino.has(i) ? " open" : "";
      return `<details class="${marca}"${abierto}><summary>${rama}${pregunta}</summary>` +
        rec(a.l[i], binaria ? "No" : "Sí", binaria ? "no" : "si", profundidad + 1) +
        rec(a.r[i], binaria ? "Sí" : "No", binaria ? "si" : "no", profundidad + 1) + `</details>`;
    }
    return rec(0, "", "", 0);
  }

  /* ---------- diapositivas ---------- */
  const top20 = () => R.top_k[GRUPO + "/bosque"].find((f) => f.fraccion === 0.2);
  const ap = (g, m) => R.metricas[g][m].ap;
  const etqProb = (p) => `<span class="etq-prob ${p >= 0.7 ? "alta" : p <= 0.3 ? "baja" : "media"}">${Math.round(p * 100)}</span>`;

  function etiquetaHTML(texto, quien) {
    const q = quien === null ? "" : `<span class="etq-quien">Presenta <b data-quien="${quien}">${esc(EQUIPO[quien].nombre)}</b></span>`;
    return `<div class="etiqueta"><span class="etq-nombre">${esc(texto)}</span>${q}</div>`;
  }

  const SLIDES = [];
  function slide(def) { SLIDES.push(def); }

  slide({
    clase: "portada", tag: "Ciencia de Datos · Trabajo Práctico Obligatorio", quien: null, min: 0.3, titulo: "",
    corto: "Portada",
    notas: ["Saludar y presentar al grupo en diez segundos.", "Abrir con la pregunta, no con la tecnología: el público es la Gerencia Comercial y Técnica.", "Avisar que la presentación es también la aplicación: los modelos corren dentro de esta página."],
    html: () => `
      <h1 class="titulo">¿A qué chat le toca una persona primero?</h1>
      <p class="sub">Un modelo que ordena los chats de WhatsApp de Hitelac según qué tan probable es que necesiten a una persona.</p>
      <p class="chico" style="margin-top:26px">UADE · Ciencia de Datos · Docente: Santiago Martín</p>
      <div class="equipo-lista">${EQUIPO.map((e, i) => `<div><b data-quien="${i}">${esc(e.nombre)}</b><span>${esc(e.rol)}</span></div>`).join("")}</div>
      <div class="bandeja"><div class="hoja">
        <h4>Bandeja ordenada por el modelo</h4>
        ${EJEMPLOS.map((e) => ({ e, p: probEjemplo(e) })).sort((a, b) => b.p - a.p).map(({ e, p }) => `
          <div class="fila-chat"><div><div class="quien">${esc(e.nombre.split(",")[0])}</div><div class="detalle">${esc(detalleEjemplo(e))}</div></div>${etqProb(p)}</div>`).join("")}
        <div class="pie">Cinco chats de ejemplo evaluados en vivo por el bosque. El número es el puntaje de prioridad, de 0 a 100: cuanto más alto, más arriba en la bandeja.</div>
      </div></div>`,
  });

  slide({
    tag: "Hipótesis y resultado", quien: 0, min: 0.9, corto: "La respuesta primero",
    titulo: "Con lo que el bot ya respondió, Hitelac puede saber qué chats van a necesitar a una persona",
    notas: ["Conclusión primero, como pide la consigna.", "Leer las tres respuestas de la hipótesis: qué, para quién, cómo entrega valor.", "Explicar 'acierto' en términos de negocio: de los chats que el modelo marca primero, cuántos terminan con una persona."],
    html: () => {
      const t = top20();
      return `<div class="grid g-2-1 cuerpo" style="gap:80px;margin-top:52px">
        <div style="display:grid;gap:34px;align-content:start">
          <div><div class="pregunta">¿Qué proponemos resolver?</div><div class="respuesta">Anticipar, en el momento en que el bot responde, si el chat va a terminar con una persona en las próximas 24 horas.</div></div>
          <div><div class="pregunta">¿Para quién?</div><div class="respuesta">Para la gerencia comercial y técnica, que hoy lee todos los chats para decidir cuáles atender primero.</div></div>
          <div><div class="pregunta">¿Cómo entrega valor?</div><div class="respuesta">La supervisión empieza por los chats que más probablemente necesitan a una persona, en vez de hacerse a ojo.</div></div>
        </div>
        <div style="display:grid;gap:34px;align-content:start">
          <div><div class="cifra hilo">${Math.round(t.precision * 100)} de 100</div><div class="leyenda">de los chats que el modelo pone primero (1 de cada 5) terminan con una persona. Al azar serían ${Math.round(R.particiones.test.positivos * 100)}.</div></div>
          <div><div class="cifra med verde">${Math.round(t.cobertura * 100)} %</div><div class="leyenda">de todos los chats que necesitaron a una persona quedan cubiertos revisando solo ese quinto.</div></div>
        </div>
      </div>
      <div class="cosido" style="margin-top:30px;padding:20px 34px"><span class="texto suave">Lo probamos con los chats de octubre de 2026, que el modelo no vio al entrenarse ni al ajustarse.</span></div>`;
    },
  });

  slide({
    tag: "Dominio y problema", quien: 0, min: 0.8, corto: "Cómo viaja un chat",
    titulo: "Un chat nace en un anuncio y pasa por un bot antes de llegar a una persona",
    notas: ["Hitelac importa telas e insumos de confección y va a sumar prendas y calzado: el volumen de chats crece.", "El bot responde con la información real de la base de productos, pero no ve fotos ni audios.", "El problema: nadie sabe de antemano cuáles chats van a necesitar a una persona."],
    html: () => `
      <div class="recorrido">
        <div class="estacion"><h4>Anuncio en Meta</h4><p>El cliente toca el anuncio y se abre WhatsApp con un mensaje precargado.</p></div>
        <div class="estacion"><h4>Bot con IA</h4><p>Responde con el catálogo real de la empresa. No ve fotos ni audios.</p></div>
        <div class="estacion clave"><h4>¿Interviene una persona?</h4><p>Pasa en ${pct(R.embudo.con_humano / R.embudo.maduros)} de los chats analizados.</p>
          <div class="partido"><div style="width:${(R.embudo.con_humano / R.embudo.maduros) * 100}%;background:#fff;color:#cf432c">${pct(R.embudo.con_humano / R.embudo.maduros)}</div><div style="flex:1;background:rgba(255,255,255,.3)"></div></div></div>
        <div class="estacion"><h4>Atención humana</h4><p>Un vendedor responde, manda fotos, precios o descuentos.</p></div>
      </div>
      <div class="grid g2" style="margin-top:56px;gap:70px">
        <div><div class="pregunta">El problema</div><p class="texto" style="margin-top:6px">El gerente entra y tiene que leer todos los chats para saber cuáles priorizar. No hay forma de anticipar qué conversación va a necesitar a una persona.</p></div>
        <div><div class="pregunta">El caso de estudio</div><p class="texto" style="margin-top:6px">${num(R.embudo.maduros)} conversaciones reales de Hitelac, una importadora de telas e insumos de confección que va a sumar prendas y calzado. ${num(R.embudo.con_humano)} terminaron con una persona.</p></div>
      </div>`,
  });

  slide({
    tag: "Dominio y problema", quien: 0, min: 0.6, corto: "Valor para el negocio",
    titulo: "Revisar uno de cada cinco chats, en orden, cubre casi el doble que hacerlo al azar",
    notas: ["Traducir las métricas a plata y tiempo: menos lectura con el mismo foco.", "Aclarar el límite: el modelo mide dónde hoy interviene el equipo, no si el chat lo necesitaba.", "No prometemos ventas: no hay datos de venta en el caso."],
    html: () => {
      const t = top20();
      const azar = R.particiones.test.positivos;
      const barra = (etq, v, color) => `<div style="margin:8px 0"><div class="chico" style="margin-bottom:2px;font-size:22px">${etq}</div><div style="display:flex;align-items:center;gap:16px"><div style="height:34px;width:${v * 560}px;background:${color};border-radius:3px"></div><div class="disp" style="font-size:36px;font-family:var(--display);font-variation-settings:'wdth' 82,'wght' 700">${pct(v)}</div></div></div>`;
      return `<div class="grid g2 cuerpo" style="gap:70px;margin-top:28px">
        <div class="hoja" style="padding:26px 34px"><div class="pregunta">Si el gerente revisa el 20 % de los chats…</div>
          <div style="margin-top:8px;font-size:27px" class="fuerte">Al azar</div>
          ${barra("terminan con una persona", azar, "#8a94a0")}${barra("de los chats con persona que se alcanzan", 0.2, "#8a94a0")}
          <div style="margin-top:14px;font-size:27px" class="fuerte">Empezando por los que marca el modelo</div>
          ${barra("terminan con una persona", t.precision, "#2f5da8")}${barra("de los chats con persona que se alcanzan", t.cobertura, "#1d5c4e")}
        </div>
        <div style="display:grid;gap:28px;align-content:center">
          <div><div class="pregunta">Qué cambia</div><p class="texto" style="margin-top:6px">La supervisión deja de ser leer todo: se empieza por los chats con más probabilidad de intervención humana.</p></div>
          <div><div class="pregunta">Qué no cambia</div><p class="texto" style="margin-top:6px">El criterio del gerente. El puntaje es una prioridad sugerida y se puede explicar.</p></div>
          <div><span class="sello hilo">Límite</span><p class="texto suave" style="margin-top:8px">Medimos dónde interviene hoy el equipo. No prueba que el chat lo necesitara ni que termine en una venta.</p></div>
        </div>
      </div>`;
    },
  });

  slide({
    tag: "Arquitectura de la solución", quien: 1, min: 0.9, corto: "Arquitectura",
    titulo: "Todo el recorrido de los datos, de la fuente al puntaje, funciona sin internet",
    notas: ["Recorrer el diagrama de izquierda a derecha, una frase por estación.", "Remarcar la regla clave: las variables usan solo lo que existe cuando el bot responde.", "La fuente privada y la clave de seudonimización nunca salen del equipo dueño; el grupo trabaja con la copia revisada."],
    html: () => `
      <div class="recorrido seis">
        <div class="estacion"><h4>Fuente privada</h4><p>Exportación de los chats de WhatsApp y del bot.</p></div>
        <div class="estacion"><h4>Limpieza</h4><p>Saca pruebas, contactos internos y menús del bot. Seudonimiza con clave.</p></div>
        <div class="estacion"><h4>Data Mart</h4><p>Base SQLite con mensajes, sesiones, episodios y resultados.</p></div>
        <div class="estacion"><h4>Variables</h4><p>56 señales al momento en que responde el bot. Nada del futuro.</p></div>
        <div class="estacion"><h4>Modelos</h4><p>Dummy, árbol, bosque y MLP, con el mismo corte temporal.</p></div>
        <div class="estacion clave"><h4>Aplicación</h4><p>Puntaje de prioridad y tableros. Se abre sin conexión.</p></div>
      </div>
      <div class="grid g2" style="margin-top:50px;gap:56px">
        <div class="cosido"><div class="pregunta">Business intelligence</div><p class="texto" style="margin-top:6px">Nueve consultas SQL y dos tableros: demanda y respuesta, seguimiento y calidad.</p></div>
        <div class="cosido"><div class="pregunta">Integridad</div><p class="texto" style="margin-top:6px">Hashes verificados, corte temporal con purga de ${num(R.particiones.purgado.episodios)} episodios y revisión de que ninguna variable use datos posteriores.</p></div>
      </div>`,
  });

  slide({
    tag: "Arquitectura de la solución", quien: 1, min: 0.7, corto: "Los datos",
    titulo: "Partimos de 47 mil mensajes y llegamos a 3.981 conversaciones con resultado conocido",
    notas: ["Un episodio es una conversación en el momento en que el bot da su primera respuesta comercial.", "Maduro significa que ya pasaron las 24 horas y sabemos si respondió una persona.", "Decir qué falta: ventas, el texto de los mensajes en la copia compartida y quién respondió cada chat."],
    html: () => {
      const e = R.embudo;
      const paso = (v, t, ultimo) => `<div style="flex:1;position:relative"><div class="cifra med" style="font-size:80px">${num(v)}</div><div class="chico" style="margin-top:6px;min-height:60px">${t}</div></div>`;
      return `<div class="cuerpo" style="display:flex;gap:30px;align-items:flex-start">
          ${paso(e.mensajes_fuente, "mensajes en la exportación")}${paso(e.mensajes, "mensajes elegibles")}${paso(e.sesiones, "sesiones de consulta")}${paso(e.episodios, "episodios con respuesta del bot")}${paso(e.maduros, "episodios con las 24 h cumplidas")}
        </div>
        <div style="margin-top:20px"><div class="partido" style="height:56px;font-size:28px"><div style="width:${(e.con_humano / e.maduros) * 100}%;background:#cf432c">${num(e.con_humano)} con una persona</div><div style="flex:1;background:#1d5c4e">${num(e.sin_humano)} lo resolvió el bot</div></div></div>
        <div class="grid g2" style="margin-top:46px;gap:70px">
          <div><div class="pregunta">Qué hay</div><ul class="puntos chico" style="margin-top:10px"><li>${num(e.contactos)} contactos, seudonimizados.</li><li>Pedido del cliente y oferta del bot, por familia de producto.</li><li>Hora, día y ritmo de la conversación.</li></ul></div>
          <div><div class="pregunta">Qué falta</div><ul class="puntos hilo chico" style="margin-top:10px"><li>Ventas: no sabemos si el chat terminó en compra.</li><li>Quién respondió cada chat, para medir seniority.</li><li>El texto de los mensajes en la copia compartida.</li></ul></div>
        </div>`;
    },
  });

  slide({
    tag: "Análisis exploratorio", quien: 2, min: 0.8, corto: "Qué pide el cliente", chico: true,
    titulo: "Según qué producto pide el cliente, la intervención humana va del 14 % al 99 %",
    notas: ["Este es el hallazgo comercial más fuerte: el producto pedido marca el destino del chat.", "Broches son la mayoría de los pedidos y casi siempre los resuelve el bot; chalecos y la familia 'ambos' casi siempre pasan a una persona.", "Las filas con asterisco tienen pocos chats: no sacar conclusiones de ellas."],
    html: () => `<div class="grid g-2-1 cuerpo" style="gap:60px;align-items:start">
        <div>${graficoFamilias()}<div class="chico" style="margin-top:6px">Porcentaje de chats que terminaron con una persona, según la familia que pidió el cliente. * Menos de 30 chats.</div></div>
        <div style="display:grid;gap:26px;align-content:start;padding-top:20px">
          <div><div class="cifra med verde">14 %</div><div class="leyenda">de los chats que piden broches (1.217) los resuelve el bot casi solo.</div></div>
          <div><div class="cifra med hilo">94 – 99 %</div><div class="leyenda">de los que piden "ambos" o chalecos terminan con una persona.</div></div>
          <p class="texto suave">Puede haber reglas de derivación por producto. Lo vamos a confirmar con la empresa.</p>
        </div></div>`,
  });

  slide({
    tag: "Análisis exploratorio", quien: 2, min: 0.7, corto: "Los anuncios y los meses", chico: true,
    titulo: "Desde julio hay anuncios: el volumen se multiplicó por veinte y cambió qué se consulta",
    notas: ["Hasta junio no hay ni un chat de anuncio: unos 50 por mes, casi todos terminan con una persona.", "Desde julio aparecen los anuncios y en agosto el volumen se dispara. Casi todo el entrenamiento es de agosto.", "Dentro de agosto a octubre cambia qué producto se promociona (ambos médicos contra broches) y con eso cambia la proporción de chats con una persona.", "Consecuencia: hay que reentrenar cuando cambian las campañas."],
    html: () => {
      const MES = { "2026-03": "Marzo", "2026-04": "Abril", "2026-05": "Mayo", "2026-06": "Junio", "2026-07": "Julio", "2026-08": "Agosto", "2026-09": "Septiembre", "2026-10": "Octubre" };
      const filas = R.meses.map((r) => `<tr${r.mes === "2026-08" ? ' class="mejor"' : ""}><td>${MES[r.mes]}</td><td>${num(r.chats)}</td><td>${pct(r.con_anuncio)}</td><td>${pct(r.con_humano)}</td><td>${pct(r.pide_ambos)}</td><td>${pct(r.pide_broches)}</td></tr>`).join("");
      const c = Object.fromEntries(R.composicion.map((x) => [x.mes, x]));
      const train = R.composicion.reduce((a, x) => a + x.train, 0);
      return `<div class="grid cuerpo" style="grid-template-columns:1.2fr .8fr;gap:52px;align-items:start;margin-top:22px">
        <div><table class="tabla" style="font-size:24px"><thead><tr><th>2026</th><th>Chats</th><th>Con anuncio</th><th>Con humano</th><th>Piden ambos</th><th>Piden broches</th></tr></thead><tbody>${filas}</tbody></table>
          <div class="chico" style="margin-top:10px">Mes en que el bot respondió. "Con anuncio" incluye los anuncios inferidos por la regla de texto.</div></div>
        <div class="hoja" style="padding:26px 32px"><ul class="puntos chico">
          <li>Hasta junio no hay anuncios: unos 50 chats por mes, casi todos con una persona.</li>
          <li>Desde julio aparecen, y en agosto llegan a ${num(R.meses.find((r) => r.mes === "2026-08").chats)} chats.</li>
          <li>El entrenamiento es casi todo agosto: ${num(c["2026-08"].train)} de ${num(train)} chats.</li>
          <li>De agosto a octubre cambia qué se promociona: ambos pasa de 32 a 43 y a 35 %, y con eso la proporción con una persona (51, 60 y 49 %).</li>
          <li>Hay que reentrenar cuando cambian las campañas.</li></ul></div>
      </div>`;
    },
  });

  slide({
    tag: "Análisis exploratorio", quien: 2, min: 1.0, corto: "El atajo", chico: true,
    titulo: "Lo que más nos llamó la atención: un atajo que decidimos no usar",
    notas: ["El largo del primer mensaje del cliente predecía muy bien, pero se concentra en pocos valores exactos.", "Eso es la firma del mensaje precargado del anuncio. Cambia con cualquier retoque, hasta un signo de exclamación, y el modelo se rompería.", "Lo sacamos y medimos qué queda: las variables operativas solas quedan al nivel del azar; las comerciales sostienen todo."],
    html: () => `<div class="grid g2 cuerpo" style="gap:64px;align-items:start">
        <div>${graficoLargo()}<p class="chico" style="margin-top:12px">Los tres largos más frecuentes del primer mensaje del cliente. Cada valor es casi seguro un mensaje precargado distinto.</p></div>
        <div style="display:grid;gap:24px;align-content:start">
          <div class="hoja"><div class="pregunta">Por qué no lo usamos</div><p class="texto" style="margin-top:8px">El anuncio se satura, se cambia el texto y el valor cambia. Un modelo que depende de eso se rompe sin avisar.</p></div>
          <div class="hoja"><div class="pregunta">Qué pasa sin ese dato</div>
            <div style="display:flex;gap:40px;margin-top:12px;align-items:flex-end">
              <div><div class="cifra med">${dec(ap("operativas", "bosque"))}</div><div class="chico">con el largo de texto</div></div>
              <div><div class="cifra med hilo">${dec(ap("operativas_sin_largo", "bosque"))}</div><div class="chico">sin el largo (azar: ${dec(R.metricas.operativas.dummy.ap)})</div></div>
            </div>
            <p class="chico" style="margin-top:10px">Calidad del ranking con solo variables operativas (bosque).</p></div>
        </div></div>`,
  });

  slide({
    tag: "Técnica de minería", quien: 3, min: 1.0, corto: "Cuatro modelos", chico: true,
    titulo: "Cuatro modelos, un mismo corte temporal y una sola vara para compararlos",
    notas: ["Los cuatro son supervisados: aprenden de chats que ya tienen la respuesta conocida.", "El corte es por fecha, sin mezclar: entrenamos con lo anterior a septiembre, ajustamos en septiembre y probamos en octubre.", "La métrica principal es Average Precision: qué tan arriba pone los chats que sí terminan con una persona."],
    html: () => `<div class="grid g-2-1 cuerpo" style="gap:56px;align-items:start;grid-template-columns:1.15fr .85fr">
        <div class="tarjetas" style="grid-template-columns:1fr 1fr;gap:20px">
          ${[
            ["dummy", "Dummy", "Siempre responde la proporción que vio al entrenar. Es el piso: cualquier modelo real tiene que superarlo."],
            ["arbol", "Árbol de decisión", "Una cadena de preguntas de sí o no, como \"¿pidió chalecos?\". Se puede leer y explicar."],
            ["bosque", "Bosque aleatorio", "Trescientos árboles que votan. Suele ser más estable, pero ya no se puede leer."],
            ["mlp", "Red neuronal (MLP)", "Capas de neuronas que combinan las variables. Es la más difícil de explicar."],
          ].map(([id, n, t]) => `<div class="modelo ${id}" style="padding:22px 26px"><div class="nombre" style="font-size:34px">${n}</div><p style="font-size:26px;line-height:1.32;margin-top:8px;color:#46535f">${t}</p></div>`).join("")}
        </div>
        <div class="cosido"><div class="pregunta">Cómo los comparamos</div>
          <ul class="puntos chico" style="margin-top:12px">
            <li><b>Entrenan</b> con chats anteriores a septiembre (${num(R.particiones.train.episodios)}).</li>
            <li><b>Se ajustan</b> con septiembre (${num(R.particiones.validation.episodios)}).</li>
            <li><b>Se prueban</b> en octubre (${num(R.particiones.test.episodios)}), sin tocarlos antes.</li>
            <li>${num(R.particiones.purgado.episodios)} chats cuyo resultado cruza una fecha de corte se descartan.</li>
            <li>Misma semilla, mismas variables y mismos chats para los cuatro.</li>
          </ul></div></div>`,
  });

  slide({
    tag: "Técnica de minería", quien: 3, min: 1.2, corto: "Resultados y elección", chico: true,
    titulo: "Los tres rinden parecido; el bosque puntúa mejor y el árbol explica por qué",
    notas: ["Mirar el último grupo de barras: 56 variables sin el largo de texto. Árbol 0,88, bosque 0,88, MLP 0,85: en ranking, parecidos.", "Elegimos el bosque para puntuar porque es mejor en F1, en calibración y en la finura del puntaje: el árbol da solo unos 30 valores distintos y un quinto de los chats empata, algo que no sirve para ordenar una cola.", "El árbol queda al lado para explicar: son 39 reglas de producto que la gerencia puede discutir. Es una aproximación, no es el bosque mismo.", "Combinar modelos y justificar qué aporta cada uno es parte de lo que pide la consigna."],
    html: () => {
      const c = DATOS.complejidad;
      const d = R.diferencias.find((x) => x.grupo === GRUPO && x.a === "bosque" && x.b === "arbol");
      const g = DATOS.modelos.granularidad;
      const mb = R.metricas[GRUPO].bosque, ma = R.metricas[GRUPO].arbol;
      return `<div class="grid cuerpo" style="grid-template-columns:1.05fr .95fr;gap:50px;align-items:start;margin-top:26px">
        <div>${graficoAblacion()}<div class="chico">Calidad del ranking (Average Precision) en octubre. Más alto es mejor.</div><p class="texto" style="margin-top:18px;font-size:27px">Con solo variables operativas y sin el largo de texto, ningún modelo supera al azar. Todo el valor está en qué pide el cliente y qué le ofrece el bot.</p></div>
        <div style="display:grid;gap:22px;align-content:start">
          <div class="hoja"><div class="pregunta">Bosque para puntuar, árbol para explicar</div>
            <ul class="puntos chico" style="margin-top:12px">
              <li>En ranking son parecidos: bosque ${dec(ap(GRUPO, "bosque"), 3)}, árbol ${dec(ap(GRUPO, "arbol"), 3)}, MLP ${dec(ap(GRUPO, "mlp"), 3)} (bosque menos árbol: ${d.diferencia >= 0 ? "+" : ""}${dec(d.diferencia, 3)}, intervalo ${dec(d.ic95_bajo, 3)} a ${dec(d.ic95_alto, 3)}).</li>
              <li>El bosque gana en F1 (${dec(mb.f1, 2)} contra ${dec(ma.f1, 2)}), en ROC-AUC y en calibración (Brier ${dec(mb.brier, 3)} contra ${dec(ma.brier, 3)}).</li>
              <li>Ordena más fino: el árbol da ${g.arbol.distintos} puntajes distintos y el ${pct(g.arbol.mayor_empate)} de los chats empata en el mismo; el bosque da ${num(g.bosque.distintos)}.</li>
              <li>El árbol (${c.arbol.hojas} hojas) explica qué señales de producto pesan. Es una aproximación, no es el bosque.</li>
            </ul></div>
        </div></div>`;
    },
  });

  slide({
    tag: "Conclusión", quien: 4, min: 0.9, corto: "El ranking funciona", chico: true,
    titulo: "El ranking funciona: los chats con puntaje alto son los que más atención reciben",
    notas: ["Izquierda: si el gerente revisa el 10, 20, 30 o 50 % de arriba, cuántos acierta y cuánto cubre. La línea punteada es el azar.", "Derecha: partimos los chats de octubre en cinco tramos por puntaje. El primero termina con una persona 9 de cada 10 veces; el último, casi nunca.", "Es el mismo orden en mensajes humanos y en fotos o documentos enviados por una persona."],
    html: () => `<div class="grid g2 cuerpo" style="gap:50px;margin-top:20px">
        <div><div class="pregunta" style="margin-bottom:6px">Qué pasa si se revisa solo la parte de arriba</div>${graficoTopK()}<div class="chico">Línea punteada: lo que daría el azar.</div></div>
        <div><div class="pregunta" style="margin-bottom:6px">Chats de octubre, partidos en cinco tramos por puntaje</div>${graficoTramos()}<div class="chico">Correlación entre puntaje y mensajes humanos: ${dec(R.tramos[GRUPO + "/bosque"].spearman, 2)} (Spearman).</div></div>
      </div>`,
  });

  slide({
    tag: "Conclusión", quien: 4, min: 0.9, corto: "Más allá de los productos impulsados", chico: true,
    titulo: "Gran parte del resultado es reconocer los productos que la empresa deriva a personas",
    notas: ["Ambos médicos y chalecos son los productos que la empresa impulsa con anuncios y refuerza con atención humana: el 44 % de los chats de octubre, y el 94 % termina con una persona.", "El modelo separa muy bien esos chats del resto, y de ahí viene buena parte del 0,88. Dentro de ese grupo no distingue (ROC-AUC alrededor de 0,5).", "En el resto de los chats, el modelo aporta una mejora moderada: entre 1,6 y 2,5 veces mejor que el azar. Solo hay 84 chats con persona en ese grupo, así que el margen de error es grande.", "Decirlo de frente antes de que lo pregunten."],
    html: () => {
      const s = R.segmentos.bosque, total = s.todos.chats, t = R.top_k_resto;
      const filas = t.map((f) => `<tr><td>${Math.round(f.fraccion * 100)} % (${num(f.chats_revisados)} chats)</td><td>${pct(f.precision)}</td><td>${dec(f.mejora_sobre_azar, 1).replace(",0", "")} veces</td></tr>`).join("");
      return `<div class="grid cuerpo" style="grid-template-columns:1fr 1fr;gap:48px;align-items:start;margin-top:20px">
        <div style="display:grid;gap:22px">
          <div class="hoja" style="border-top:8px solid #cf432c;padding:22px 32px"><div class="pregunta" style="color:#cf432c">Ambos médicos o chalecos</div>
            <div style="display:flex;gap:30px;align-items:baseline;margin-top:6px"><div class="cifra med hilo" style="font-size:84px">${pct(s.impulsados.prevalencia)}</div><div class="texto" style="font-size:26px">de ${num(s.impulsados.chats)} chats (${pct(s.impulsados.chats / total)}) terminan con una persona</div></div>
            <p class="chico" style="margin-top:6px">Dentro de este grupo el modelo no distingue: ROC-AUC ${dec(s.impulsados.roc_auc, 2)} (0,5 es azar).</p></div>
          <div class="hoja" style="border-top:8px solid #1d5c4e;padding:22px 32px"><div class="pregunta">Todo lo demás</div>
            <div style="display:flex;gap:30px;align-items:baseline;margin-top:6px"><div class="cifra med verde" style="font-size:84px">${pct(s.resto.prevalencia)}</div><div class="texto" style="font-size:26px">de ${num(s.resto.chats)} chats (${pct(s.resto.chats / total)}) terminan con una persona</div></div>
            <p class="chico" style="margin-top:6px">Acá el modelo aporta: Average Precision ${dec(s.resto.average_precision, 2)} contra ${dec(s.resto.prevalencia, 2)} del azar, ROC-AUC ${dec(s.resto.roc_auc, 2)}.</p></div>
        </div>
        <div>
          <div class="pregunta" style="margin-bottom:8px">Si se revisan solo los primeros del "resto"</div>
          <table class="tabla" style="font-size:24px"><thead><tr><th>Se revisa</th><th>Con persona</th><th>Contra el azar</th></tr></thead><tbody>${filas}</tbody></table>
          <p class="chico" style="margin-top:12px">Solo hay ${num(s.resto.con_humano)} chats con persona en este grupo: los porcentajes tienen mucho margen de error.</p>
          <div class="cosido" style="margin-top:18px;padding:18px 26px"><span class="texto" style="font-size:25px">El modelo reconoce con claridad los productos que se derivan a personas y, en el resto, mejora moderadamente la prioridad.</span></div>
        </div>
      </div>`;
    },
  });

  slide({
    clase: "app", tag: "Aplicación funcional", quien: 5, min: 1.8, corto: "Probalo", chico: true,
    titulo: "Probalo: armá un chat y mirá qué responden los modelos",
    notas: ["Elegir un ejemplo, mostrar el resultado y cambiar una sola cosa. Aclarar que el número es un puntaje de prioridad (0 a 100), no una probabilidad calibrada.", "El bosque da el puntaje; abajo aparecen las reglas del árbol, que explican qué señales de producto pesan.", "Esto corre en el navegador, sin servidor: los modelos entrenados están dentro de la página."],
    html: () => `<div class="sim">
        <div>
          <div class="bloque-sim"><h5>Ejemplos</h5><div class="ejemplos" id="s-ejemplos">${EJEMPLOS.map((e, i) => `<button type="button" data-i="${i}">${esc(e.nombre)}</button>`).join("")}</div></div>
          <div class="bloque-sim"><h5>Qué pide el cliente</h5><div class="chips" id="s-pide">${FAM.map((id, i) => `<button type="button" class="chip pidio" data-id="${id}" aria-pressed="false">${esc(FAM_NOMBRE[i])}</button>`).join("")}</div></div>
          <div class="bloque-sim"><h5>Qué le ofrece el bot</h5><div class="chips" id="s-ofrece">${FAM.map((id, i) => `<button type="button" class="chip ofrecio" data-id="${id}" aria-pressed="false">${esc(FAM_NOMBRE[i])}</button>`).join("")}</div></div>
          <div class="campos">
            <div class="campo"><label for="s-dia">Día</label><select id="s-dia">${DIAS.map((d, i) => `<option value="${i}">${d}</option>`).join("")}</select></div>
            <div class="campo"><label for="s-hora">Hora</label><select id="s-hora">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, "0")}:00</option>`).join("")}</select></div>
            <div class="campo"><label>Horario de atención</label><div class="derivado" id="s-horario"></div></div>
            <div class="campo"><label for="s-texto">Mensajes de texto del cliente</label><input id="s-texto" type="number" min="0" max="6" step="1"></div>
            <div class="campo"><label for="s-media">Fotos o audios del cliente</label><input id="s-media" type="number" min="0" max="3" step="1"></div>
            <div class="campo"><label for="s-bot">Mensajes del bot</label><input id="s-bot" type="number" min="1" max="5" step="1"></div>
            <div class="campo"><label for="s-seg">Duración hasta la respuesta del bot (s)</label><input id="s-seg" type="number" min="0" max="3600" step="5"></div>
          </div>
        </div>
        <div>
          <h5>Puntaje de prioridad de cada modelo, de 0 a 100 (el corte está en 50)</h5><div class="tarjetas" id="s-tarjetas"></div>
          <div class="porque"><h5>Qué reglas recorre el árbol que explica</h5><ol id="s-porque"></ol></div>
        </div>
      </div>`,
    alEntrar: () => renderSim(),
  });

  slide({
    tag: "Aplicación funcional", quien: 5, min: 0.3, corto: "El árbol que explica", chico: true,
    titulo: "El árbol al lado: 39 reglas que explican qué mira el bosque",
    notas: ["Opcional si falta tiempo. Se puede abrir cualquier rama.", "Resaltado en amarillo: el camino que recorre el chat que armaste en la aplicación.", "Es lo que habilita una conversación con la gerencia: las reglas se pueden discutir y corregir. Aclarar que es una aproximación explicable, con calidad parecida al bosque pero no idéntico."],
    html: () => `<div class="grid cuerpo" style="grid-template-columns:1.3fr .7fr;gap:50px;margin-top:20px">
        <div class="arbol-vista" id="s-arbol"></div>
        <div style="display:grid;gap:24px;align-content:start">
          <div class="cosido"><div class="pregunta">Cómo leerlo</div><p class="texto" style="margin-top:6px;font-size:27px">Cada pregunta divide los chats en dos grupos. La hoja final dice qué porcentaje de esos chats terminó con una persona. Rojo: casi siempre. Verde: casi nunca.</p></div>
          <div class="hoja"><div class="pregunta">Qué es y qué no es</div><p class="texto" style="margin-top:6px;font-size:27px">Rinde parecido al bosque (${dec(ap(GRUPO, "arbol"), 2)} contra ${dec(ap(GRUPO, "bosque"), 2)}), pero no es el mismo modelo: sirve para entender, no para puntuar. ${DATOS.complejidad.arbol.hojas} hojas, ${DATOS.complejidad.arbol.profundidad} niveles como máximo.</p></div>
        </div></div>`,
    alEntrar: () => renderArbol(),
  });

  slide({
    tag: "Conclusión", quien: 4, min: 1.0, corto: "Conclusión", chico: true,
    titulo: "Conclusión: sí se puede ordenar la atención, con límites que conocemos",
    notas: ["Volver a la hipótesis y responderla en una frase.", "Decir los límites antes de que los pregunten: conducta histórica, un mes de prueba, derivaciones por producto.", "Cerrar con los próximos pasos y abrir preguntas."],
    html: () => `<div class="grid g3 cuerpo" style="gap:44px;align-items:start">
        <div class="hoja"><div class="pregunta">Lo que probamos</div><ul class="puntos chico" style="margin-top:12px">
          <li>Qué pide el cliente y qué ofrece el bot predicen dónde interviene una persona: ${dec(ap(GRUPO, "bosque"))} contra ${dec(ap("operativas_sin_largo", "bosque"))} sin esa información.</li>
          <li>Revisar el 20 % de arriba acierta ${Math.round(top20().precision * 100)} de cada 100 y cubre el ${Math.round(top20().cobertura * 100)} % de los chats atendidos.</li>
          <li>El bosque puntúa los chats y un árbol de ${DATOS.complejidad.arbol.hojas} hojas explica qué señales de producto pesan.</li></ul></div>
        <div class="hoja"><div class="pregunta" style="color:#cf432c">Lo que no afirmamos</div><ul class="puntos hilo chico" style="margin-top:12px">
          <li>Que esos chats necesitaran a una persona: medimos conducta histórica.</li>
          <li>Que el modelo ayude mucho con ambos y chalecos: ahí casi todos van a una persona.</li>
          <li>Efecto sobre las ventas: no hay etiqueta de venta.</li>
          <li>Estabilidad futura: un solo mes de prueba, y las campañas cambian.</li></ul></div>
        <div class="hoja"><div class="pregunta">Próximos pasos</div><ul class="puntos chico" style="margin-top:12px">
          <li>Validar una muestra de chats con el gerente.</li>
          <li>Confirmar con Hitelac si algunas familias se derivan por regla.</li>
          <li>Recalibrar los puntajes y definir con el equipo cuándo un chat es prioridad alta.</li>
          <li>Sumar una etiqueta de venta para medir impacto.</li></ul></div>
      </div>
      <p class="sub" style="margin-top:44px;max-width:1500px;color:var(--tinta);font-weight:600">Con lo que el bot ya respondió, se puede ordenar la atención humana mucho mejor que al azar.</p>`,
  });

  slide({
    clase: "equipo", tag: "Equipo y preguntas", quien: null, min: 0.3, corto: "Equipo y preguntas",
    titulo: "Quién presentó qué, y dónde está cada parte de la consigna",
    notas: ["Cada integrante presentó su área. Editar los nombres antes de la defensa (se guardan en este navegador).", "Abrir preguntas."],
    chico: true,
    html: () => {
      const cubre = [["Dominio y problema", "cómo viaja un chat y valor para el negocio"], ["Arquitectura de la solución", "recorrido de los datos, de la fuente al puntaje"], ["Análisis exploratorio", "qué hay, qué falta y qué llamó la atención"], ["Técnica de minería", "cuatro modelos: el bosque puntúa y el árbol explica"], ["Conclusión", "visualización, hipótesis respondida y límites"], ["Aplicación funcional", "esta misma página: los modelos corren acá"]];
      return `<div class="grid cuerpo" style="grid-template-columns:1.1fr .9fr;gap:70px;margin-top:30px">
        <div>${EQUIPO.map((e, i) => `<div class="rol-fila"><span class="disp" style="font-family:var(--display);font-variation-settings:'wdth' 82,'wght' 700;color:var(--tinta-3)">${i + 1}</span><span class="rol">${esc(e.rol)}</span><span class="fuerte" contenteditable="true" spellcheck="false" data-edit="${i}" role="textbox" aria-label="Nombre de ${esc(e.rol)}">${esc(e.nombre)}</span></div>`).join("")}</div>
        <div class="cosido"><div class="pregunta">Los seis entregables de la consigna</div><ul class="puntos chico" style="margin-top:14px">${cubre.map(([a, b]) => `<li><b>${a}:</b> ${b}.</li>`).join("")}</ul></div>
      </div>`;
    },
  });

  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Métricas completas", chico: true,
    titulo: "Anexo: métricas completas de los cuatro modelos",
    notas: ["Material de respaldo para preguntas."],
    html: () => {
      const f = (m) => R.metricas[GRUPO][m];
      const fila = (m) => `<tr${m === "bosque" ? ' class="mejor"' : ""}><td>${NOMBRE[m]}</td><td>${dec(f(m).ap, 3)} (${dec(f(m).ic_bajo, 3)}–${dec(f(m).ic_alto, 3)})</td><td>${dec(f(m).roc, 3)}</td><td>${dec(f(m).precision, 3)}</td><td>${dec(f(m).recall, 3)}</td><td>${dec(f(m).f1, 3)}</td><td>${dec(f(m).brier, 3)}</td></tr>`;
      return `<div class="cuerpo" style="margin-top:34px"><table class="tabla"><thead><tr><th>56 variables, octubre</th><th>Average Precision (IC 95 %)</th><th>ROC-AUC</th><th>Precision</th><th>Recall</th><th>F1</th><th>Brier</th></tr></thead><tbody>${["dummy", "arbol", "bosque", "mlp"].map(fila).join("")}</tbody></table>
      <p class="chico" style="margin-top:18px">Precision, recall y F1 con umbral 0,5. Intervalos que remuestrean contactos completos (1.000 repeticiones). El Dummy marca todo como "con persona", por eso recall 1 y precision igual a la proporción.</p></div>`;
    },
  });

  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Controles", chico: true,
    titulo: "Anexo: cómo evitamos las trampas del modelado",
    notas: ["Respaldo: preguntas sobre fugas de información y validez."],
    html: () => `<div class="grid g2 cuerpo" style="gap:70px;margin-top:30px">
        <ul class="puntos"><li>Las variables usan solo mensajes anteriores a la respuesta del bot, más esa respuesta.</li><li>Corte por fecha, sin mezclar meses. Se descartan ${num(R.particiones.purgado.episodios)} chats que cruzan una frontera.</li><li>Hiperparámetros elegidos solo con septiembre. Octubre no se usó para elegir nada.</li><li>Hashes de las bases verificados contra su manifiesto antes de cada corrida.</li></ul>
        <ul class="puntos hilo"><li>Octubre ya había sido inspeccionado en trabajo previo: es una prueba retrospectiva, no virgen.</li><li>No hay historial de ediciones de los textos: no se puede certificar ausencia total de fugas.</li><li>Los datos son seudonimizados, no anónimos.</li><li>El largo del texto se excluyó por ser un atajo frágil (ver análisis exploratorio).</li></ul>
      </div>`,
  });

  slide({
    anexo: true, tag: "Anexo", quien: null, min: 0, corto: "Variables del protocolo", chico: true,
    titulo: "Anexo: qué pasa con las 58 variables del protocolo",
    notas: ["Respaldo: el protocolo del equipo fija 58 variables. Las 56 son un análisis adicional."],
    html: () => {
      const g = (gr, m) => dec(ap(gr, m), 3);
      const tabla = [["10 operativas", "operativas"], ["9 operativas, sin largo de texto", "operativas_sin_largo"], ["58 variables (protocolo)", "completo"], ["56 variables, sin largo de texto", "completo_sin_largo"]];
      return `<div class="grid g2 cuerpo" style="gap:50px;margin-top:30px;align-items:start">
        <div><table class="tabla"><thead><tr><th>Average Precision, octubre</th><th>Árbol</th><th>Bosque</th><th>MLP</th></tr></thead><tbody>${tabla.map(([n, k]) => `<tr${k === GRUPO ? ' class="mejor"' : ""}><td>${n}</td><td>${g(k, "arbol")}</td><td>${g(k, "bosque")}</td><td>${g(k, "mlp")}</td></tr>`).join("")}</tbody></table></div>
        <div><div class="pregunta" style="margin-bottom:6px">Qué bloque de variables pesa más (bosque, 56 variables)</div>${graficoBloques()}</div></div>`;
    },
  });

  /* ---------- armado ---------- */
  const cont = document.getElementById("slides");
  const MINUTOS_TOTAL = 15;
  let actual = 0;

  SLIDES.forEach((s, i) => {
    const el = document.createElement("section");
    el.className = "slide" + (s.clase ? " " + s.clase : "");
    el.dataset.i = i;
    el.innerHTML = etiquetaHTML(s.tag, s.quien) + (s.titulo ? `<h2 class="titulo${s.chico ? " medio" : ""}">${esc(s.titulo)}</h2>` : "") + s.html();
    cont.appendChild(el);
  });
  const nodos = Array.from(document.querySelectorAll(".slide"));
  let acumulado = 0;
  const inicios = SLIDES.map((s) => { const v = acumulado; if (!s.anexo) acumulado += s.min; return v; });
  const totalPlan = acumulado;

  function ir(n) {
    n = Math.max(0, Math.min(SLIDES.length - 1, n));
    actual = n;
    nodos.forEach((el, i) => el.classList.toggle("activa", i === n));
    if (SLIDES[n].alEntrar) SLIDES[n].alEntrar();
    pintarPasos();
    renderNotas();
    try { history.replaceState(null, "", "#" + (n + 1)); } catch (e) { /* ignorar */ }
  }

  /* ---------- cinta métrica ---------- */
  const cinta = document.getElementById("cinta");
  const X0 = 96, POR_MIN = 114;
  const xDe = (min) => X0 + min * POR_MIN;
  let tiempo = { corriendo: false, seg: 0, ultimo: 0 };
  function armarCinta() {
    let s = `<svg viewBox="0 0 1920 104" preserveAspectRatio="none">`;
    for (let q = 0; q <= MINUTOS_TOTAL * 4; q++) {
      const x = xDe(q / 4), alto = q % 4 === 0 ? 38 : q % 2 === 0 ? 26 : 16;
      s += `<line class="tick" x1="${x}" x2="${x}" y1="3" y2="${3 + alto}"/>`;
      if (q % 4 === 0) s += `<text class="num" x="${x}" y="${3 + 38 + 30}" text-anchor="middle">${q / 4}</text>`;
    }
    SLIDES.forEach((sl, i) => {
      if (sl.anexo) return;
      const x = xDe(inicios[i] * (MINUTOS_TOTAL / totalPlan));
      s += `<g class="paso" data-i="${i}" tabindex="0" role="button" aria-label="Ir a ${esc(sl.corto)}"><title>${esc(sl.corto)}</title><rect x="${x - 15}" y="68" width="30" height="36" fill="transparent"/><polygon points="${x - 11},104 ${x + 11},104 ${x},82"/></g>`;
    });
    s += `<g class="clip" id="clip" transform="translate(${xDe(0)},0)"><line x1="0" x2="0" y1="-16" y2="104"/><rect x="-46" y="-52" width="92" height="38" rx="4"/><text x="0" y="-24" text-anchor="middle" id="clip-t">0:00</text></g></svg>`;
    cinta.innerHTML = s;
    cinta.querySelectorAll(".paso").forEach((g) => {
      g.addEventListener("click", () => ir(Number(g.dataset.i)));
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(Number(g.dataset.i)); } });
    });
  }
  function pintarPasos() {
    cinta.querySelectorAll(".paso").forEach((g) => g.classList.toggle("actual", Number(g.dataset.i) === actual));
  }
  function pintarClip() {
    const min = tiempo.seg / 60;
    const x = xDe(Math.min(min, MINUTOS_TOTAL + 0.4));
    document.getElementById("clip").setAttribute("transform", `translate(${x},0)`);
    const m = Math.floor(tiempo.seg / 60), s = Math.floor(tiempo.seg % 60);
    document.getElementById("clip-t").textContent = m + ":" + String(s).padStart(2, "0");
    cinta.classList.toggle("pasado", min > MINUTOS_TOTAL);
  }
  setInterval(() => {
    if (!tiempo.corriendo) return;
    const ahora = performance.now();
    tiempo.seg += (ahora - tiempo.ultimo) / 1000;
    tiempo.ultimo = ahora;
    pintarClip();
  }, 250);
  function alternarTimer() {
    tiempo.corriendo = !tiempo.corriendo;
    tiempo.ultimo = performance.now();
    const b = document.getElementById("b-timer");
    b.textContent = tiempo.corriendo ? "Pausar cronómetro" : (tiempo.seg > 0 ? "Seguir cronómetro" : "Iniciar cronómetro");
    b.classList.toggle("on", tiempo.corriendo);
  }
  function reiniciarTimer() { tiempo = { corriendo: false, seg: 0, ultimo: 0 }; document.getElementById("b-timer").textContent = "Iniciar cronómetro"; document.getElementById("b-timer").classList.remove("on"); pintarClip(); }

  /* ---------- notas y vista general ---------- */
  const panelNotas = document.getElementById("notas");
  const vista = document.getElementById("vista");
  function renderNotas() {
    const s = SLIDES[actual];
    panelNotas.innerHTML = `<h3>${esc(s.corto)}</h3><div class="meta">${s.anexo ? "Anexo, sin tiempo asignado" : "Tiempo sugerido: " + (s.min * 60 >= 60 ? num(s.min, 1) + " min" : Math.round(s.min * 60) + " s")}${s.quien !== null && s.quien !== undefined ? " · Presenta " + esc(EQUIPO[s.quien].nombre) : ""}</div><ul>${s.notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><p style="margin-top:26px;color:#f2c230">Plan total: ${num(totalPlan, 1)} min de ${MINUTOS_TOTAL}.</p>`;
  }
  function renderVista() {
    const normales = SLIDES.map((s, i) => ({ s, i })).filter((x) => !x.s.anexo);
    const anexos = SLIDES.map((s, i) => ({ s, i })).filter((x) => x.s.anexo);
    const boton = ({ s, i }) => `<button type="button" data-i="${i}" class="${i === actual ? "actual" : ""}"><b>${esc(s.corto)}</b><span>${esc(s.tag)}${s.anexo ? "" : " · " + num(s.min, 1) + " min"}</span></button>`;
    vista.innerHTML = `<h3>Vista general</h3><div class="rejilla-v">${normales.map(boton).join("")}</div><div class="anexos">Anexos para preguntas</div><div class="rejilla-v">${anexos.map(boton).join("")}</div>`;
    vista.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { vista.hidden = true; ir(Number(b.dataset.i)); }));
  }
  const alternar = (el, id) => { el.hidden = !el.hidden; document.getElementById(id).classList.toggle("on", !el.hidden); };
  document.getElementById("b-timer").addEventListener("click", alternarTimer);
  document.getElementById("b-notas").addEventListener("click", () => alternar(panelNotas, "b-notas"));
  document.getElementById("b-vista").addEventListener("click", () => { renderVista(); alternar(vista, "b-vista"); });
  const pantalla = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); };
  document.getElementById("b-pantalla").addEventListener("click", pantalla);

  /* ---------- simulador: eventos y render ---------- */
  let simListo = false;
  function enlazarSim() {
    if (simListo) return;
    simListo = true;
    const marcar = (cont, clave) => document.querySelectorAll(cont + " .chip").forEach((b) => {
      b.addEventListener("click", () => { const id = b.dataset.id; const c = sim[clave]; if (c.has(id)) c.delete(id); else c.add(id); renderSim(); });
    });
    marcar("#s-pide", "pide");
    marcar("#s-ofrece", "ofrece");
    document.querySelectorAll("#s-ejemplos button").forEach((b) => b.addEventListener("click", () => {
      const e = EJEMPLOS[Number(b.dataset.i)];
      sim.pide = new Set(e.pide); sim.ofrece = new Set(e.ofrece); sim.dia = 1; sim.hora = 15; sim.texto = 1; sim.media = 0; sim.bot = 1; sim.seg = 12;
      renderSim();
    }));
    const campo = (id, clave, min, max) => document.getElementById(id).addEventListener("input", (ev) => {
      const v = Number(ev.target.value);
      if (!Number.isFinite(v)) return;
      sim[clave] = Math.max(min, Math.min(max, Math.round(v)));
      renderSim();
    });
    campo("s-dia", "dia", 0, 6); campo("s-hora", "hora", 0, 23); campo("s-texto", "texto", 0, 6); campo("s-media", "media", 0, 3); campo("s-bot", "bot", 1, 5); campo("s-seg", "seg", 0, 3600);
  }
  function renderSim() {
    enlazarSim();
    document.querySelectorAll("#s-pide .chip").forEach((b) => { const on = sim.pide.has(b.dataset.id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    document.querySelectorAll("#s-ofrece .chip").forEach((b) => { const on = sim.ofrece.has(b.dataset.id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    const set = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v; };
    set("s-dia", sim.dia); set("s-hora", sim.hora); set("s-texto", sim.texto); set("s-media", sim.media); set("s-bot", sim.bot); set("s-seg", sim.seg);
    document.getElementById("s-horario").textContent = enHorario(sim.dia, sim.hora) ? "Sí" : "No";
    const x = vectorDe(sim);
    const p = motor.predecirTodos(M, x);
    const camino = motor.caminoArbol(M.arbol, x);
    const votos = motor.votosBosque(M.bosque, x);
    const tarjeta = (id, extra, sub) => {
      const v = p[id];
      return `<div class="modelo ${id}"><div class="nombre"><span>${NOMBRE[id]}</span><small>${sub}</small></div><div class="prob">${Math.round(v * 100)}</div><div class="barra"><i style="width:${v * 100}%"></i></div><div class="veredicto ${v >= 0.5 ? "si" : "no"}">${v >= 0.5 ? "Sobre el corte de 50" : "Bajo el corte de 50"}</div><div class="extra">${extra}</div></div>`;
    };
    const pos = (id) => {
      if (id === "dummy") return "No mira el chat: repite lo que vio";
      const sobre = 100 - motor.posicionEnRanking(M.cuantiles_test[id], p[id]);
      return sobre <= 0 ? "Más bajo que casi todo octubre" : "Más alto que el " + sobre + " % de octubre";
    };
    document.getElementById("s-tarjetas").innerHTML =
      tarjeta("bosque", votos + " de " + M.bosque.length + " árboles votan por persona", "el que puntúa · " + M.bosque.length + " árboles") +
      tarjeta("arbol", pos("arbol"), "el que explica · " + DATOS.complejidad.arbol.hojas + " hojas") +
      tarjeta("mlp", pos("mlp"), "red de 64 y 32 neuronas") +
      tarjeta("dummy", pos("dummy"), "piso de comparación");
    document.getElementById("s-porque").innerHTML = camino.pasos.length
      ? camino.pasos.map((paso) => `<li><b>${esc(reglaTexto(paso))}</b></li>`).join("") + `<li>Resultado: ${pct(camino.probabilidad)} de los ${num(camino.muestras)} chats parecidos terminaron con una persona.</li>`
      : "<li>El árbol no hizo ninguna pregunta.</li>";
  }
  function renderArbol() {
    const x = vectorDe(sim);
    document.getElementById("s-arbol").innerHTML = arbolHTML(motor.caminoArbol(M.arbol, x));
  }

  /* ---------- edición de nombres ---------- */
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.edit !== undefined) {
      const i = Number(t.dataset.edit);
      EQUIPO[i].nombre = t.textContent.trim() || "Integrante " + (i + 1);
      guardarEquipo();
      document.querySelectorAll('[data-quien="' + i + '"]').forEach((el) => { el.textContent = EQUIPO[i].nombre; });
    }
  });

  /* ---------- teclado y escala ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.target && (e.target.isContentEditable || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " ") { e.preventDefault(); ir(actual + 1); }
    else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); ir(actual - 1); }
    else if (k === "Home") ir(0);
    else if (k === "End") ir(SLIDES.length - 1);
    else if (k === "t" || k === "T") alternarTimer();
    else if (k === "r" || k === "R") reiniciarTimer();
    else if (k === "n" || k === "N") alternar(panelNotas, "b-notas");
    else if (k === "g" || k === "G") { renderVista(); alternar(vista, "b-vista"); }
    else if (k === "f" || k === "F") pantalla();
    else if (k === "Escape") { panelNotas.hidden = true; vista.hidden = true; document.getElementById("b-notas").classList.remove("on"); document.getElementById("b-vista").classList.remove("on"); }
  });
  const escenario = document.getElementById("escenario");
  function escalar() {
    const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    escenario.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener("resize", escalar);
  escalar();

  armarCinta();
  pintarClip();
  const inicial = parseInt((location.hash || "").replace("#", ""), 10);
  ir(Number.isFinite(inicial) ? inicial - 1 : 0);
})();
