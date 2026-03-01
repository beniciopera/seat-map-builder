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

- Node.js 20+
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

Personalmente opté por no implementar un backend con base de datos, ya que consideré que añadía una complejidad innecesaria para el alcance del MVP. Los datos se mantienen en memoria y el estado de la interfaz se gestiona mediante la store, lo cual resulta más que suficiente y funcional para el propósito actual de la aplicación.


| Tecnología          | Uso                                                    |
| ------------------- | ------------------------------------------------------ |
| **Konva.js v10**    | Rendering 2D en canvas (imperativo, sin `react-konva`) |
| **Zustand v5**      | Estado reactivo de UI                                  |
| **MUI v7**          | Componentes de interfaz (toolbar, paneles, diálogos)   |
| **Tailwind CSS v4** | Estilos utilitarios                                    |
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

Se eligió Konva.js en modo imperativo (sin `react-konva`) para tener control total del ciclo de renderizado y evitar re-renders innecesarios de React al manipular cientos de elementos en el canvas.

### Command Pattern (Undo/Redo)

Toda mutación al mapa pasa por un objeto `Command` con métodos `execute()` y `undo()`. Esto garantiza undo/redo completo para cualquier operación:


| Comando                       | Operación                                    |
| ----------------------------- | -------------------------------------------- |
| `PlaceSeatsCommand`           | Colocar fila + asientos (o asientos sueltos) |
| `PlaceGridCommand`            | Colocar grilla de múltiples filas            |
| `CreateTableCommand`          | Crear mesa con asientos circulares           |
| `CreateAreaCommand`           | Crear área rectangular                       |
| `DeleteElementsCommand`       | Eliminar elementos (guarda snapshot)         |
| `MoveElementsCommand`         | Mover elementos (posiciones antes/después)   |
| `RotateElementsCommand`       | Rotar elementos alrededor de un centro       |
| `ResizeElementCommand`        | Redimensionar área                           |
| `ExtendRowCommand`            | Agregar asientos a los extremos de una fila  |
| `ContractRowCommand`          | Remover asientos de los extremos de una fila |
| `CurveRowCommand`             | Aplicar curvatura parabólica a una fila      |
| `UpdatePropertiesCommand`     | Cambiar propiedades arbitrarias              |
| `ChangeCategoryCommand`       | Cambiar categoría de elementos               |
| `ChangeTableSeatCountCommand` | Cambiar cantidad de asientos de una mesa     |
| `CompoundCommand`             | Agrupar múltiples comandos en una unidad     |


La historia mantiene un máximo de 100 entradas con doble stack (undo + redo).

### Spatial Index

Índice espacial basado en una grilla hash uniforme (celdas de 50px). Todas las consultas de hit-testing, detección de snap y box-select pasan primero por el índice para obtener candidatos en O(área local) en vez de O(todos los elementos), y luego aplican tests geométricos precisos.

### Sistema de Eventos Tipado

Un event emitter in-process con tipos estrictos para todos los eventos (`elements:added`, `selection:changed`, `tool:changed`, `viewport:changed`, `history:changed`, `preview:`*, etc.). Desacopla completamente engine, renderer y UI.

### Snap + Guidelines

`SnapEngine` detecta alineaciones con elementos cercanos (ejes y ángulos). `GuidelinesEngine` convierte los matches en líneas infinitas visualizadas en el canvas como guías de alineación.

---

## Herramientas

El editor incluye 7 herramientas, cada una con su propia máquina de estados interna:


| Herramienta     | Tecla | Descripción                                                     |
| --------------- | ----- | --------------------------------------------------------------- |
| **Selection**   | `V`   | Seleccionar, mover, rotar, redimensionar, extender/curvar filas |
| **Seat**        | `S`   | Colocar asientos individuales o filas con click+drag            |
| **Grid**        | `G`   | Generar grilla de filas×columnas con previsualización           |
| **Table**       | `T`   | Crear mesas redondas con asientos circulares                    |
| **Area**        | `A`   | Dibujar áreas rectangulares para agrupar filas                  |
| **Seat Picker** | `P`   | Seleccionar asientos para asignar estado/categoría              |
| **Pan**         | `H`   | Desplazar la vista del canvas                                   |


### Atajos Globales


