# Seat Map Editor

Editor visual interactivo para diseñar mapas de asientos de venues y eventos. Permite crear, organizar y configurar asientos individuales, filas, mesas y áreas mediante una interfaz de canvas con herramientas especializadas, undo/redo completo e importación/exportación JSON. Hecho con Claude Code CLI (Opus 4.6) y Cursor.

Next.js
React
TypeScript
Konva
Zustand

---

## Configuración e Instalación

### Requisitos

- Node.js
- npm

### Instalación

```bash
git clone <repo-url>
cd seat-map-builder
npm install
```

### Scripts


| Comando         | Descripción                      |
| --------------- | -------------------------------- |
| `npm run dev`   | Servidor de desarrollo (Next.js) |
| `npm run build` | Build de producción              |
| `npm start`     | Servidor de producción           |
| `npm run lint`  | Linter (ESLint)                  |


Abrir [http://localhost:3000](http://localhost:3000) en el navegador.

---

## Decisiones Técnicas

### Stack

Opté por no implementar un backend con base de datos, ya que consideré que añadía una complejidad innecesaria para el alcance del MVP. Los datos se mantienen en memoria y el estado de la interfaz se gestiona mediante la store, lo cual resulta más que suficiente y funcional para el propósito actual de la aplicación. 

Preferí utilizar Konva en su versión vanilla porque el editor requiere manipulaciones geométricas complejas en tiempo real (rotaciones acumulativas, curvaturas, redistribución de asientos, guidelines dinámicas y undo/redo estructural). Trabajar de forma imperativa me permitió tener control directo sobre el ciclo de renderizado del canvas y optimizar interacciones críticas con muchos nodos en escena.

Si bien react-konva simplifica la integración con React mediante un enfoque declarativo, en este contexto prioricé el control y la previsibilidad del render. Además, hoy en día la asistencia de herramientas de IA reduce significativamente la fricción de trabajar a un nivel más bajo, por lo que la ventaja en simplicidad que ofrece react-konva no resultaba determinante para este proyecto.


| Tecnología          | Uso                                                    |
| ------------------- | ------------------------------------------------------ |
| **Konva.js v10**    | Rendering 2D en canvas (imperativo, sin `react-konva`) |
| **Zustand v5**      | Estado reactivo de UI                                  |
| **MUI v7**          | Componentes de interfaz (toolbar, paneles, diálogos)   |
| **nanoid v5**       | Generación de IDs únicos                               |


### Arquitectura en Capas

```
┌─────────────────────────────────────────────────────┐
│  UI Layer (React + Zustand)                         │
│  EditorShell, Toolbar, PropertiesPanel, StatusBar   │
├─────────────────────────────────────────────────────┤
│  Renderer Layer (Konva.js)                          │
│  KonvaRenderer, ElementLayer, SelectionLayer,       │
│  GuidelinesLayer, PreviewLayer                      │
├─────────────────────────────────────────────────────┤
│  Engine Layer (framework-agnostic)                  │
│  EditorEngine, Tools, Commands, InputManager,       │
│  SpatialIndex, SnapEngine, TransformSystem          │
├─────────────────────────────────────────────────────┤
│  Domain Layer (puro TypeScript)                     │
│  Types, Geometry, Constraints, Labels, Serialization│
└─────────────────────────────────────────────────────┘
```

**Flujo de datos:**
`Input del usuario` → `InputManager` → `Tool activa` → `Command` → `EditorState` → `Event emitido` → `Renderer redibuja` + `Zustand store actualizado` → `React re-renderiza`

### Motor Headless + Renderer Reactivo

El `EditorEngine` es completamente agnóstico al framework. No conoce React ni Konva. El `KonvaRenderer` se suscribe a eventos del engine y redibuja solo lo que cambió. React lee del store Zustand (que se actualiza vía el bridge `engineBridge.ts`) y nunca habla con el renderer directamente.

### Command Pattern (Undo/Redo)

Toda mutación al mapa pasa por un objeto `Command` con métodos `execute()` y `undo()`. Esto garantiza undo/redo completo para cualquier operación.

### Sistema de Eventos Tipado

Un event emitter in-process con tipos estrictos para todos los eventos (`elements:added`, `selection:changed`, `tool:changed`, `viewport:changed`, `history:changed`, `preview:`*, etc.). Desacopla completamente engine, renderer y UI.

### Snap + Guidelines

`SnapEngine` detecta alineaciones importantes y mejora la experiencia de usuario. `GuidelinesEngine` convierte los matches en líneas infinitas visualizadas en el canvas como guías de alineación. `VectorSnap` permite snap a vértices y aristas de elementos existentes (usado por la herramienta Vector Brush para ángulos y cierre de polígonos).

---

## Herramientas

El editor incluye 8 herramientas, cada una con su propia máquina de estados interna:


| Herramienta     | Tecla | Descripción                                                     |
| --------------- | ----- | --------------------------------------------------------------- |
| **Selection**   | `V`   | Seleccionar, mover, rotar, redimensionar, extender/curvar filas |
| **Seat**        | `S`   | Colocar asientos individuales o filas con click+drag            |
| **Grid**        | `G`   | Generar grilla de filas×columnas con previsualización           |
| **Table**       | `T`   | Crear mesas redondas con asientos circulares                    |
| **Area**        | `A`   | Dibujar áreas rectangulares                                     |
| **Vector Brush**| `B`   | Dibujar áreas poligonales con clics; snap a vértices/aristas y ángulos; cerrar acercando al primer punto |
| **Seat Picker** | `P`   | Seleccionar asientos para asignar estado/categoría              |
| **Pan**         | `H`   | Desplazar la vista del canvas                                   |


### Atajos Globales


| Atajo                                   | Acción                  |
| --------------------------------------- | ----------------------- |
| `Ctrl/Cmd + Z`                          | Deshacer                |
| `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z` | Rehacer                 |
| `Ctrl/Cmd + A`                          | Seleccionar todo        |
| `Delete` / `Backspace`                  | Eliminar selección      |
| `Escape`                                | Cancelar herramienta (ej. dibujo de polígono) |
| `Space` (mantener)                      | Pan temporal            |
| `Alt/Option + Scroll`                   | Zoom centrado en cursor |
| `Scroll/Shift + Scroll`                 | Pan                     |
| `Click central` (drag)                  | Pan                     |


---

## Modelo de Datos

### BaseElement

Todos los elementos extienden esta interfaz base (propiedades inmutables):

```typescript
interface BaseElement {
  readonly id: ElementId;
  readonly type: 'seat' | 'row' | 'area' | 'table';
  readonly transform: Transform;  // { position: Point; rotation: number; scale: Point }
  readonly bounds: Rect;         // { x: number; y: number; width: number; height: number }
  readonly locked: boolean;
  readonly visible: boolean;
}
```

### Seat

```typescript
interface Seat extends BaseElement {
  readonly type: 'seat';
  readonly label: string;              // ej: "A-1", "T1-3"
  readonly rowId: ElementId | null;
  readonly tableId: ElementId | null;
  readonly status?: 'available' | 'reserved' | 'blocked' | 'sold';
  readonly category: CategoryId;      // string, ej: "planta1" | "planta2" | "vip"
  readonly radius: number;
}
```

### Row

```typescript
interface CurveDefinition {
  readonly chord: number;   // longitud de la cuerda que define la parábola
  readonly center: Point;   // centro en espacio mundo
  readonly angle: number;   // ángulo de la cuerda (radianes)
}

interface Row extends BaseElement {
  readonly type: 'row';
  readonly label: string;                           // ej: "A", "B", "AA"
  readonly seatIds: readonly ElementId[];
  readonly orientationAngle: number;                // radianes
  readonly spacing: number;                         // px entre asientos
  readonly seatOrderDirection: 'left-to-right' | 'right-to-left';
  readonly areaId: ElementId | null;
  readonly curveRadius: number;                     // 0 = recta, != 0 = sagita parabólica
  readonly curveDefinition: CurveDefinition | null;
  readonly category: CategoryId;
}
```

### Table

```typescript
interface Table extends BaseElement {
  readonly type: 'table';
  readonly label: string;              // ej: "T1"
  readonly seatCount: number;
  readonly seatIds: readonly ElementId[];
  readonly tableRadius: number;
  readonly category: CategoryId;
}
```

### Area

```typescript
interface Area extends BaseElement {
  readonly type: 'area';
  readonly label: string;
  readonly color: string;
  readonly rowIds: readonly ElementId[];
  /** Vértices en espacio mundo. Si está presente, el área es poligonal; si no, es rectángulo por bounds. */
  readonly vertices?: readonly Point[];
}
```

Las áreas pueden ser rectangulares (solo `bounds`) o poligonales (Vector Brush: `vertices`).

### MapLayout

```typescript
interface MapLayout {
  readonly id: string;
  readonly name: string;
  readonly width: number;    // default: 5000
  readonly height: number;   // default: 3000
  readonly elements: ReadonlyMap<ElementId, MapElement>;
  readonly createdAt: number;
  readonly updatedAt: number;
}
```
---

## Supuestos Realizados

- **Solo para escritorio**: el editor asume uso con mouse/trackpad y teclado. No se implementaron gestos táctiles.
- **Canvas fijo de 5000×3000**: el tamaño del canvas es constante; los elementos se colocan dentro de estos límites.
- **Persistencia local**: el mapa se guarda/carga como archivo JSON exportado. No hay backend ni base de datos.
---

## Limitaciones Conocidas

- **Sin soporte mobile/touch**: no hay gestos de pinch-to-zoom ni interacciones táctiles.
- **Sin persistencia automática**: el usuario debe exportar/importar manualmente. No hay auto-save.
- **Limite de historial para UNDO/REDO**: el sistema guarda hasta 100 operaciones.



