# 🔍 Buscador de IDs

Sistema de seguimiento logístico para búsqueda, confirmación y registro de paquetes mediante escaneo de códigos de barras o entrada manual.

---

## ✨ Funcionalidades

### Tab: Búsqueda
- **Carga de IDs** — ingresá una por una, pegá varias a la vez (enter, coma, punto y coma o espacio), o usá el área de texto masivo
- **Ruta y dimensión** (Voluminoso / Conveyable) asignables antes de iniciar
- **Modo scanner / bip** — barra siempre activa; al bipear un match lo resalta con animación y abre el modal
- **Confirmar encontrado** — modal con selección de ubicación obligatoria + observación opcional
- **No encontrado** — registra el ítem con estado negativo sin bloquear la lista

### Ubicaciones disponibles al confirmar
| Opción | Descripción |
|--------|-------------|
| 🏗️ Bajo el conveyor o buffer | Zona de conveyor o buffer |
| 📦 En el mismo contenedor | Contenedor correcto |
| 🔀 En contenedor cruzado | Contenedor equivocado |
| ✏️ Otro contenedor | Campo libre para escribir el código |

### Tab: Data
- **KPIs** — Total, Encontrados, No encontrados, % hallado (respetan el filtro de fecha)
- **Filtro por estado** — Todos / ✓ Encontrados / ✗ No encontrados
- **Filtro por fecha** — pickers Desde / Hasta + atajos: Hoy, Ayer, Esta semana
- **Buscador de texto** — filtra por ID, observación, ruta, ubicación o fecha
- **Sesiones** — cada carga nueva se numera (S1, S2…)
- **Exportar CSV** — descarga los registros con los filtros activos
- **Limpiar datos** — borra el historial con confirmación

---

## 🗂️ Estructura del proyecto

```
buscador-ids/
├── index.html   ← estructura HTML
├── styles.css   ← todos los estilos y design tokens
├── app.js       ← toda la lógica de la aplicación
├── README.md
└── .gitignore
```

---

## 🚀 Uso local

No requiere instalación. Abrí `index.html` en el navegador, o levantá un servidor local:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

---

## 🌐 Deploy con GitHub Pages

1. Subí el repo a GitHub
2. **Settings → Pages → Source:** rama `main`, carpeta `/(root)`
3. Guardá — en segundos queda en `https://<usuario>.github.io/<repo>/`

---

## 📦 Campos del CSV

| Campo | Descripción |
|-------|-------------|
| ID | Código del paquete |
| Estado | Encontrado / No encontrado |
| Fecha / Hora | Momento del registro |
| Sesión | Número de sesión (S1, S2…) |
| Dimensión | Voluminoso / Conveyable |
| Ruta | Ruta asignada |
| Ubicación | Tipo de ubicación |
| Contenedor | Código del contenedor (si aplica) |
| Observación | Nota libre |

---

## 📝 Licencia

MIT — libre para uso y modificación.
<!-- v2 -->
