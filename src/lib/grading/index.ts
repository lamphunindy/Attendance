export const defaultScale = [
  { min: 80, max: 100, grade: '4' },
  { min: 75, max: 79.99, grade: '3.5' },
  { min: 70, max: 74.99, grade: '3' },
  { min: 65, max: 69.99, grade: '2.5' },
  { min: 60, max: 64.99, grade: '2' },
  { min: 55, max: 59.99, grade: '1.5' },
  { min: 50, max: 54.99, grade: '1' },
  { min: 0, max: 49.99, grade: '0' },
];
export function gradeFor(score: number, scale = defaultScale) {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('คะแนนต้องอยู่ระหว่าง 0–100');
  const value = Math.round((score + Number.EPSILON) * 100) / 100;
  return scale.find((g) => value >= g.min && value <= g.max)?.grade ?? null;
}
export function totalScore(categories: { max_score: number; weight: number; scores: (number | null)[] }[]) {
  return (
    Math.round(
      categories.reduce(
        (n, c) => n + (c.scores.reduce<number>((s, x) => s + (x ?? 0), 0) / c.max_score) * c.weight,
        0,
      ) * 100,
    ) / 100
  );
}
