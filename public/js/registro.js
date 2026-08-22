// Registro de módulos de la SPA (módulo hoja, sin dependencias, para evitar
// importaciones circulares: los módulos se auto-registran en su top-level).
export const modulos = {};

export function registrarModulo(nombre, def) {
  modulos[nombre] = def;
}