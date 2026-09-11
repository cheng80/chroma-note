type Entry = Readonly<{ ko: string; en: string; aliases: readonly string[] }>;

const TAGS: readonly Entry[] = [
  { ko: '커피', en: 'coffee', aliases: ['coffee', 'espresso', 'cappuccino', 'latte'] },
  { ko: '컵', en: 'cup', aliases: ['cup', 'cups', 'mug', 'tumbler'] },
  { ko: '모자', en: 'hat', aliases: ['hat', 'head covering'] },
  { ko: '옷', en: 'clothing', aliases: ['dress', 'clothing', 'shirt'] },
  { ko: '테이블', en: 'table', aliases: ['table', 'tables', 'desk'] },
  { ko: '쟁반', en: 'tray', aliases: ['tray'] },
  { ko: '창문', en: 'window', aliases: ['window', 'windows', 'windowsill', 'window ledge'] },
  { ko: '의자', en: 'chair', aliases: ['chair', 'chairs', 'stool', 'stools'] },
  { ko: '계단', en: 'stairs', aliases: ['stair', 'stairs', 'staircase'] },
  { ko: '실내', en: 'interior', aliases: ['interior', 'indoors', 'indoor', 'room'] },
  { ko: '카페', en: 'cafe', aliases: ['cafe', 'coffee shop', 'restaurant'] },
  { ko: '사람', en: 'person', aliases: ['person', 'people', 'woman', 'man', 'child', 'human'] },
  { ko: '얼굴', en: 'face', aliases: ['face', 'head'] },
  { ko: '조각', en: 'sculpture', aliases: ['sculpture', 'statue'] },
  { ko: '장신구', en: 'jewelry', aliases: ['earrings', 'jewelry'] },
  { ko: '손', en: 'hand', aliases: ['hand'] },
  { ko: '실루엣', en: 'silhouette', aliases: ['silhouette'] },
  { ko: '거리', en: 'street', aliases: ['street', 'road', 'alley', 'roadway', 'pavement'] },
  { ko: '건물', en: 'building', aliases: ['building', 'buildings', 'house', 'facade', 'architecture'] },
  { ko: '도시', en: 'city', aliases: ['city', 'town', 'urban'] },
  { ko: '산', en: 'mountain', aliases: ['mountain', 'mountains', 'cliff', 'cliffs', 'hill', 'hills'] },
  { ko: '계곡', en: 'valley', aliases: ['valley', 'gorge', 'canyon'] },
  { ko: '숲', en: 'forest', aliases: ['forest', 'woods', 'woodland'] },
  { ko: '나무', en: 'tree', aliases: ['tree', 'trees'] },
  { ko: '식물', en: 'plant', aliases: ['plant', 'plants', 'leaf', 'leaves', 'foliage'] },
  { ko: '꽃', en: 'flower', aliases: ['flower', 'flowers', 'blossom'] },
  { ko: '바다', en: 'sea', aliases: ['sea', 'ocean', 'shoreline', 'coast'] },
  { ko: '호수', en: 'lake', aliases: ['lake', 'pond'] },
  { ko: '강', en: 'river', aliases: ['river', 'stream', 'waterfall'] },
  { ko: '등대', en: 'lighthouse', aliases: ['lighthouse'] },
  { ko: '배', en: 'boat', aliases: ['boat', 'sailboat'] },
  { ko: '부두', en: 'pier', aliases: ['pier'] },
  { ko: '다리', en: 'bridge', aliases: ['bridge'] },
  { ko: '들판', en: 'field', aliases: ['field', 'meadow'] },
  { ko: '하늘', en: 'sky', aliases: ['sky', 'cloud', 'clouds'] },
  { ko: '비', en: 'rain', aliases: ['rain', 'rainy', 'raindrop', 'raindrops'] },
  { ko: '우산', en: 'umbrella', aliases: ['umbrella', 'umbrellas'] },
  { ko: '음식', en: 'food', aliases: ['food', 'meal', 'dish', 'breakfast', 'lunch', 'dinner'] },
  { ko: '그릇', en: 'dish', aliases: ['plate', 'plates', 'bowl', 'bowls'] },
  { ko: '빵', en: 'bread', aliases: ['bread', 'sandwich', 'burger', 'bun'] },
  { ko: '지도', en: 'map', aliases: ['map'] },
  { ko: '기계', en: 'machine', aliases: ['machine', 'equipment'] },
  { ko: '표면', en: 'surface', aliases: ['surface', 'color'] },
  { ko: '조명', en: 'light', aliases: ['light', 'lights', 'lamp', 'lamps', 'lighting'] },
  { ko: '길', en: 'path', aliases: ['path', 'pathway', 'trail', 'walkway'] },
];

const MOODS: readonly Entry[] = [
  { ko: '따뜻함', en: 'warm', aliases: ['warm', 'warmth', 'golden'] },
  { ko: '포근함', en: 'cozy', aliases: ['cozy', 'cosy', 'comforting', 'gentle'] },
  { ko: '차분함', en: 'calm', aliases: ['calm', 'quiet', 'peaceful', 'serene'] },
  { ko: '활기참', en: 'lively', aliases: ['lively', 'vibrant', 'busy', 'energetic', 'dynamic'] },
  { ko: '밝음', en: 'bright', aliases: ['bright', 'sunny', 'light-filled'] },
  { ko: '어두움', en: 'dark', aliases: ['dark', 'dim', 'shadowy', 'night', 'moody', 'muted'] },
  { ko: '비 오는', en: 'rainy', aliases: ['rainy', 'wet', 'drizzly'] },
  { ko: '신비로움', en: 'mysterious', aliases: ['mysterious', 'misty', 'dreamlike'] },
  { ko: '고전적', en: 'rustic', aliases: ['rustic', 'historic', 'old-fashioned'] },
  { ko: '그리움', en: 'nostalgic', aliases: ['nostalgic', 'nostalgia', 'wistful'] },
  { ko: '웅장함', en: 'majestic', aliases: ['majestic', 'dramatic', 'grand'] },
  { ko: '싱그러움', en: 'fresh', aliases: ['lush', 'fresh', 'green'] },
  { ko: '시원함', en: 'cool', aliases: ['cool', 'refreshing', 'clear'] },
];

const BANNED = ['italy', 'france', 'paris', 'london', 'rome', 'new york', 'chef', 'waiter', 'waitress', 'employee', 'worker', 'bartender', 'customer', 'walking', 'running', 'working', 'drinking', 'eating', 'talking', 'driving', 'traveling', 'travelling', 'celebrating', 'shopping', 'speaking'];

const contains = (text: string, alias: string) => new RegExp(`(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(text);

function labels(text: string, entries: readonly Entry[], locale: string, limit: number): string[] {
  return entries.filter((entry) => entry.aliases.some((alias) => contains(text, alias))).slice(0, limit).map((entry) => locale === 'ko' ? entry.ko : entry.en);
}

export function adaptDescription(description: string, locale: string) {
  let safe = description.toLocaleLowerCase('en-US');
  for (const term of BANNED) safe = safe.replace(new RegExp(`(^|[^a-z])${term}([^a-z]|$)`, 'g'), ' ');
  const semanticTags = labels(safe, TAGS, locale, 8);
  const moodTags = labels(safe, MOODS, locale, 3);
  if (!semanticTags.length) throw new Error('analysis_unrecognized');
  const scene = locale === 'ko' ? `${semanticTags.slice(0, 3).join(', ')} 장면` : `${semanticTags.slice(0, 3).join(', ')} scene`;
  return { scene, semanticTags, moodTags };
}
