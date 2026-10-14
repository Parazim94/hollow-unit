/** Gedrehte Box (nur um Y gedreht) als Hindernis. */
export interface BoxCollider {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  rot: number;
  height: number;
}

export class Colliders {
  boxes: BoxCollider[] = [];

  add(b: BoxCollider) {
    this.boxes.push(b);
  }

  /** Höhe der Oberfläche unter (x,z), auf der man stehen kann (0 = Boden). */
  floorAt(x: number, z: number, feetY: number): number {
    let floor = 0;
    for (const b of this.boxes) {
      if (b.height > floor && b.height <= feetY + 0.3 && this.contains(b, x, z)) {
        floor = b.height;
      }
    }
    return floor;
  }

  /** Schiebt einen Kreis (Radius) aus allen Boxen heraus, die höher als die Füße sind. */
  resolve(pos: { x: number; z: number }, radius: number, feetY: number) {
    for (const b of this.boxes) {
      if (feetY >= b.height - 0.05) continue; // steht darüber
      const c = Math.cos(b.rot);
      const s = Math.sin(b.rot);
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      // Weltkoordinaten -> Box-Koordinaten
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      const cx = Math.max(-b.halfW, Math.min(b.halfW, lx));
      const cz = Math.max(-b.halfD, Math.min(b.halfD, lz));
      let nx = lx - cx;
      let nz = lz - cz;
      let dist = Math.hypot(nx, nz);
      let push: number;

      if (dist === 0) {
        // Mittelpunkt liegt in der Box: entlang der kürzesten Achse hinausschieben
        const ox = b.halfW - Math.abs(lx);
        const oz = b.halfD - Math.abs(lz);
        if (ox < oz) {
          nx = Math.sign(lx) || 1;
          nz = 0;
          push = ox + radius;
        } else {
          nx = 0;
          nz = Math.sign(lz) || 1;
          push = oz + radius;
        }
        dist = 1;
      } else {
        if (dist >= radius) continue;
        push = radius - dist;
      }
      nx /= dist;
      nz /= dist;
      // Box-Koordinaten -> Welt
      pos.x += (nx * c + nz * s) * push;
      pos.z += (-nx * s + nz * c) * push;
    }
  }

  private contains(b: BoxCollider, x: number, z: number) {
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) <= b.halfW && Math.abs(lz) <= b.halfD;
  }
}
