# UI Functionality Checklist

Este checklist asegura que todas las funcionalidades básicas de la UI funcionen correctamente antes de considerar una tarea completada.

## Navegación Principal

### ✅ Cambio de URL/Hash
- [ ] Click en Overview cambia hash a `#overview`
- [ ] Click en Projects cambia hash a `#projects`
- [ ] Click en Workflows cambia hash a `#workflows`
- [ ] Click en History cambia hash a `#history`
- [ ] Click en Settings cambia hash a `#settings`
- [ ] Los cambios de hash actualizan la pantalla visualmente
- [ ] El estado del menú se actualiza para mostrar la pantalla actual

### ✅ Highlight de Menú Activo
- [ ] Overview se resalta cuando en `#overview`
- [ ] Projects se resalta cuando en `#projects`
- [ ] Workflows se resalta cuando en `#workflows`
- [ ] History se resalta cuando en `#history`
- [ ] Settings se resalta cuando en `#settings`
- [ ] Solo un item está resaltado a la vez
- [ ] El resaltado usa estilos consistentes (bg-primary/10 + border-primary/20)

## Sidebar Collapse

### ✅ Funcionalidad Toggle
- [ ] Click en botón de toggle collapse/expand sidebar
- [ ] Icono cambia correctamente (close_sidebar vs menu_open)
- [ ] Icono rota 180° cuando está colapsado
- [ ] Animación suave de 300ms con ease-in-out
- [ ] Sidebar vuelve a tamaño original con segundo click
- [ ] Estado de collapse se mantiene al navegar entre pantallas

### ✅ Estado Colapsado
- [ ] En estado colapsado: solo iconos visibles en navigation
- [ ] En estado colapsado: brand solo muestra icono
- [ ] En estado colapsado: user info se oculta
- [ ] Items de navegación se centran cuando está colapsado
- [ ] Tooltips mostrando nombre completo cuando está colapsado

## Screens y Contenido

### ✅ Screen Rendering
- [ ] Dashboard se renderiza completamente con todos sus componentes
- [ ] Settings se renderiza completamente con tabs funcionales
- [ ] Projects muestra título centrado y descripción básica
- [ ] Workflows muestra título centrado y descripción básica
- [ ] History muestra título centrado y descripción básica
- [ ] 404 screen para rutas desconocidas

### ✅ Contenido Dinámico
- [ ] El contenido cambia inmediatamente al navegar
- [ ] No hay delays o parpadeos al cambiar de pantalla
- [ ] Header se actualiza con título y breadcrumbs correctos
- [ ] Acciones del header cambian según pantalla actual

## Interactividad

### ✅ Botones y Acciones
- [ ] Botón de New Project en Dashboard abre diálogo (o muestra mensaje)
- [ ] Botones de Quick Actions en Dashboard muestran mensajes
- [ ] Toggle switches en Settings funcionan correctamente
- [ ] Botones de Save/Reset en Settings funcionan
- [ ] Botones deshabilitados muestran estado visual claro

### ✅ Estados Visuales
- [ ] Hover states consistentes en todos los elementos clickeables
- [ ] Focus states para navegación por teclado
- [ ] Active states para elementos seleccionados
- [ ] Disabled states con feedback visual claro

## Calidad Técnica

### ✅ Performance
- [ ] No hay errores en consola del navegador
- [ ] No hay warnings de React
- [ ] Las animaciones usan CSS transforms (no recálculos de layout)
- [ ] Los eventos no generan memory leaks

### ✅ Responsive Design
- [ ] Layout funciona en mobile (sidebar oculto o collapse automático)
- [ ] Layout funciona en tablet
- [ ] Layout funciona en desktop
- [ ] Header se adapta correctamente a diferentes tamaños

## Tests Automatizados

### ✅ Unit Tests
- [ ] Component App renderiza correctamente
- [ ] NavigationItem responde a props active
- [ ] Sidebar responde a props collapsed
- [ ] Header renderiza actions correctamente

### ✅ Integration Tests
- [ ] Navegación completa funciona end-to-end
- [ ] Sidebar collapse funciona en todos los estados
- [ ] Cambio de ruta actualiza estado global
- [ ] Click en navegación dispara eventos correctos

### ✅ E2E Tests con Stagehands
- [ ] Usuario puede navegar por todas las pantallas
- [ ] Sidebar collapse funciona con mouse/keyboard
- [ ] Links directos (hash URLs) funcionan
- [ ] Estado de aplicación persiste durante sesión

## Gates de Calidad

### ✅ Lint y Type Safety
- [ ] `pnpm lint` pasa sin errores o warnings
- [ ] `pnpm typecheck` pasa sin errores
- [ ] No hay uso de `any` types
- [ ] Todo código sigue convenciones de ESLint

### ✅ Build y Runtime
- [ ] `pnpm build` completa exitosamente
- [ ] `pnpm dev:web` inicia sin errores
- [ ] Aplicación carga en navegador sin errores
- [ ] Todos los assets y recursos cargan correctamente

## Accesibilidad

### ✅ Keyboard Navigation
- [ ] Todos los elementos interactivos son alcanzables con Tab
- [ ] Orden de Tab es lógico y consistente
- [ ] Enter/Space activan elementos correspondientes
- [ ] Escape cierra modales o cancela acciones

### ✅ Screen Reader
- [ ] Navegación tiene aria-labels apropiados
- [ ] Estados de elementos se comunican correctamente
- [ ] Header semántico usado correctamente
- [ ] Estructura de página es lógica y predecible