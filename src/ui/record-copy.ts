import type { ImageSourcePropType } from 'react-native';

import type { DisplayLocale } from './contract';

export const recordCopy = {
  ko: {
    back: '뒤로가기', close: '닫기', cancel: '이번 편집 취소', apply: '초안에 적용',
    photoHeader: '사진 가져오기', photoStep: '01 / 사진 확인', photoTitle: '이 순간을 남길까요?', photoBody: '사진 전체를 컬러 스케치로 바꿔요.\n갤러리 원본은 바뀌지 않아요.', photoLifetime: '사진 작업본은 저장 전까지 이 기기에 보관해요.', selectedPhoto: '선택한 사진', useDemo: '사진 선택', continuePhoto: '이 사진으로 계속', replacePhoto: '다른 사진 선택', date: '기록 날짜', dateHint: '기록 날짜는 다음 단계에서 바꿀 수 있어요.',
    preparingHeader: '컬러 스케치 준비', preparingTitle: '컬러 스케치로 변환할\n준비 중이에요', preparingBody: '잠시만 기다려 주세요.\n준비가 끝나면 컬러 스케치를 만들어요.', preparingNotice: '이 기기에서 사진을 준비하고 있어요.',
    processingHeader: '컬러 스케치 만들기', processingTitle: '사진을 컬러 스케치로 남기는 중', processingBody: '사진은 서버로 전송하지 않아요.\n기기 상태에 따라 시간이 걸릴 수 있어요.', stop: '중단하고 초안으로 나가기', retry: '다시 시도', skip: 'AI 글 없이 계속', changePhoto: '사진 바꾸기', error: '작업을 완료하지 못했어요.', modelErrors: { model_missing: '사진 분석 모델을 찾지 못했어요. 모델 준비를 다시 시도해 주세요.', model_corrupt: '사진 분석 모델을 확인하지 못했어요. 모델 준비를 다시 시도해 주세요.', model_unsupported: '이 기기에서는 사진 분석을 준비할 수 없어요. 다른 기기에서 다시 시도해 주세요.', model_out_of_memory: '기기 메모리가 부족해 사진 분석을 계속할 수 없어요. 다른 앱을 닫은 뒤 다시 시도해 주세요.', model_timeout: '사진 분석 준비가 오래 걸리고 있어요. 기기 상태를 확인한 뒤 다시 시도해 주세요.' }, steps: { prepare: '사진 준비', colors: '대표색 분석', analysis: '사진 읽기', stamp: '컬러 스케치 만들기' }, stepStatus: { done: '완료', active: '진행 중', waiting: '대기', error: '확인 필요' },
    compareHeader: '컬러 스케치 확인 1/2', photo: '원본 사진', stamp: '컬러 스케치', compareHint: '변환된 컬러 스케치를 확인해 주세요.', openOriginal: '이미지 확대', confirmed: '이 컬러 스케치로 기록할게요', continueCompare: '컬러 스케치 선택 후 계속', next: '내용 확인', blocked: '이 컬러 스케치를 선택하면 기록 내용을 작성할 수 있어요.', photoActions: '사진 작업',
    summaryHeader: '기록 요약 2/2', summaryLead: '한 장의 순간, 한 편의 기록', summaryConfirmed: '기록할 컬러 스케치를 선택했어요', writing: '문구 편집', writingEmpty: '아직 쓴 글이 없어요.', datePlace: '날짜와 장소', dateEmpty: '날짜와 장소를 정해 주세요.', colors: '사진에서 찾은 색', colorsEmpty: '아직 찾은 색이 없어요.', colorsValue: '대표색 {count}개, 색과 비중 보기', saveHint: '저장 후에는 컬러 스케치만 보관하고 사진 작업본은 지워요.', save: '저장하기', saving: '저장 중…', saveRetry: '저장 다시 시도',
    datePlaceTitle: '날짜와 장소', analysisTitle: '문구 편집', memoCount: '{count} / 2,000자', dateField: '기록 날짜', placeField: '장소명, 선택 사항', placeHint: '직접 쓰는 이름이에요. 위치정보는 쓰지 않아요.', aiWritingHint: 'AI 글과 태그는 사진을 바탕으로 한 초안이라 틀릴 수 있어요. 확인하고 고치거나 비워 둘 수 있어요.', memoField: '기록 글', memoHint: 'AI 문구는 글 끝에 추가돼요. 자유롭게 고치거나 지울 수 있어요.', sceneField: '장면, 선택 사항', sceneCount: '{count} / 120자', sceneHint: '비우면 장면을 삭제해요.', tagsSection: '태그', semanticTags: '의미 태그', semanticHint: '최대 8개, 태그당 24자', moodTags: '분위기 태그', moodHint: '최대 3개, 태그당 24자', analysisOptional: '글과 태그는 비워도 저장할 수 있어요.', suggest: 'AI 문구 추가', suggesting: 'AI 문구 만드는 중…', suggestRetry: 'AI 문구 추가 다시 시도', suggestFailed: 'AI 문구를 추가하지 못했어요. 글자 수와 입력한 내용을 확인한 뒤 다시 시도해 주세요.', invalid: '입력한 내용을 확인해 주세요.', paletteBody: '사진에서 추출한 색과 비중이에요.\n대표색은 직접 바꾸지 않아요.', paletteHint: '그날의 분위기를 색으로 기억해요.', viewer: '원본 사진',
  },
  en: {
    back: 'Back', close: 'Close', cancel: 'Cancel edit', apply: 'Apply to draft',
    photoHeader: 'Import photo', photoStep: '01 / Check photo', photoTitle: 'Keep this moment?', photoBody: 'The full photo becomes a color sketch.\nYour gallery original stays unchanged.', photoLifetime: 'The working photo stays on this device until saving.', selectedPhoto: 'Selected photo', useDemo: 'Choose photo', continuePhoto: 'Continue with this photo', replacePhoto: 'Choose another photo', date: 'Record date', dateHint: 'You can change the record date in the next step.',
    preparingHeader: 'Prepare color sketch', preparingTitle: 'Getting ready to\nmake a color sketch', preparingBody: 'Just a moment.\nThe color sketch begins when everything is ready.', preparingNotice: 'Preparing your photo on this device.',
    processingHeader: 'Create color sketch', processingTitle: 'Turning your photo into a color sketch', processingBody: 'Your photo is not sent to a server.\nTiming depends on your device.', stop: 'Leave and keep draft', retry: 'Try again', skip: 'Continue without AI writing', changePhoto: 'Change photo', error: 'The task could not be completed.', modelErrors: { model_missing: 'The photo analysis model could not be found. Try preparing it again.', model_corrupt: 'The photo analysis model could not be verified. Try preparing it again.', model_unsupported: 'Photo analysis cannot be prepared on this device. Try again on another device.', model_out_of_memory: 'There is not enough memory to continue photo analysis. Close other apps and try again.', model_timeout: 'Photo analysis is taking too long to prepare. Check your device and try again.' }, steps: { prepare: 'Prepare photo', colors: 'Analyze colors', analysis: 'Read photo', stamp: 'Create color sketch' }, stepStatus: { done: 'Done', active: 'In progress', waiting: 'Waiting', error: 'Needs attention' },
    compareHeader: 'Review color sketch 1/2', photo: 'Original photo', stamp: 'Color sketch', compareHint: 'Review your converted color sketch.', openOriginal: 'Enlarge image', confirmed: 'Use this color sketch for my record', continueCompare: 'Choose a color sketch to continue', next: 'Review details', blocked: 'Choose this color sketch to write your record.', photoActions: 'Photo actions',
    summaryHeader: 'Record summary 2/2', summaryLead: 'One moment, one record', summaryConfirmed: 'Color sketch selected for this record', writing: 'Edit writing', writingEmpty: 'No writing yet.', datePlace: 'Date and place', dateEmpty: 'Choose a date and place.', colors: 'Colors found in photo', colorsEmpty: 'No colors yet.', colorsValue: '{count} key colors, view weights', saveHint: 'Saving keeps the color sketch and removes the working photo.', save: 'Save record', saving: 'Saving…', saveRetry: 'Retry save',
    datePlaceTitle: 'Date and place', analysisTitle: 'Edit writing', memoCount: '{count} / 2,000', dateField: 'Record date', placeField: 'Place, optional', placeHint: 'A name you type. Location data is not used.', aiWritingHint: 'AI writing and tags may be wrong. Review, edit, or clear them.', memoField: 'Writing', memoHint: 'AI suggestions are added at the end. Edit or remove them freely.', sceneField: 'Scene, optional', sceneCount: '{count} / 120', sceneHint: 'Clear this field to remove the scene.', tagsSection: 'Tags', semanticTags: 'Semantic tags', semanticHint: 'Up to 8 tags, 24 characters each', moodTags: 'Mood tags', moodHint: 'Up to 3 tags, 24 characters each', analysisOptional: 'Writing and tags can be empty.', suggest: 'Add AI writing', suggesting: 'Generating AI writing…', suggestRetry: 'Try adding AI writing again', suggestFailed: 'Unable to add AI writing. Check the character count and your text, then try again.', invalid: 'Check the information you entered.', paletteBody: 'Colors and weights extracted from the photo.\nKey colors are read-only.', paletteHint: 'Remember the day through its colors.', viewer: 'Original photo',
  },
} as const;

export type RecordCopy = (typeof recordCopy)[DisplayLocale];

export function imageSource(uri: string, fallback: ImageSourcePropType, headers?: Record<string, string>): ImageSourcePropType {
  return uri && !uri.startsWith('demo-') && uri !== 'demo' ? { uri, headers } : fallback;
}

export function fillCount(template: string, count: number): string {
  return template.replace('{count}', String(count));
}

export function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '. ') : value;
}
