const CATEGORY_KEYWORDS = [
  ['카페', 'cafe'],
  ['커피', 'cafe'],
  ['브런치', 'brunch'],
  ['파스타', 'italian'],
  ['스시', 'japanese'],
  ['오마카세', 'japanese'],
  ['고기', 'korean-bbq'],
  ['술집', 'bar'],
  ['와인', 'wine-bar'],
  ['한식', 'korean'],
  ['중식', 'chinese'],
  ['양식', 'western'],
];

const REGION_KEYWORDS = ['성수', '망원', '합정', '연남', '을지로', '한남', '잠실', '해운대', '서면', '광안리', '강남', '가로수길'];

function normalizeWhitespace(value) {
  return value ? value.replace(/\s+/g, ' ').trim() : '';
}

function extractAddress(text) {
  if (!text) return null;

  const patterns = [
    /((?:서울|부산|대구|인천|광주|대전|울산|세종|제주|경기|강원|충북|충남|전북|전남|경북|경남)[가-힣]*\s+[가-힣]+(?:시|군|구)\s+[가-힣0-9\-]+(?:로|길)\s+[0-9\-]+)/,
    /((?:서울|부산|대구|인천|광주|대전|울산|세종|제주|경기|강원|충북|충남|전북|전남|경북|경남)[가-힣]*\s+[가-힣]+(?:시|군|구)\s+[가-힣]+(?:동|읍|면)\s+[0-9\-]+)/,
    /((?:[가-힣]+시\s+)?[가-힣]+(?:구|군)\s+[가-힣0-9\-]+(?:로|길)\s+[0-9\-]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeWhitespace(match[1]);
    }
  }

  return null;
}

function extractPlaceName(text) {
  if (!text) return null;

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const labeledLine = lines.find((line) => /상호|매장명|가게명/.test(line));
  if (labeledLine) {
    return labeledLine.replace(/(상호|매장명|가게명)\s*[:：-]?\s*/g, '').trim();
  }

  const hashtagCandidate = text.match(/#([A-Za-z0-9가-힣_]{2,30})/);
  if (hashtagCandidate) {
    return hashtagCandidate[1];
  }

  const descriptiveLine = lines.find((line) => !/주소|영업|주차|브레이크|웨이팅|추천/.test(line));
  return descriptiveLine || null;
}

function extractBranchName(placeName) {
  if (!placeName) return null;
  const match = placeName.match(/(본점|[0-9]+호점|[가-힣A-Za-z0-9]+점)$/);
  return match ? match[1] : null;
}

function extractCategory(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const [keyword, category] of CATEGORY_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return category;
    }
  }

  return null;
}

function inferRegion(address, text) {
  const source = `${address || ''} ${text || ''}`;
  const match = source.match(new RegExp(`(${REGION_KEYWORDS.join('|')})`));
  return match ? match[1] : null;
}

function buildCandidates({ placeName, address, category, region }) {
  const baseName = placeName || '후보 장소';
  const queryBase = normalizeWhitespace(`${baseName} ${address || ''}`);

  return [
    {
      provider: 'google',
      providerPlaceId: `mock-google-${baseName}`,
      displayName: baseName,
      formattedAddress: address || '주소 확인 필요',
      category,
      region,
      lat: 37.5665,
      lng: 126.978,
      matchScore: address ? 0.91 : 0.62,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryBase)}`,
    },
    {
      provider: 'google',
      providerPlaceId: `mock-google-alt-${baseName}`,
      displayName: `${baseName} 2호점`,
      formattedAddress: address || '주소 확인 필요',
      category,
      region,
      lat: 37.5651,
      lng: 126.98955,
      matchScore: address ? 0.54 : 0.4,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizeWhitespace(`${baseName} 2호점 ${address || ''}`))}`,
    },
  ];
}

function analyzeSharedPost({ sharedText, ocrText }) {
  const mergedText = [sharedText, ocrText].filter(Boolean).join('\n');
  const normalizedText = normalizeWhitespace(mergedText.replace(/\n/g, ' \n '));
  const placeName = extractPlaceName(mergedText);
  const address = extractAddress(mergedText);
  const category = extractCategory(mergedText);
  const branchName = extractBranchName(placeName);
  const region = inferRegion(address, mergedText);
  const confidence = placeName && address ? 0.88 : placeName ? 0.67 : 0.25;

  return {
    placeName,
    branchName,
    address,
    region,
    category,
    confidence,
    normalizedText,
    evidenceSnippets: mergedText
      .split(/\n+/)
      .map((line) => normalizeWhitespace(line))
      .filter(Boolean)
      .slice(0, 5),
    candidates: buildCandidates({ placeName, address, category, region }),
    reviewState: confidence >= 0.8 ? 'ready_to_confirm' : 'needs_review',
    pipelineVersion: 'v1-rule-based-starter',
    note: 'Designed so OCR, structured LLM extraction, and live Places search can replace this stub incrementally.',
  };
}

module.exports = {
  analyzeSharedPost,
};
