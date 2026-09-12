import type { DisplayLocale } from './contract';

export const basicCopy = {
  ko: {
    brand: 'Chroma Note',
    authTitle: '사진 한 장,\n오래 남길 이야기.',
    authLead: '원본 사진은 이 기기에서만 처리해요.\n완성된 컬러 스케치와 기록은 계정에 보관해요.',
    authEmailHint: '비밀번호 없이, 이메일로 받은 코드로 시작해요.',
    emailLabel: '이메일', emailPlaceholder: 'name@example.com', emailAction: '이메일로 계속',
    otpTitle: '이메일 확인', otpHeading: '메일함을 확인해 주세요',
    otpLead: (email: string) => `${email}으로 보낸\n인증 코드를 입력해 주세요.`,
    otpLabel: '인증 코드', otpAction: '코드 확인',
    changeEmail: '이메일 수정', resend: '코드 다시 받기', mailNoticeTitle: '메일이 오지 않나요?', mailNoticeBody: '스팸함을 확인하거나 이메일을 다시 수정해 주세요.',
    back: '뒤로가기',
    bookHeading: '다시 펼쳐 보는 순간', bookLead: '사진 한 장, 오래 남길 이야기.',
    month: (count: number) => `2026년 9월, ${count}개의 순간`, all: '전체', date: '날짜', filter: '필터',
    importPhoto: '사진 가져오기', resume: (count: number) => `초안 ${count}개 이어서 만들기`, resumeNew: '새 기록 이어가기', resumeEdit: '기록 편집 이어가기', privateBook: '완성된 기록은 나만 볼 수 있어요.',
    emptyTitle: '첫 순간을\n컬러 스케치로 남겨보세요', emptyBody: '걷던 길, 좋아하던 자리.\n사진 한 장부터 가볍게 시작해요.', designExample: '기록 예시 이미지', emptyHint: '앨범에서 한 장을 선택하면 돼요.',
    noResults: '조건에 맞는 기록이 없어요.', noResultsBody: '필터를 바꾸면 다른 순간을 찾아볼 수 있어요.', listError: 'Book을 불러오지 못했어요.', retry: '다시 시도', partial: '연결을 확인하지 못해 이 기기에 보관된 기록을 보여드려요.', more: '더 보기',
    favorite: '즐겨찾기', favoriteOn: '즐겨찾기 해제', favoriteOnly: '즐겨찾기만', startDate: '시작 날짜', endDate: '마지막 날짜', tag: '의미 태그 하나 선택', apply: '필터 적용', cancel: '취소', clear: '전체', filterInvalid: '날짜 범위를 확인해 주세요.',
    record: '기록', actions: '기록 더보기', edit: '기록 편집', delete: '기록 삭제', close: '닫기', read: '글 읽기', memo: '내 메모', memoAll: '전체 기록에서 내 메모 읽기', noMemo: '아직 메모가 없어요.', aiNote: 'AI가 쓴 글', tags: '태그', datePlace: '날짜와 장소', imageMissing: '컬러 스케치 이미지를 불러오지 못했어요.', retryImage: '이미지 다시 불러오기', saved: 'Book에 저장했어요', savedBody: '완성된 컬러 스케치를 다시 볼 수 있어요.',
    settings: '설정', language: '언어', system: '기기 설정', korean: '한국어', english: 'English', model: '컬러 스케치 준비', ready: '준비됨', modelUnprepared: '준비 전', modelLoading: '준비 중', modelFailed: '준비 필요', originalPhoto: '원본 사진', onThisDevice: '이 기기에서만 처리', accountRecords: '계정 기록', accountStorage: '완성된 컬러 스케치와 기록은 계정에 보관해요. 기기에 내려받은 이미지는 계정당 최대 200MiB까지 보관해요.', logout: '로그아웃', deleteAccount: '계정 삭제', unsaved: '이 기기의 미저장 작업은 로그아웃하면 지워져요.', deleteWarning: '계정을 삭제하지 못했어요. 다시 시도해 주세요.', deleting: '삭제 중…', deleteRetry: '삭제 다시 시도',
  },
  en: {
    brand: 'Chroma Note', authTitle: 'Photos to color sketches.\nMoments to stories.', authLead: 'Your original photo stays on this device.\nFinished color sketches and records stay with your account.', authEmailHint: 'Start without a password, using a code sent to your email.', emailLabel: 'Email', emailPlaceholder: 'name@example.com', emailAction: 'Continue with email',
    otpTitle: 'Email verification', otpHeading: 'Check your inbox', otpLead: (email: string) => `Enter the code sent to\n${email}.`, otpLabel: 'Verification code', otpAction: 'Verify code', changeEmail: 'Edit email', resend: 'Get another code', mailNoticeTitle: 'Didn’t get the email?', mailNoticeBody: 'Check spam or edit your email address.', back: 'Go back',
    bookHeading: 'Moments to return to', bookLead: 'One photo, a story to keep.', month: (count: number) => `September 2026, ${count} moments`, all: 'All', date: 'Date', filter: 'Filter', importPhoto: 'Import a photo', resume: (count: number) => `Continue ${count} draft${count === 1 ? '' : 's'}`, resumeNew: 'Continue new record', resumeEdit: 'Continue editing record', privateBook: 'Finished records are visible only to you.', emptyTitle: 'Leave your first moment\nas a color sketch', emptyBody: 'A familiar path, a favorite seat.\nStart with one photo.', designExample: 'Record example image', emptyHint: 'Choose one photo from your album.', noResults: 'No records match these filters.', noResultsBody: 'Change the filters to find another moment.', listError: 'Book could not be loaded.', retry: 'Try again', partial: 'Could not connect. Showing records kept on this device.', more: 'Load more', favorite: 'Favorite', favoriteOn: 'Remove favorite', favoriteOnly: 'Favorites only', startDate: 'Start date', endDate: 'Last date', tag: 'Choose one meaning tag', apply: 'Apply filter', cancel: 'Cancel', clear: 'All', filterInvalid: 'Check the date range.', record: 'Record', actions: 'More record actions', edit: 'Edit record', delete: 'Delete record', close: 'Close', read: 'Read writing', memo: 'My note', memoAll: 'Read my note in the full record', noMemo: 'No note yet.', aiNote: 'AI writing', tags: 'Tags', datePlace: 'Date and place', imageMissing: 'The color sketch image could not be loaded.', retryImage: 'Retry image', saved: 'Saved to Book', savedBody: 'You can see the finished color sketch again.', settings: 'Settings', language: 'Language', system: 'System', korean: '한국어', english: 'English', model: 'Color sketch preparation', ready: 'Ready', modelUnprepared: 'Not ready', modelLoading: 'Loading', modelFailed: 'Setup needed', originalPhoto: 'Original photo', onThisDevice: 'Processed only on this device', accountRecords: 'Account records', accountStorage: 'Finished color sketches and records are kept with your account. Images downloaded to this device are kept up to 200MiB per account.', logout: 'Log out', deleteAccount: 'Delete account', unsaved: 'Unsaved work on this device will be removed when you log out.', deleteWarning: 'Could not delete your account. Try again.', deleting: 'Deleting…', deleteRetry: 'Retry deletion',
  },
} as const;

export type BasicCopy = (typeof basicCopy)[DisplayLocale];

export function getBasicCopy(locale: DisplayLocale): BasicCopy {
  return basicCopy[locale];
}
