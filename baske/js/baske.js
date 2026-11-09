(function () {
    'use strict';

    // Núcleo de FRAN-BASKET, expuesto como window.Baske.
    // Necesita cargados antes: /fiesta-config.js y supabase-js (UMD).
    //
    // Todo lo que se lee de la base de datos pasa por aquí: sesión, cabecera,
    // carga de tablas y los cálculos que comparten varias páginas (temporadas,
    // asistencia, deudas, votos...).

    var BASE = new URL('../', document.currentScript.src).href; // .../baske/
    var DOMINIO_EMAIL = 'fran-basket.invalid';

    var cliente = window.supabase.createClient(FIESTA_SUPABASE_URL, FIESTA_SUPABASE_ANON_KEY, {
        db: { schema: 'equipo' },
        auth: { storageKey: 'fran-basket-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    // ------------------------------------------------------------------
    // Textos y formatos
    // ------------------------------------------------------------------
    function esc(valor) {
        return String(valor == null ? '' : valor)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var CARGOS = {
        lider_supremo: 'Líder Supremo',
        maestro_balon: 'Maestro del Balón',
        maestro_gritos: 'Maestro de los Gritos',
        mano_lider: 'Mano del Líder',
        maestro_maestros: 'Maestro de Maestros',
        tesorero: 'Tesorero'
    };
    var TIPOS = { jugador: 'Jugador', staff: 'Staff', aficionado: 'Aficionado' };
    var ORIGENES = { fundador: 'Fundador', traido: 'Traído', aparecido: 'Aparecido' };
    var RECARGO_NO_APUNTADO = 1.5; // +50 % por jugar una pachanga de reserva sin estar apuntado
    var PISTAS = { media: 'Media pista', completa: 'Pista completa' };
    var PERIODOS = ['Sep-Oct', 'Nov-Dic', 'Ene-Feb', 'Mar-Abr', 'May-Jun', 'Jul-Ago'];

    function etiquetaCargo(nombre) {
        if (CARGOS[nombre]) return CARGOS[nombre];
        var t = String(nombre || '').replace(/_/g, ' ');
        return t.charAt(0).toUpperCase() + t.slice(1);
    }

    // Fechas como texto 'YYYY-MM-DD' (así llegan de Postgres). Se comparan como texto.
    var fmtCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    var fmtLarga = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    var fmtMesAnio = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    var fmtEuro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

    function aFecha(texto) { return new Date(String(texto).slice(0, 10) + 'T00:00:00Z'); }
    function fecha(texto) { return texto ? fmtCorta.format(aFecha(texto)) : '—'; }
    function fechaLarga(texto) { return texto ? fmtLarga.format(aFecha(texto)) : '—'; }
    function mesAnio(texto) {
        var t = fmtMesAnio.format(aFecha(texto));
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    function euros(n) { return fmtEuro.format(Number(n) || 0); }

    // Tiempo desde una fecha hasta hoy: "hace 3 meses", "hace 1 año y 2 meses"
    function hace(texto) {
        if (!texto) return '';
        var a = aFecha(texto), b = aFecha(hoy());
        var meses = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
        if (b.getUTCDate() < a.getUTCDate()) meses--;
        if (meses < 1) {
            var dias = Math.round((b - a) / 86400000);
            return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace ' + dias + ' días';
        }
        var anios = Math.floor(meses / 12), resto = meses % 12;
        var partes = [];
        if (anios) partes.push(anios + (anios === 1 ? ' año' : ' años'));
        if (resto) partes.push(resto + (resto === 1 ? ' mes' : ' meses'));
        return 'hace ' + partes.join(' y ');
    }

    function ahoraMadrid() {
        // 'YYYY-MM-DD HH:MM:SS' en hora de Madrid ('sv-SE' da ese formato)
        return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
    }
    function hoy() { return ahoraMadrid().slice(0, 10); }

    function sumarDias(texto, dias) {
        var d = aFecha(texto);
        d.setUTCDate(d.getUTCDate() + dias);
        return d.toISOString().slice(0, 10);
    }

    // Temporada: 1 sep - 31 ago, '2025-26'
    function temporadaDe(texto) {
        var anio = Number(texto.slice(0, 4));
        var mes = Number(texto.slice(5, 7));
        var inicio = mes >= 9 ? anio : anio - 1;
        return inicio + '-' + String((inicio + 1) % 100).padStart(2, '0');
    }
    // Periodo bimestral: 1 Sep-Oct ... 6 Jul-Ago
    function periodoDe(texto) {
        var mes = Number(texto.slice(5, 7));
        return Math.floor(((mes - 9 + 12) % 12) / 2) + 1;
    }
    function etiquetaPeriodo(p) { return PERIODOS[p - 1] || ''; }
    function temporadaActual() { return temporadaDe(hoy()); }
    function periodoActual() { return periodoDe(hoy()); }

    // Votación: día de la pachanga 19:30 -> dos días después 23:59 (Madrid)
    function ventanaVoto(fechaPachanga) {
        var empieza = fechaPachanga + ' 19:30';
        var termina = sumarDias(fechaPachanga, 2) + ' 23:59';
        var ahora = ahoraMadrid().slice(0, 16);
        return {
            empieza: empieza,
            termina: termina,
            estado: ahora < empieza ? 'pronto' : (ahora > termina ? 'cerrada' : 'abierta')
        };
    }

    function traducirError(e) {
        var msg = (e && (e.message || e.error_description || e.error)) || String(e);
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.';
        if (/Invalid login credentials/i.test(msg)) return 'Contraseña incorrecta.';
        if (/JWT expired/i.test(msg)) return 'La sesión ha caducado: vuelve a entrar.';
        if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para hacer esto.';
        if (/duplicate key/i.test(msg)) return traducirDuplicado(msg, (e && e.details) || '');
        return msg;
    }

    // "duplicate key value violates unique constraint X" + details "Key (campo)=(valor) already exists."
    // -> dice qué campo y qué valor chocan
    var DUPLICADOS = {
        ux_miembro_dorsal_azul: 'El dorsal azul {v} ya lo tiene otro miembro activo.',
        ux_miembro_dorsal_negro: 'El dorsal negro {v} ya lo tiene otro miembro activo.',
        uq_miembro_n_socio: 'El número de socio {v} ya está asignado.',
        miembro_id_usuario_key: 'Ese login ya está vinculado a otro miembro.',
        usuario_usuario_key: 'Ese nombre de usuario ya existe.',
        jugador_id_miembro_key: 'Ese miembro ya tiene su ficha de jugador.',
        jugador_id_invitado_key: 'Ese invitado ya está vinculado a otro jugador.',
        uq_premio_miembro_periodo: 'Ese premio ya está asignado en ese periodo.',
        premio_nombre_premio_key: 'Ya existe un premio llamado {v}.',
        cargo_nombre_key: 'Ya existe un cargo llamado {v}.'
    };
    var CAMPOS = {
        dorsal_azul: 'dorsal azul', dorsal_negro: 'dorsal negro', n_socio: 'número de socio', id_usuario: 'login',
        usuario: 'nombre de usuario', nombre_premio: 'nombre del premio', nombre: 'nombre'
    };
    function traducirDuplicado(msg, details) {
        var restriccion = (/unique constraint "([^"]+)"/i.exec(msg) || [])[1] || '';
        var clave = /Key \(([^)]+)\)=\((.*)\) already exists/i.exec(details);
        var valor = clave ? '"' + clave[2] + '"' : '';
        if (DUPLICADOS[restriccion]) return DUPLICADOS[restriccion].replace('{v}', valor).replace('  ', ' ');
        if (clave) {
            var campos = clave[1].split(',').map(function (c) { c = c.trim(); return CAMPOS[c] || c; }).join(' + ');
            return 'Ya existe un registro con el mismo ' + campos + ' (' + clave[2] + ').';
        }
        return 'Ya existe un registro igual' + (restriccion ? ' (' + restriccion + ').' : '.');
    }

    function mensaje(el, texto, tipo) {
        if (!el) return;
        el.textContent = texto || '';
        el.className = 'bk-mensaje' + (texto ? ' bk-mensaje--' + (tipo || 'error') : '');
    }

    function param(nombre) { return new URLSearchParams(location.search).get(nombre); }

    function url(ruta) { return BASE + ruta; }

    // ------------------------------------------------------------------
    // Carga de tablas (con paginación: Supabase devuelve como mucho 1000 filas)
    // ------------------------------------------------------------------
    var ORDEN = {
        pachanga_jugador: ['id_pachanga', 'id_jugador'],
        reserva_jugador: ['id_reserva', 'id_jugador'],
        entrenamiento_jugador: ['id_entrenamiento', 'id_jugador'],
        jugador_equipo: ['id_equipo', 'id_jugador'],
        top_pachanga: ['id_pachanga', 'id_jugador'],
        v_resultado_top_pachanga: ['id_pachanga', 'id_jugador']
    };
    var cache = {};

    async function paginar(tabla) {
        var filas = [];
        var paso = 1000;
        for (var desde = 0; ; desde += paso) {
            var consulta = cliente.from(tabla).select('*');
            (ORDEN[tabla] || ['id']).forEach(function (c) { consulta = consulta.order(c); });
            var r = await consulta.range(desde, desde + paso - 1);
            if (r.error) throw r.error;
            filas = filas.concat(r.data);
            if (r.data.length < paso) return filas;
        }
    }

    function cargarTabla(tabla) {
        if (!cache[tabla]) {
            cache[tabla] = paginar(tabla).catch(function (e) { delete cache[tabla]; throw e; });
        }
        return cache[tabla];
    }

    async function cargar(tablas) {
        var res = await Promise.all(tablas.map(cargarTabla));
        var d = {};
        tablas.forEach(function (t, i) { d[t] = res[i]; });
        return d;
    }

    function olvidar() {
        if (arguments.length === 0) { cache = {}; return; }
        for (var i = 0; i < arguments.length; i++) delete cache[arguments[i]];
    }

    // Tablas que necesita el Modelo completo
    var TABLAS_BASE = ['miembro', 'jugador', 'invitado', 'pachanga', 'pachanga_jugador', 'apodo', 'habilidad_especial'];
    var TABLAS_DEUDA = ['reserva_periodica', 'reserva_jugador', 'entrenamiento', 'entrenamiento_jugador', 'cobro'];
    var TABLAS_PREMIOS = ['premio', 'premio_miembro'];
    var TABLAS_JUNTA = ['cargo', 'junta_directiva'];

    // ------------------------------------------------------------------
    // Modelo: índices y cálculos sobre las tablas cargadas
    // ------------------------------------------------------------------
    function indexar(filas, clave) {
        var m = new Map();
        (filas || []).forEach(function (f) { m.set(f[clave], f); });
        return m;
    }
    function agrupar(filas, clave) {
        var m = new Map();
        (filas || []).forEach(function (f) {
            if (!m.has(f[clave])) m.set(f[clave], []);
            m.get(f[clave]).push(f);
        });
        return m;
    }

    function Modelo(d) {
        var self = this;
        this.d = d;
        this.hoy = hoy();
        this.temporadaActual = temporadaDe(this.hoy);

        this.miembros = d.miembro || [];
        this.miembro = indexar(this.miembros, 'id');
        this.jugador = indexar(d.jugador, 'id');
        this.invitado = indexar(d.invitado, 'id');
        this.jugadorDeMiembro = new Map();
        (d.jugador || []).forEach(function (j) { if (j.id_miembro) self.jugadorDeMiembro.set(j.id_miembro, j.id); });

        this.pachangas = (d.pachanga || []).map(function (p) {
            return Object.assign({}, p, {
                temporada: temporadaDe(p.fecha),
                periodo: periodoDe(p.fecha),
                jugada: p.fecha <= self.hoy,
                asistentes: [],
                cerveceros: [],
                espectadores: []   // vinieron a ver sin jugar
            });
        }).sort(function (a, b) { return a.fecha === b.fecha ? b.id - a.id : (a.fecha < b.fecha ? 1 : -1); });
        this.pachanga = indexar(this.pachangas, 'id');

        this.pjDeJugador = new Map();
        (d.pachanga_jugador || []).forEach(function (pj) {
            var p = self.pachanga.get(pj.id_pachanga);
            if (!p) return;
            if (pj.jugado) p.asistentes.push(pj.id_jugador);
            if (pj.cerveza) p.cerveceros.push(pj.id_jugador);
            if (pj.vio && !pj.jugado) p.espectadores.push(pj.id_jugador);
            if (!self.pjDeJugador.has(pj.id_jugador)) self.pjDeJugador.set(pj.id_jugador, []);
            self.pjDeJugador.get(pj.id_jugador).push(pj);
        });

        function validados(filas, campo) {
            var m = new Map();
            (filas || []).forEach(function (f) {
                if (!f.validado) return;
                if (!m.has(f.id_miembro)) m.set(f.id_miembro, []);
                m.get(f.id_miembro).push(f[campo]);
            });
            return m;
        }
        this.apodos = validados(d.apodo, 'apodo');
        this.habilidades = validados(d.habilidad_especial, 'habilidad');

        this.cargo = indexar(d.cargo, 'id');
        this.premio = indexar(d.premio, 'id');
        this._deudas = null;
    }

    Modelo.prototype.nombreMiembro = function (m) {
        if (typeof m !== 'object') m = this.miembro.get(m);
        if (!m) return '—';
        return m.nombre + (m.apellido ? ' ' + m.apellido : '');
    };

    Modelo.prototype.miembroDeJugador = function (idJugador) {
        var j = this.jugador.get(idJugador);
        return j && j.id_miembro ? this.miembro.get(j.id_miembro) : null;
    };

    Modelo.prototype.esInvitado = function (idJugador) {
        var j = this.jugador.get(idJugador);
        return !!(j && !j.id_miembro);
    };

    Modelo.prototype.nombreJugador = function (idJugador) {
        var j = this.jugador.get(idJugador);
        if (!j) return '—';
        if (j.id_miembro) return this.nombreMiembro(j.id_miembro);
        var inv = this.invitado.get(j.id_invitado);
        return inv ? inv.nombre : 'Invitado';
    };

    Modelo.prototype.padrinoDeInvitado = function (idJugador) {
        var j = this.jugador.get(idJugador);
        var inv = j && this.invitado.get(j.id_invitado);
        return inv && inv.id_padrino ? this.nombreMiembro(inv.id_padrino) : null;
    };

    Modelo.prototype.apodo = function (idMiembro) { return (this.apodos.get(idMiembro) || []).join(', '); };
    Modelo.prototype.habilidad = function (idMiembro) { return (this.habilidades.get(idMiembro) || []).join(', '); };

    // Temporadas con pachangas, de la más nueva a la más antigua (siempre incluye la actual)
    Modelo.prototype.temporadas = function () {
        var set = new Set([this.temporadaActual]);
        this.pachangas.forEach(function (p) { set.add(p.temporada); });
        return Array.from(set).sort().reverse();
    };

    // temporadas: Set de temporadas o null = todas
    Modelo.prototype.asistencia = function (idJugador, temporadas) {
        var self = this;
        var r = { jugadas: 0, cervezas: 0, vistas: 0, ultimaPachanga: null, ultimaCerveza: null, ultimaVista: null };
        (this.pjDeJugador.get(idJugador) || []).forEach(function (pj) {
            var p = self.pachanga.get(pj.id_pachanga);
            if (!p.jugada || (temporadas && !temporadas.has(p.temporada))) return;
            if (pj.jugado) {
                r.jugadas++;
                if (!r.ultimaPachanga || p.fecha > r.ultimaPachanga) r.ultimaPachanga = p.fecha;
            }
            if (pj.cerveza) {
                r.cervezas++;
                if (!r.ultimaCerveza || p.fecha > r.ultimaCerveza) r.ultimaCerveza = p.fecha;
            }
            if (pj.vio && !pj.jugado) {
                r.vistas++;
                if (!r.ultimaVista || p.fecha > r.ultimaVista) r.ultimaVista = p.fecha;
            }
        });
        return r;
    };

    // Temporadas en las que ha jugado al menos una pachanga (de la más nueva a la más antigua)
    //   { temporadas, n, primera, ultima, ultimaPachanga, hace, sigue }
    //   sigue = ha jugado esta temporada
    Modelo.prototype.trayectoria = function (idMiembro) {
        var self = this;
        var idJ = this.jugadorDeMiembro.get(idMiembro);
        var set = new Set();
        var ultima = null;
        (idJ ? this.pjDeJugador.get(idJ) || [] : []).forEach(function (pj) {
            var p = self.pachanga.get(pj.id_pachanga);
            if (!p || !p.jugada || !pj.jugado) return;
            set.add(p.temporada);
            if (!ultima || p.fecha > ultima) ultima = p.fecha;
        });
        var lista = Array.from(set).sort().reverse();
        return {
            temporadas: lista,
            n: lista.length,
            primera: lista[lista.length - 1] || null,
            ultima: lista[0] || null,
            ultimaPachanga: ultima,
            hace: hace(ultima),
            sigue: lista[0] === this.temporadaActual
        };
    };

    // "3 temporadas (2023-24 – 2025-26)"
    Modelo.prototype.textoTemporadas = function (t) {
        if (!t.n) return 'Ninguna';
        return t.n + (t.n === 1 ? ' temporada' : ' temporadas') + ' (' + (t.n === 1 ? t.ultima : t.primera + ' – ' + t.ultima) + ')';
    };

    Modelo.prototype.totales = function (temporadas) {
        var r = { pachangas: 0, conCervezas: 0 };
        this.pachangas.forEach(function (p) {
            if (!p.jugada || (temporadas && !temporadas.has(p.temporada))) return;
            r.pachangas++;
            if (p.cervezas) r.conCervezas++;
        });
        return r;
    };

    // Deuda de cada jugador (Map idJugador -> euros). Necesita TABLAS_DEUDA.
    //   reserva sin pagar      -> precio_unitario x pachangas de la reserva
    //   pachanga suelta jugada -> su precio
    //   entrenamiento asistido -> su precio
    Modelo.prototype.deudas = function () {
        if (this._deudas) return this._deudas;
        var self = this;
        var d = this.d;
        var deudas = new Map();
        function sumar(id, n) { deudas.set(id, Math.round(((deudas.get(id) || 0) + Number(n)) * 100) / 100); }

        var nPorReserva = new Map();
        this.pachangas.forEach(function (p) {
            if (p.id_reserva) nPorReserva.set(p.id_reserva, (nPorReserva.get(p.id_reserva) || 0) + 1);
        });
        var reservas = indexar(d.reserva_periodica, 'id');
        (d.reserva_jugador || []).forEach(function (rj) {
            var r = reservas.get(rj.id_reserva);
            if (!rj.pagado && r) sumar(rj.id_jugador, r.precio_unitario * (nPorReserva.get(r.id) || 0));
        });
        (d.pachanga_jugador || []).forEach(function (pj) {
            var p = self.pachanga.get(pj.id_pachanga);
            if (p && pj.pagado === false && pj.jugado) sumar(pj.id_jugador, self.precioPachanga(p));
        });
        var entrenos = indexar(d.entrenamiento, 'id');
        (d.entrenamiento_jugador || []).forEach(function (ej) {
            var e = entrenos.get(ej.id_entrenamiento);
            if (e && !ej.pagado && ej.asistido) sumar(ej.id_jugador, e.precio);
        });
        // Cobros a personas concretas (p. ej. "Compra equipación")
        (d.cobro || []).forEach(function (c) {
            if (!c.pagado) sumar(c.id_jugador, c.importe);
        });

        deudas.forEach(function (v, k) { if (v <= 0) deudas.delete(k); });
        this._deudas = deudas;
        return deudas;
    };

    // Lo que paga por una pachanga quien no la tiene cubierta por la reserva:
    //   suelta -> su precio; de reserva sin estar apuntado -> precio de la reserva + 50 %
    Modelo.prototype.precioPachanga = function (p) {
        if (p.id_reserva == null) return Number(p.precio) || 0;
        var r = (this.d.reserva_periodica || []).find(function (x) { return x.id === p.id_reserva; });
        return r ? Math.round(Number(r.precio_unitario) * RECARGO_NO_APUNTADO * 100) / 100 : 0;
    };

    Modelo.prototype.deuda = function (idJugador) { return this.deudas().get(idJugador) || 0; };

    // 'ex' (se dio de baja), 'retirado' (no es jugador o no ha jugado esta temporada) o 'activo'
    Modelo.prototype.estado = function (m) {
        if (m.fecha_baja) return 'ex';
        if (m.tipo_miembro !== 'jugador') return 'retirado';
        var idJ = this.jugadorDeMiembro.get(m.id);
        if (!idJ || this.asistencia(idJ, new Set([this.temporadaActual])).jugadas === 0) return 'retirado';
        return 'activo';
    };

    Modelo.prototype.chipEstado = function (m) {
        var e = this.estado(m);
        if (e === 'ex') return '<span class="bk-chip bk-chip--gris">Difunto</span>';
        if (m.tipo_miembro === 'staff') return '<span class="bk-chip bk-chip--gris">Staff</span>';
        if (e === 'retirado') return '<span class="bk-chip bk-chip--gris">Retirado</span>';
        return '';
    };

    // "Dejó de jugar en 2025-26 (hace 1 año)" para staff y ex-miembros que jugaron
    Modelo.prototype.textoDejo = function (m, t) {
        t = t || this.trayectoria(m.id);
        if (!t.n || (t.sigue && !m.fecha_baja)) return null;
        return 'Dejó de jugar en ' + t.ultima + ' (' + t.hace + ')';
    };

    // Puntos de votos (necesita la vista v_resultado_top_pachanga en d)
    //   filtro(pachanga) -> true si la pachanga cuenta
    // Devuelve Map idJugador -> { mvp, fraude }
    Modelo.prototype.puntos = function (filtro) {
        var self = this;
        var r = new Map();
        (this.d.v_resultado_top_pachanga || []).forEach(function (v) {
            var p = self.pachanga.get(v.id_pachanga);
            if (!p || (filtro && !filtro(p))) return;
            var actual = r.get(v.id_jugador) || { mvp: 0, fraude: 0 };
            actual.mvp += 3 * Number(v.votos_top_1) + 2 * Number(v.votos_top_2) + Number(v.votos_top_3);
            actual.fraude += Number(v.votos_fraude);
            r.set(v.id_jugador, actual);
        });
        return r;
    };

    // Lista ordenada [{ idJugador, idMiembro, nombre, puntos }] de miembros con puntos > 0
    Modelo.prototype.ranking = function (filtro, tipo) {
        var self = this;
        var lista = [];
        this.puntos(filtro).forEach(function (v, idJ) {
            var m = self.miembroDeJugador(idJ);
            if (!m || v[tipo] <= 0) return;
            lista.push({ idJugador: idJ, idMiembro: m.id, nombre: self.nombreMiembro(m), puntos: v[tipo] });
        });
        lista.sort(function (a, b) { return b.puntos - a.puntos || a.nombre.localeCompare(b.nombre, 'es'); });
        return lista;
    };

    // ¿Está el miembro en el top 5 de la temporada actual? (tipo 'mvp' | 'fraude')
    // Solo se enseña esto, nunca los votos de cada uno.
    Modelo.prototype.enTop5 = function (idMiembro, tipo) {
        var self = this;
        if (!this._top5) this._top5 = {};
        if (!this._top5[tipo]) {
            this._top5[tipo] = new Set(this.ranking(function (p) { return p.temporada === self.temporadaActual; }, tipo)
                .slice(0, 5).map(function (x) { return x.idMiembro; }));
        }
        return this._top5[tipo].has(idMiembro);
    };

    // Dos chips "Top 5 MVP / Fraude" (o texto si no está en ninguno)
    Modelo.prototype.chipsTop5 = function (idMiembro) {
        var chips = [];
        if (this.enTop5(idMiembro, 'mvp')) chips.push('<span class="bk-chip bk-chip--negro">Top 5 MVP</span>');
        if (this.enTop5(idMiembro, 'fraude')) chips.push('<span class="bk-chip bk-chip--negro">Top 5 Fraude</span>');
        return chips.length ? chips.join(' ') : '<span class="bk-nota">Fuera del top 5</span>';
    };

    // Junta vigente hoy: [{ fila, cargo, miembro }]
    Modelo.prototype.juntaActual = function () {
        var self = this;
        return (this.d.junta_directiva || []).filter(function (f) {
            return f.fecha_inicio <= self.hoy && (!f.fecha_fin || f.fecha_fin >= self.hoy);
        }).map(function (f) {
            var c = self.cargo.get(f.id_cargo);
            return { fila: f, cargo: c ? c.nombre : '', miembro: self.miembro.get(f.id_miembro) };
        }).sort(function (a, b) { return a.fila.id_cargo - b.fila.id_cargo; });
    };

    Modelo.prototype.cargosDe = function (idMiembro) {
        var self = this;
        return (this.d.junta_directiva || []).filter(function (f) { return f.id_miembro === idMiembro; })
            .map(function (f) { var c = self.cargo.get(f.id_cargo); return Object.assign({ cargo: c ? c.nombre : '' }, f); })
            .sort(function (a, b) { return a.fecha_inicio < b.fecha_inicio ? 1 : -1; });
    };

    // Premios: [{ fila, nombre, temporada, periodo, etiqueta }]
    Modelo.prototype.premios = function (idMiembro) {
        var self = this;
        return (this.d.premio_miembro || []).filter(function (f) {
            return idMiembro == null || f.id_miembro === idMiembro;
        }).map(function (f) {
            var p = self.premio.get(f.id_premio);
            var nombre = p ? p.nombre_premio : 'Premio';
            var cuando = (f.periodo ? etiquetaPeriodo(f.periodo) + ' ' : '') + f.temporada;
            return { fila: f, nombre: nombre, temporada: f.temporada, periodo: f.periodo, cuando: cuando, mencion: p && p.mencion };
        }).sort(function (a, b) {
            return a.temporada === b.temporada ? (b.periodo || 7) - (a.periodo || 7) : (a.temporada < b.temporada ? 1 : -1);
        });
    };

    // Orden por apellido y nombre
    Modelo.prototype.compararMiembros = function (a, b) {
        return (a.apellido || a.nombre).localeCompare(b.apellido || b.nombre, 'es') || a.nombre.localeCompare(b.nombre, 'es');
    };

    async function modelo(tablas) {
        var lista = TABLAS_BASE.concat(tablas || []).filter(function (t, i, arr) { return arr.indexOf(t) === i; });
        return new Modelo(await cargar(lista));
    }

    // ------------------------------------------------------------------
    // Fotos (bucket privado "equipo", enlaces firmados de 1 hora)
    // ------------------------------------------------------------------
    var SILUETA = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#bfe6f8"/>' +
        '<circle cx="50" cy="38" r="18" fill="#111418"/><path d="M16 96c3-22 18-33 34-33s31 11 34 33z" fill="#111418"/></svg>');
    var firmadas = new Map();

    async function prepararFotos(miembros) {
        var rutas = [];
        (miembros || []).forEach(function (m) {
            if (m && m.foto_url && !firmadas.has(m.foto_url) && rutas.indexOf(m.foto_url) < 0) rutas.push(m.foto_url);
        });
        if (rutas.length) {
            try {
                var r = await cliente.storage.from('equipo').createSignedUrls(rutas, 3600);
                (r.data || []).forEach(function (f) { if (f.signedUrl) firmadas.set(f.path, f.signedUrl); });
            } catch (e) {
                console.warn('No se pudieron cargar las fotos', e);
            }
        }
        return foto;
    }

    function foto(m) { return (m && m.foto_url && firmadas.get(m.foto_url)) || SILUETA; }

    // Reduce una imagen a JPEG (lado largo máx.) antes de subirla
    function reducirImagen(archivo, maxLado, calidad) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            var url = URL.createObjectURL(archivo);
            img.onload = function () {
                var escala = Math.min(1, maxLado / Math.max(img.width, img.height));
                var c = document.createElement('canvas');
                c.width = Math.round(img.width * escala);
                c.height = Math.round(img.height * escala);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen')); }, 'image/jpeg', calidad);
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Ese archivo no es una imagen válida')); };
            img.src = url;
        });
    }

    async function urlFirmada(ruta) {
        var r = await cliente.storage.from('equipo').createSignedUrl(ruta, 3600);
        if (r.error) throw r.error;
        return r.data.signedUrl;
    }

    // ------------------------------------------------------------------
    // Sesión y cabecera
    // ------------------------------------------------------------------
    var ICONO_USUARIO = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21c.8-4.4 4.3-7 8.5-7s7.7 2.6 8.5 7z"/></svg>';

    var SECCIONES = [
        { id: 'inicio', texto: 'Inicio', ruta: 'inicio.html' },
        { id: 'pachangas', texto: 'Pachangas', ruta: 'pachangas.html' },
        { id: 'equipacion', texto: 'Equipación', ruta: 'equipacion.html' },
        { id: 'transparencia', texto: 'Transparencia', ruta: 'transparencia.html' },
        { id: 'miembros', texto: 'Miembros', ruta: 'miembros.html' },
        { id: 'premios', texto: 'Premios', ruta: 'premios.html' }
    ];

    function irALogin() {
        var volver = location.pathname + location.search;
        location.replace(url('index.html') + '?volver=' + encodeURIComponent(volver));
    }

    function pintarCabecera(yo, activa) {
        var secciones = SECCIONES.slice();
        if (yo.usuario && yo.usuario.admin) secciones.push({ id: 'admin', texto: 'Admin', ruta: 'admin/index.html' });

        var header = document.createElement('header');
        header.className = 'bk-cabecera';
        header.innerHTML =
            '<a class="bk-marca" href="' + url('inicio.html') + '">FRAN-<span>BASKET</span></a>' +
            '<nav class="bk-nav" id="bk-nav" aria-label="Secciones"><ul>' +
            secciones.map(function (s) {
                return '<li><a href="' + url(s.ruta) + '"' + (s.id === activa ? ' class="activo" aria-current="page"' : '') + '>' + s.texto + '</a></li>';
            }).join('') +
            '</ul></nav>' +
            '<button class="bk-menu" type="button" aria-label="Abrir menú" aria-expanded="false" aria-controls="bk-nav">☰</button>' +
            '<a class="bk-usuario" href="' + url('ajustes.html') + '" title="Ajustes">' + ICONO_USUARIO +
            '<span class="bk-usuario-texto"><span class="bk-usuario-nombre">' + esc(yo.apodo || (yo.usuario ? yo.usuario.usuario : '')) + '</span>' +
            (yo.miembro && yo.miembro.n_socio != null ? '<span class="bk-usuario-socio">Socio nº ' + esc(yo.miembro.n_socio) + '</span>' : '') +
            '</span></a>';
        document.body.insertBefore(header, document.body.firstChild);

        var boton = header.querySelector('.bk-menu');
        var nav = header.querySelector('.bk-nav');
        boton.addEventListener('click', function () {
            var abierto = nav.classList.toggle('abierto');
            boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });
    }

    function pintarPie() {
        if (document.querySelector('.bk-pie')) return;
        var pie = document.createElement('footer');
        pie.className = 'bk-pie';
        pie.innerHTML = 'FRAN-BASKET · Web interna del equipo · <a href="' + BASE + '../index.html">fran.matorras.com</a>';
        document.body.appendChild(pie);
    }

    var yoActual = null;

    // Apodo de la cabecera: uno al azar, guardado mientras la pestaña siga abierta
    // (sessionStorage) para que no cambie al pasar de una sección a otra.
    function elegirApodo(idMiembro, lista) {
        if (!lista.length) return null;
        var clave = 'fran-basket-apodo-' + idMiembro;
        var guardado = null;
        try { guardado = sessionStorage.getItem(clave); } catch (e) { /* sin almacenamiento */ }
        if (guardado && lista.indexOf(guardado) >= 0) return guardado;
        var elegido = lista[Math.floor(Math.random() * lista.length)];
        try { sessionStorage.setItem(clave, elegido); } catch (e) { /* sin almacenamiento */ }
        return elegido;
    }

    // Comprueba la sesión, pinta cabecera y pie y devuelve
    // { uid, usuario, miembro, idJugador, admin }.
    // Sin sesión manda al login (y la promesa no se resuelve nunca).
    async function iniciar(opciones) {
        opciones = opciones || {};
        var r = await cliente.auth.getSession();
        var sesion = r.data && r.data.session;
        if (!sesion) { irALogin(); return new Promise(function () {}); }

        var uid = sesion.user.id;
        var res = await Promise.all([
            cliente.from('usuario').select('*').eq('id', uid).maybeSingle(),
            cliente.from('miembro').select('*').eq('id_usuario', uid).maybeSingle()
        ]);
        if (res[0].error) throw res[0].error;

        var usuario = res[0].data;
        if (!usuario) {
            await cliente.auth.signOut();
            irALogin();
            return new Promise(function () {});
        }
        var miembro = res[1].data || null;
        var idJugador = null;
        var apodo = null;
        if (miembro) {
            var extra = await Promise.all([
                cliente.from('jugador').select('id').eq('id_miembro', miembro.id).maybeSingle(),
                cliente.from('apodo').select('apodo').eq('id_miembro', miembro.id).eq('validado', true)
            ]);
            idJugador = extra[0].data ? extra[0].data.id : null;
            apodo = elegirApodo(miembro.id, (extra[1].data || []).map(function (a) { return a.apodo; }));

            // Nº de socio: todo miembro activo que entra y no tiene número recibe el libre más bajo
            if (miembro.n_socio == null && !miembro.fecha_baja) {
                try {
                    var socio = await cliente.rpc('asegurar_mi_n_socio');
                    if (socio.error) throw socio.error;
                    if (socio.data != null) {
                        miembro.n_socio = socio.data;
                        olvidar('miembro');   // que las listas de esta página ya lo vean
                    }
                } catch (e) {
                    console.warn('No se pudo asignar el número de socio (¿falta migracion_06.sql?)', e);
                }
            }
        }

        if (opciones.admin && !usuario.admin) {
            location.replace(url('inicio.html'));
            return new Promise(function () {});
        }

        yoActual = { uid: uid, usuario: usuario, miembro: miembro, idJugador: idJugador, admin: !!usuario.admin, apodo: apodo };
        pintarCabecera(yoActual, opciones.activa);
        pintarPie();

        cliente.auth.onAuthStateChange(function (evento) {
            if (evento === 'SIGNED_OUT') irALogin();
        });

        return yoActual;
    }

    // Muestra un error de carga dentro de un contenedor
    function falloCarga(el, e) {
        console.error(e);
        if (el) el.innerHTML = '<div class="bk-mensaje bk-mensaje--error">No se pudieron cargar los datos: ' + esc(traducirError(e)) + '</div>';
    }

    // ------------------------------------------------------------------
    // Selector de temporadas (multi-selección con "Todas")
    //   seleccion: array de temporadas o 'todas'
    //   alCambiar(seleccion) con seleccion = Set o null (todas)
    // ------------------------------------------------------------------
    function selectorTemporadas(contenedor, temporadas, seleccion, alCambiar) {
        var elegidas = new Set(seleccion === 'todas' ? temporadas : seleccion);
        var detalles = document.createElement('details');
        detalles.className = 'bk-desplegable';
        detalles.innerHTML = '<summary></summary><div class="bk-desplegable-panel">' +
            '<label class="todas"><input type="checkbox" value="__todas"> Todas</label>' +
            temporadas.map(function (t) { return '<label><input type="checkbox" value="' + esc(t) + '"> ' + esc(t) + '</label>'; }).join('') +
            '</div>';
        contenedor.appendChild(detalles);

        var casillas = Array.from(detalles.querySelectorAll('input'));
        var todas = casillas[0];

        function pintar() {
            casillas.slice(1).forEach(function (c) { c.checked = elegidas.has(c.value); });
            todas.checked = elegidas.size === temporadas.length;
            todas.indeterminate = elegidas.size > 0 && elegidas.size < temporadas.length;
            var texto = todas.checked ? 'Todas las temporadas'
                : elegidas.size === 0 ? 'Ninguna temporada'
                : elegidas.size <= 2 ? 'Temporada ' + Array.from(elegidas).sort().reverse().join(', ')
                : elegidas.size + ' temporadas';
            detalles.querySelector('summary').textContent = texto;
        }

        function valor() { return elegidas.size === temporadas.length ? null : new Set(elegidas); }

        detalles.addEventListener('change', function (ev) {
            var c = ev.target;
            if (c === todas) {
                elegidas = new Set(c.checked ? temporadas : []);
            } else if (c.checked) {
                elegidas.add(c.value);
            } else {
                elegidas.delete(c.value);
            }
            pintar();
            alCambiar(valor(), elegidas.size === temporadas.length);
        });

        document.addEventListener('click', function (ev) {
            if (detalles.open && !detalles.contains(ev.target)) detalles.open = false;
        });

        pintar();
        return { valor: valor, todas: function () { return elegidas.size === temporadas.length; } };
    }

    // Normaliza texto para búsquedas (sin tildes ni mayúsculas)
    function normalizar(t) {
        return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    }

    window.Baske = {
        cliente: cliente,
        BASE: BASE,
        DOMINIO_EMAIL: DOMINIO_EMAIL,
        url: url,
        esc: esc,
        param: param,
        mensaje: mensaje,
        traducirError: traducirError,
        falloCarga: falloCarga,
        normalizar: normalizar,
        fecha: fecha,
        fechaLarga: fechaLarga,
        mesAnio: mesAnio,
        euros: euros,
        hoy: hoy,
        ahoraMadrid: ahoraMadrid,
        sumarDias: sumarDias,
        temporadaDe: temporadaDe,
        periodoDe: periodoDe,
        etiquetaPeriodo: etiquetaPeriodo,
        temporadaActual: temporadaActual,
        periodoActual: periodoActual,
        PERIODOS: PERIODOS,
        ventanaVoto: ventanaVoto,
        etiquetaCargo: etiquetaCargo,
        CARGOS: CARGOS,
        TIPOS: TIPOS,
        PISTAS: PISTAS,
        ORIGENES: ORIGENES,
        cargar: cargar,
        olvidar: olvidar,
        modelo: modelo,
        TABLAS_DEUDA: TABLAS_DEUDA,
        TABLAS_PREMIOS: TABLAS_PREMIOS,
        TABLAS_JUNTA: TABLAS_JUNTA,
        prepararFotos: prepararFotos,
        foto: foto,
        SILUETA: SILUETA,
        urlFirmada: urlFirmada,
        reducirImagen: reducirImagen,
        olvidarFoto: function (ruta) { firmadas.delete(ruta); },
        iniciar: iniciar,
        yo: function () { return yoActual; },
        hace: hace,
        selectorTemporadas: selectorTemporadas
    };
})();
