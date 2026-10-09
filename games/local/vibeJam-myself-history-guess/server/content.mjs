import { createHash, randomInt } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const yearValid = (year) => Number.isInteger(year) && year !== 0 && year >= -3000 && year <= 2026;
export const pointValid = (point) =>
  point &&
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  Math.abs(point.lat) <= 85 &&
  Math.abs(point.lng) <= 180;
export { yearValid };

export function loadQuestionBank(directory, assetDirectory) {
  const questions = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      let q;
      try {
        q = JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
      } catch {
        throw new Error(`Invalid private question JSON: ${name}`);
      }
      if (
        !q ||
        !/^[a-z0-9-]{1,80}$/.test(q.id) ||
        !yearValid(q.year) ||
        !pointValid(q) ||
        !Number.isInteger(q.tolerance) ||
        q.tolerance < 0 ||
        ![1, 2, 3].includes(q.difficulty) ||
        !['china', 'world'].includes(q.region) ||
        typeof q.clue !== 'string' ||
        !q.clue.trim() ||
        q.clue.length > 600 ||
        typeof q.image !== 'string' ||
        !/^assets\/[a-z0-9-]+\.(webp|jpg|png)$/.test(q.image)
      ) {
        throw new Error(`Invalid private question: ${name}`);
      }
      const view = q.view ?? { yaw: 180, pitch: 0, fov: 75 };
      if (
        !view ||
        !Number.isFinite(view.yaw) ||
        view.yaw < 0 ||
        view.yaw > 360 ||
        !Number.isFinite(view.pitch) ||
        view.pitch < -65 ||
        view.pitch > 65 ||
        !Number.isFinite(view.fov) ||
        view.fov < 35 ||
        view.fov > 90
      )
        throw new Error(`Invalid question view: ${name}`);
      const imagePath = realpathSync(resolve(assetDirectory, q.image));
      if (!imagePath.startsWith(realpathSync(assetDirectory) + sep))
        throw new Error(`Invalid image path: ${name}`);
      // Content-address snapshots keep image changes from changing an existing duel.
      const imageBytes = readFileSync(imagePath);
      return {
        id: q.id,
        year: q.year,
        lat: q.lat,
        lng: q.lng,
        tolerance: q.tolerance,
        region: q.region,
        difficulty: q.difficulty,
        clue: q.clue,
        view: { yaw: view.yaw, pitch: view.pitch, fov: view.fov },
        imageHash: createHash('sha256').update(imageBytes).digest('hex'),
        imageMime: q.image.endsWith('.webp')
          ? 'image/webp'
          : q.image.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg',
        imageBytes,
      };
    });
  if (questions.length < 5 || new Set(questions.map((q) => q.id)).size !== questions.length)
    throw new Error('Private question bank requires at least five unique questions');
  const version = createHash('sha256')
    .update(JSON.stringify(questions.map(({ imageBytes, ...q }) => q)))
    .digest('hex');
  return { version, questions };
}

export function selectQuestions(bank, { total = 5, chapter, recent = [] } = {}) {
  const pool = bank.questions.filter(
    (q) => !['china', 'world'].includes(chapter) || q.region === chapter,
  );
  const blueprint = total === 3 ? [1, 2, 3] : [1, 1, 2, 2, 3];
  const selected = [];
  for (const difficulty of blueprint) {
    const candidates = pool.filter((q) => q.difficulty === difficulty && !selected.includes(q));
    if (!candidates.length)
      throw new Error('Private question bank cannot fulfill the difficulty blueprint');
    const fresh = candidates.filter((q) => !recent.includes(q.id));
    const choices = fresh.length ? fresh : candidates;
    selected.push(choices[randomInt(choices.length)]);
  }
  return selected;
}

export function scoreAnswer(question, point, year, timedOut) {
  if (timedOut) return { score: 0, timeScore: 0, placeScore: 0, timedOut: true };
  const radians = Math.PI / 180;
  const h =
    Math.sin(((question.lat - point.lat) * radians) / 2) ** 2 +
    Math.cos(point.lat * radians) *
      Math.cos(question.lat * radians) *
      Math.sin(((question.lng - point.lng) * radians) / 2) ** 2;
  const km = 12742 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
  const astronomical = (value) => (value < 0 ? value + 1 : value);
  const years = Math.abs(astronomical(year) - astronomical(question.year));
  // Quantize feedback and never return distance, delta, or the correct answer.
  const quantize = (value) => Math.round(value / 50) * 50;
  const placeScore = quantize(2500 * Math.exp(-Math.max(0, km - 30) / 1800));
  const timeScore = quantize(
    2500 *
      Math.exp(
        -Math.max(0, years - question.tolerance) /
          Math.max(50, (2026 - astronomical(question.year)) * 0.25),
      ),
  );
  return { score: timeScore + placeScore, timeScore, placeScore, timedOut: false };
}
