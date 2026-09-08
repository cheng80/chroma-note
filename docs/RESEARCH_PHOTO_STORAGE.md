# 사진 저장 정책 리서치 — 중단된 중간 메모

조사일: 2026-09-07 · **사용자 지시로 리서치 중단. Chroma Note는 앱 전용 사본 저장 방식으로 재확정했다.** 아래는 하위 에이전트가 중단 전에 작성한 미완성 메모로, 통합 검토·최종 사실 검증을 마치지 않았다. 현재 정책이나 업계 표준의 근거로 사용하지 않는다. 이후 조사·내용 보완은 수행하지 않는다.

| 앱 | 첨부 후 독립 사본 / 갤러리 원본 삭제 | 로컬·서버 저장 | 최적화·용량 | 백업·복원 / 과금 |
|---|---|---|---|---|
| Day One | 가져온 사진은 최적화되어 클라우드에 저장되는 첨부 흐름이다. **갤러리 원본을 삭제해도 남는다고 명시한 문서는 미확인.** 업로드 전 앱 삭제·전송 실패면 저해상도 미리보기만 남을 수 있다. | Optimize 후 `Clear Local Media Storage`를 해도 서버에는 남는다. | Basic/Silver는 가져올 때 최적화, Silver/Gold는 더 높은 해상도. | JSON 내보내기에 미디어 포함 가능; 내보내기 전 전체 미디어 다운로드 권고. |
| Diarium | 사진·영상은 로컬 데이터베이스에 넣기 전 압축된다. 따라서 갤러리 `asset` 참조만은 아닌 것으로 보인다. **원본 삭제 후 잔존을 직접 보증한 문서는 미확인.** | 기본은 기기 오프라인 저장; 선택한 개인 클라우드에 동기화 파일을 저장한다. | 압축은 명시, 해상도·압축률·원본 보존은 미확인. | 기기 교체/재설치 전 앱 설정의 백업 필요; 동기화 파일은 압축·암호화. Cloud Sync는 Pro(Windows 유료판 포함). |
| Journey | `Import file`/Photo Library로 미디어를 첨부하고, Journey Cloud Sync는 암호화된 media를 서버에 저장한다. **갤러리 원본 삭제 후 잔존을 직접 보증한 문서는 미확인.** | Journey Cloud Sync 또는 Google Drive app data. Journey Cloud Sync E2EE에서 원본은 서버 처리 뒤 즉시 폐기되고 암호화본이 남는다. | 총 미디어는 기기·클라우드 여유 내 제한 없음; Cloud Sync/Google Drive 항목당 최대 20개, 웹 파일 최대 200MB. 별도 압축 정책 미확인. | 문서상 Word/ePub/PDF export와 Legacy backup을 제공하나, 첨부 포함 복원 범위는 미확인. Free/Premium은 Cloud Sync 70MB·60 entries, Membership은 10GB·5,000 entries. |

## 근거 포인터

- **Day One:** [Optimize Device Storage](https://dayoneapp.com/guides/settings/optimize-device-storage/)는 로컬 미디어를 비워도 서버에 남는다고 명시한다. [Missing Media](https://dayoneapp.com/guides/troubleshooting/missing-media/)는 전송 완료 전 재설치 시 full-resolution이 서버에 없을 수 있다고 설명한다. [Exporting entries](https://dayoneapp.com/guides/tips-and-tutorials/exporting-entries/)는 JSON export의 선택적 media 폴더와 전체 미디어 다운로드를 명시한다.
- **Diarium:** [공식 사이트 FAQ](https://diariumapp.com/en)는 로컬 저장, 개인 클라우드 동기화, Pro 범위를 명시한다. [Sync FAQ](https://forum.diariumapp.com/d/13-sync)는 동기화 파일 위치와 압축·암호화를, [공식 지원 답변](https://forum.diariumapp.com/d/3342-where-are-the-files-stored-and-how-does-the-sync-work/5)은 로컬 저장과 DB 삽입 전 미디어 압축을 명시한다.
- **Journey:** [미디어 첨부](https://support.journey.cloud/en/categories/writing-editing/articles/attach-and-delete-photos-video-audio-file)는 파일 import·한도, [암호화](https://support.journey.cloud/en/categories/synchronization-cloud/articles/how-does-encryption-work-in-journey)는 서버 처리·암호화본 저장·원본 캐시 폐기를, [Cloud Sync](https://support.journey.cloud/en/categories/synchronization-cloud/articles/how-to-add-a-cloud-sync)는 저장 대상, [요금 비교](https://support.journey.cloud/en/categories/purchase-payment/articles/journey-license-comparison)는 용량·기능 차이를 직접 뒷받침한다.