| Atajo                                   | Acción                             |
| --------------------------------------- | ---------------------------------- |
| `Ctrl/Cmd + Z`                          | Deshacer                           |
| `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z` | Rehacer                            |
| `Ctrl/Cmd + A`                          | Seleccionar todo                   |
| `Delete` / `Backspace`                  | Eliminar selección                 |
| `Escape`                                | Cancelar operación / deseleccionar |
| `Space` (mantener)                      | Pan temporal                       |
| `Alt + Scroll`                          | Zoom centrado en cursor            |
| `Scroll`                                | Pan                                |
| `Click central` (drag)                  | Pan                                |


---

## Modelo de Datos

### BaseElement

Todos los elementos extienden esta interfaz base:

```typescript
interface BaseElement {
  id: ElementId;
  type: 'seat' | 'row' | 'area' | 'table';
  transform: { position: Point; rotation: number; scale: Point };
  bounds: { x: number; y: number; width: number; height: number };
  locked: boolean;
  visible: boolean;
}
```

### Seat

```typescript
interface Seat extends BaseElement {
  type: 'seat';
  label: string;              // ej: "A-1", "T1-3"
  rowId: ElementId | null;
  tableId: ElementId | null;
  status?: 'available' | 'reserved' | 'blocked' | 'sold';
  category: 'planta1' | 'planta2' | 'vip';
  radius: number;
}
```

### Row

```typescript
interface Row extends BaseElement {
  type: 'row';
  label: string;                           // ej: "A", "B", "AA"
  seatIds: readonly ElementId[];
  orientationAngle: number;                // radianes
  spacing: number;                         // px entre asientos
  seatOrderDirection: 'left-to-right' | 'right-to-left';
  areaId: ElementId | null;
  curveRadius: number;                     // 0 = recta, != 0 = sagita parabólica
  category: RowCategory;
}
```

### Table

```typescript
interface Table extends BaseElement {
  type: 'table';
  label: string;              // ej: "T1"
  seatCount: number;
  seatIds: readonly ElementId[];
  tableRadius: number;
  category: SeatCategory;
}
```

### Area

```typescript
interface Area extends BaseElement {
  type: 'area';
  label: string;
  color: string;
  rowIds: readonly ElementId[];
}
```

### MapLayout

```typescript
interface MapLayout {
  id: string;
  name: string;
  width: number;    // default: 5000
  height: number;   // default: 3000
  elements: ReadonlyMap<ElementId, MapElement>;
  createdAt: number;
  updatedAt: number;
}
```

El formato de serialización usa `schemaVersion: 1` y convierte el `Map` de elementos a un array JSON para importación/exportación.

---

## Supuestos Realizados

- **Solo para escritorio**: el editor asume uso con mouse/trackpad y teclado. No se implementaron gestos táctiles.
- **Un solo mapa a la vez**: no hay sistema de múltiples pestañas o proyectos.
- **Canvas fijo de 5000×3000**: el tamaño del canvas es constante; los elementos se colocan dentro de estos límites.
- **Persistencia local**: el mapa se guarda/carga como archivo JSON exportado. No hay backend ni base de datos.
- **Labels auto-generados**: las filas se etiquetan automáticamente con letras (A, B, ..., Z, AA, AB, ...) y los asientos con números secuenciales dentro de su fila/mesa.
- **Categorías fijas**: tres categorías predefinidas (`planta1`, `planta2`, `vip`) en vez de categorías dinámicas.
- **Filas curvas parabólicas**: la curvatura usa una parábola (sagita) en vez de un arco circular, priorizando simplicidad de implementación.

---

## Limitaciones Conocidas

- **Sin soporte mobile/touch**: no hay gestos de pinch-to-zoom ni interacciones táctiles.
- **Sin persistencia automática**: el usuario debe exportar/importar manualmente. No hay auto-save.
- **Performance con miles de elementos**: aunque el spatial index optimiza las consultas, el rendering de Konva podría degradarse con cantidades muy grandes de elementos (>5000 asientos) ya que no se implementó culling por viewport.

### Mejoras Posibles

- Implementar auto-save con localStorage o IndexedDB
- Soporte táctil
- Viewport culling (renderizar solo lo visto en pantalla) para mejorar performance con mapas grandes
- Sistema de categorías/colores dinámicas configurables por el usuario
- Copiar/pegar elementos
- Mejoras al expandir y contraer una row con curva

