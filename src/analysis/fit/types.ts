/** Messpunkt mit optionaler Unsicherheit des y-Wertes (σ_y). */
export interface Pt {
  x: number;
  y: number;
  sy?: number;
}
