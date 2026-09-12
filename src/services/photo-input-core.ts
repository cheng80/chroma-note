export type PhotoInputErrorCode = 'too_large' | 'unsupported' | 'corrupt' | 'icloud_download_failed' | 'storage_full' | 'unavailable' | 'unknown';

export type PhotoInputFailure = {
  code: PhotoInputErrorCode;
  message: { ko: string; en: string };
};

const messages: Record<PhotoInputErrorCode, PhotoInputFailure['message']> = {
  too_large: { ko: '사진이 너무 커서 가져올 수 없어요. 더 작은 사진을 선택해 주세요.', en: 'This photo is too large. Choose a smaller photo.' },
  unsupported: { ko: 'JPEG, PNG 또는 HEIC 정지 사진을 선택해 주세요.', en: 'Choose a JPEG, PNG, or HEIC still photo.' },
  corrupt: { ko: '사진 파일을 읽을 수 없어요. 다른 사진을 선택해 주세요.', en: 'This photo could not be read. Choose another photo.' },
  icloud_download_failed: { ko: 'iCloud 사진을 내려받지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.', en: 'We could not download this iCloud photo. Check your connection and try again.' },
  storage_full: { ko: '기기 공간이 부족해 사진을 보관하지 못했어요. 공간을 확보한 뒤 다시 시도해 주세요.', en: 'There is not enough space to keep this photo on your device. Free up space and try again.' },
  unavailable: { ko: '사진 가져오기를 준비하지 못했어요. 앱을 다시 열고 시도해 주세요.', en: 'Photo import is unavailable. Reopen the app and try again.' },
  unknown: { ko: '사진을 가져오지 못했어요. 다른 사진으로 다시 시도해 주세요.', en: 'We could not import this photo. Try another photo.' },
};

function errorText(error: unknown, seen = new Set<unknown>()): string {
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'number') return String(error);
  if (!error || typeof error !== 'object') return '';
  if (seen.has(error)) return '';
  seen.add(error);
  const value = error as Record<string, unknown>;
  return ['code', 'message', 'name', 'domain', 'nativeStackIOS', 'cause', 'originalError']
    .map((key) => errorText(value[key], seen))
    .join(' ');
}

export function photoInputFailure(error: unknown): PhotoInputFailure {
  const text = errorText(error);
  const code: PhotoInputErrorCode =
    /photo_(input|image)_too_large|too large|data length exceeds maximum/.test(text) ? 'too_large'
      : /photo_storage_full|out.?of.?space|enospc|phphotoerrornotenoughspace|(?:nscocoaerrordomain.*\b640\b|\b640\b.*nscocoaerrordomain)|(?:nsposixerrordomain.*\b28\b|\b28\b.*nsposixerrordomain)/.test(text) ? 'storage_full'
        : /photo_icloud_download_failed|phphotoserror(networkerror|networkaccessrequired)|nsurlerrordomain|failed to read picked image|failed to read image data|network access|required.*network|not connected to (the )?internet|cannot (find|connect).*host|timed out/.test(text) ? 'icloud_download_failed'
          : /photo_decode_failed|photo_input_corrupt|nsfilereadcorruptfileerror|failedcreatinguiimage|cannot decode|decode.*(fail|error)|corrupt/.test(text) ? 'corrupt'
            : /unsupported_photo|photo_unsupported_format|invalidmediatype|unsupported (image|format|type)|photo_invalid_input/.test(text) ? 'unsupported'
              : /native_build_required|photo_input_unavailable|lineart_(local|app)_file_required|photo_output_directory_required/.test(text) ? 'unavailable'
                : 'unknown';
  return { code, message: messages[code] };
}
