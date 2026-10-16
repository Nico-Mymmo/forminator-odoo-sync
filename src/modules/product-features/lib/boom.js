/**
 * Productfeatures -- de boom. Puur (geen databank), zodat het scherm, de
 * nieuwsbrief en de proeven er allemaal op kunnen rekenen.
 */

/** Platte lijst -> boom, elke knoop met `children`, `pad` (titels van boven naar beneden) en `diepte`. */
export function boom(lijst) {
  const perId = new Map(lijst.map((f) => [f.id, { ...f, children: [] }]));
  const wortels = [];
  for (const f of perId.values()) {
    const ouder = f.parent_id ? perId.get(f.parent_id) : null;
    if (ouder) ouder.children.push(f); else wortels.push(f);
  }
  const sorteer = (a, b) => ((a.position || 0) - (b.position || 0)) || String(a.name).localeCompare(String(b.name), 'nl');
  const loop = (knopen, pad) => {
    knopen.sort(sorteer);
    for (const k of knopen) {
      k.pad = [...pad, k.name];
      k.diepte = pad.length;
      loop(k.children, k.pad);
    }
  };
  loop(wortels, []);
  return wortels;
}

/** De boom als platte, ingesprongen lijst (voor keuzelijsten). */
export function platteBoom(lijst) {
  const uit = [];
  const loop = (knopen) => {
    for (const k of knopen) { uit.push(k); loop(k.children); }
  };
  loop(boom(lijst));
  return uit;
}
