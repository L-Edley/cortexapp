function tokens(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextDayOfWeek(from: Date, targetDay: number): Date {
  const current = from.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  const result = new Date(from);
  result.setDate(result.getDate() + diff);
  return result;
}

export function resolveRelativeDatePtBR(
  input: string,
  baseDate?: Date
): string | null {
  if (!input || typeof input !== "string") return null;

  const base = baseDate || new Date();
  const t = tokens(input);

  if (/depois\s+de\s+amanha/.test(t)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }

  if (/\bamanha\b/.test(t)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  if (/\bhoje\b/.test(t)) {
    return formatDate(base);
  }

  const dayMap: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
  };

  for (const [name, dayNum] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      return formatDate(nextDayOfWeek(base, dayNum));
    }
  }

  if (/semana\s+que\s+vem/.test(t)) {
    return formatDate(nextDayOfWeek(base, 1));
  }

  if (/mes\s+que\s+vem/.test(t)) {
    const d = new Date(base);
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return formatDate(d);
  }

  return null;
}