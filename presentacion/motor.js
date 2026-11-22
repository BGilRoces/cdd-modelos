(function (raiz) {
  function predecirArbol(a, x) {
    let i = 0;
    while (a.f[i] >= 0) i = x[a.f[i]] <= a.t[i] ? a.l[i] : a.r[i];
    return a.p[i];
  }

  function caminoArbol(a, x) {
    const pasos = [];
    let i = 0;
    while (a.f[i] >= 0) {
      const izquierda = x[a.f[i]] <= a.t[i];
      pasos.push({ nodo: i, variable: a.f[i], umbral: a.t[i], izquierda });
      i = izquierda ? a.l[i] : a.r[i];
    }
    return { pasos, hoja: i, probabilidad: a.pn ? a.pn[i] : a.p[i], muestras: a.n ? a.n[i] : null };
  }

  function predecirBosque(arboles, x) {
    let suma = 0;
    for (const a of arboles) suma += predecirArbol(a, x);
    return suma / arboles.length;
  }

  function votosBosque(arboles, x) {
    let votos = 0;
    for (const a of arboles) if (predecirArbol(a, x) >= 0.5) votos += 1;
    return votos;
  }

  function predecirMLP(m, x) {
    let h = x.map((v, i) => (v - m.media[i]) / m.escala[i]);
    const capas = m.pesos.length;
    for (let c = 0; c < capas; c++) {
      const w = m.pesos[c], b = m.sesgos[c];
      const salida = new Array(b.length);
      for (let j = 0; j < b.length; j++) {
        let s = b[j];
        for (let i = 0; i < h.length; i++) s += h[i] * w[i][j];
        salida[j] = c < capas - 1 ? Math.max(0, s) : s;
      }
      h = salida;
    }
    return 1 / (1 + Math.exp(-h[0]));
  }

  // Proporción de chats de octubre con un puntaje mayor: "está entre el X % de arriba".
  function posicionEnRanking(cuantiles, p) {
    let menores = 0;
    for (let i = 0; i < cuantiles.length; i++) if (cuantiles[i] < p) menores = i;
    if (p > cuantiles[cuantiles.length - 1]) menores = 100;
    return Math.max(1, 100 - menores);
  }

  function predecirTodos(modelos, x) {
    return {
      dummy: modelos.dummy.p,
      arbol: predecirArbol(modelos.arbol, x),
      bosque: predecirBosque(modelos.bosque, x),
      mlp: predecirMLP(modelos.mlp, x),
    };
  }

  raiz.motor = { predecirArbol, caminoArbol, predecirBosque, votosBosque, predecirMLP, posicionEnRanking, predecirTodos };
  if (typeof module !== "undefined" && module.exports) module.exports = raiz.motor;
})(typeof window !== "undefined" ? window : globalThis);
