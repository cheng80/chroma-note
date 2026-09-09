import type { ImageSourcePropType } from 'react-native';

import type { DisplayLocale } from './contract';

export const recordCopy = {
  ko: {
    back: '뒤로가기', close: '닫기', cancel: '이번 편집 취소', apply: '초안에 적용',
    photoHeader: '사진 가져오기', photoStep: '01 / 사진 확인', photoTitle: '이 순간을 남길까요?', photoBody: '사진 전체를 기준으로 스탬프를 만들어요.\n갤러리 원본은 바뀌지 않아요.', photoLifetime: '원본 작업본은 저장 전까지 이 기기에 보관해요.', selectedPhoto: '선택한 사진', useDemo: '사진 선택', continuePhoto: '이 사진으로 계속', replacePhoto: '다른 사진 선택', date: '기록 날짜', dateHint: '촬영일을 가져왔어요. 날짜는 바꿀 수 있어요.',
    preparingHeader: '스탬프 준비', preparingTitle: '스탬프로 변환할\n준비 중이에요', preparingBody: '잠시만 기다려 주세요.\n준비가 끝나면 스탬프를 만들어요.', preparingNotice: '이 기기에서 사진을 준비하고 있어요.',
    processingHeader: '스탬프 만들기', processingTitle: '순간을 잉크로 남기는 중', processingBody: '사진은 서버로 전송하지 않아요.\n기기 상태에 따라 시간이 걸릴 수 있어요.', stop: '중단하고 초안으로 나가기', retry: '다시 시도', skip: 'AI 글 없이 계속', changePhoto: '사진 바꾸기', error: '작업을 완료하지 못했어요.', steps: { prepare: '사진 준비', colors: '대표색 분석', analysis: '사진 읽기', stamp: '스탬프 만들기' }, stepStatus: { done: '완료', active: '진행 중', waiting: '대기', error: '확인 필요' },
    compareHeader: '비교 · 1/2', photo: '원본', stamp: '스탬프', compareHint: '원본과 달라진 부분이 없는지 확인해 주세요.', openOriginal: '이미지 확대', confirmed: '원본과 결과를 비교했어요', continueCompare: '비교 확인 후 계속', next: '내용 확인', blocked: '비교 확인을 마치면 다음으로 갈 수 있어요.', photoActions: '사진 작업', photoActionsHint: '결과가 바뀌면 원본과 다시 비교해 주세요.', regenerate: '다시 만들기', adopt: '새 후보 사용', candidate: '새 스탬프 후보',
    summaryHeader: '기록 요약 · 2/2', summaryLead: '한 장의 순간, 한 편의 기록', summaryConfirmed: '원본과 비교했어요', writing: 'AI가 쓴 글 · 태그', writingEmpty: '아직 생성된 글이 없어요.', memo: '내 메모 · 선택', memoEmpty: '메모를 남겨보세요.', datePlace: '날짜 · 장소', dateEmpty: '날짜와 장소를 정해 주세요.', colors: '사진에서 찾은 색', colorsEmpty: '아직 찾은 색이 없어요.', colorsValue: '대표색 {count}개 · 색과 비중 보기', saveHint: '저장 후에는 원본 비교·재생성을 할 수 없어요.', save: '저장하기', saving: '저장 중…', saveRetry: '저장 다시 시도',
    memoTitle: '내 메모', datePlaceTitle: '날짜와 장소', analysisTitle: 'AI 글과 태그', noteHint: '완성된 기록은 요약 화면에서 저장해요.', memoCount: '{count} / 2,000자', dateField: '기록 날짜', placeField: '장소명 · 선택', placeHint: '직접 쓰는 이름이에요. 위치정보는 쓰지 않아요.', aiWritingField: 'AI가 쓴 글 · 수정 가능', aiWritingHint: '내 메모와 따로 보관해요.', semanticTags: '의미 태그', semanticHint: '최대 8개 · 태그당 24자', moodTags: '분위기 태그', moodHint: '최대 3개 · 태그당 24자', analysisOptional: 'AI 글과 태그는 비워도 저장할 수 있어요.', suggest: 'AI 문구 제안', suggesting: '제안 중…', invalid: '입력한 내용을 확인해 주세요.', paletteBody: '사진에서 추출한 색과 비중이에요.\n대표색은 직접 바꾸지 않아요.', paletteHint: '그날의 분위기를 색으로 기억해요.', viewer: '원본 사진',
  },
  en: {
    back: 'Back', close: 'Close', cancel: 'Cancel edit', apply: 'Apply to draft',
    photoHeader: 'Import photo', photoStep: '01 / Check photo', photoTitle: 'Keep this moment?', photoBody: 'The full photo becomes a Stamp.\nYour gallery original stays unchanged.', photoLifetime: 'The working original stays on this device until saving.', selectedPhoto: 'Selected photo', useDemo: 'Choose photo', continuePhoto: 'Continue with this photo', replacePhoto: 'Choose another photo', date: 'Record date', dateHint: 'We brought in the capture date. You can change it.',
    preparingHeader: 'Getting ready', preparingTitle: 'Getting ready to\nmake your stamp', preparingBody: 'Just a moment.\nYour stamp will begin when everything is ready.', preparingNotice: 'Preparing your photo on this device.',
    processingHeader: 'Make Stamp', processingTitle: 'Keeping the moment in ink', processingBody: 'Your photo is not sent to a server.\nTiming depends on your device.', stop: 'Leave and keep draft', retry: 'Try again', skip: 'Continue without AI writing', changePhoto: 'Change photo', error: 'The task could not be completed.', steps: { prepare: 'Prepare photo', colors: 'Analyze colors', analysis: 'Read photo', stamp: 'Make Stamp' }, stepStatus: { done: 'Done', active: 'In progress', waiting: 'Waiting', error: 'Needs attention' },
    compareHeader: 'Compare · 1/2', photo: 'Original', stamp: 'Stamp', compareHint: 'Check that nothing important changed from the original.', openOriginal: 'Enlarge image', confirmed: 'I compared the original and result', continueCompare: 'Continue after checking', next: 'Review details', blocked: 'Complete the comparison check to continue.', photoActions: 'Photo actions', photoActionsHint: 'Compare with the original again after changing the result.', regenerate: 'Make again', adopt: 'Use new candidate', candidate: 'New Stamp candidate',
    summaryHeader: 'Record summary · 2/2', summaryLead: 'One moment, one record', summaryConfirmed: 'Compared with the original', writing: 'AI writing · tags', writingEmpty: 'No writing yet.', memo: 'My note · optional', memoEmpty: 'Add a note.', datePlace: 'Date · place', dateEmpty: 'Choose a date and place.', colors: 'Colors found in photo', colorsEmpty: 'No colors yet.', colorsValue: '{count} key colors · view weights', saveHint: 'After saving, you cannot compare or regenerate from the original.', save: 'Save record', saving: 'Saving…', saveRetry: 'Retry save',
    memoTitle: 'My note', datePlaceTitle: 'Date & place', analysisTitle: 'AI writing & tags', noteHint: 'Save the completed record from the summary screen.', memoCount: '{count} / 2,000', dateField: 'Record date', placeField: 'Place · optional', placeHint: 'A name you type. Location data is not used.', aiWritingField: 'AI writing · editable', aiWritingHint: 'Stored separately from your note.', semanticTags: 'Semantic tags', semanticHint: 'Up to 8 · 24 characters each', moodTags: 'Mood tags', moodHint: 'Up to 3 · 24 characters each', analysisOptional: 'AI writing and tags can be empty.', suggest: 'Suggest AI writing', suggesting: 'Suggesting…', invalid: 'Check the information you entered.', paletteBody: 'Colors and weights extracted from the photo.\nKey colors are read-only.', paletteHint: 'Remember the day through its colors.', viewer: 'Original photo',
  },
} as const;

export type RecordCopy = (typeof recordCopy)[DisplayLocale];

export function imageSource(uri: string, fallback: ImageSourcePropType): ImageSourcePropType {
  return uri && !uri.startsWith('demo-') && uri !== 'demo' ? { uri } : fallback;
}

export function fillCount(template: string, count: number): string {
  return template.replace('{count}', String(count));
}

export function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '. ') : value;
}
