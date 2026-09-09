# iOS Runtime Notes — LCM_Dreamshaper_v7

갱신: 2026-09-09 · 범위: Apple `ml-stable-diffusion` Swift/Core ML 공식 코드 확인

## 결론

- `LCM_Dreamshaper_v7` 자체는 `NOT_CHECKED`로 종료한다. Mac 서버 대리 추론, fixture 재생, 다운로드, 앱 구현은 하지 않았다.
- Apple 공식 현재 경로는 LCM 직접 호환 `BLOCKED`: `LCMScheduler`와 LCM의 `timestep_cond` 입력 처리가 확인되지 않는다.
- Apple Swift pipeline의 일반 `img2img` 구조는 `SUPPORTED`로 확인했지만 LCM 지원을 의미하지 않는다.
- iOS Simulator 내부 실제 사진 로드·동일 가중치 추론은 `NOT_RUN`; 따라서 후보 `PASS`로 처리하지 않는다.

## 공식 LCM 요구사항

- 공식 저자 모델 카드: [`SimianLuo/LCM_Dreamshaper_v7`](https://huggingface.co/SimianLuo/LCM_Dreamshaper_v7) — `MIT`, Diffusers/ONNX/Safetensors 구성.
- 공식 `lcm_pipeline.py`는 `get_w_embedding(..., embedding_dim=256)`을 만들고 UNet 호출에 `timestep_cond=w_embedding`을 전달한다.
- 공식 모델 저장소에는 별도 [`lcm_scheduler.py`](https://huggingface.co/SimianLuo/LCM_Dreamshaper_v7/blob/main/lcm_scheduler.py)가 있다.

## Apple 공식 코드 대조

- [`Unet.swift`](https://github.com/apple/ml-stable-diffusion/blob/main/swift/StableDiffusion/pipeline/Unet.swift): `predictNoise`가 전달하는 입력은 `sample`, `timestep`, `encoder_hidden_states`와 선택 residual뿐이다. `timestep_cond` 입력/256차원 조건 경로가 없다.
- [`StableDiffusionPipeline.swift`](https://github.com/apple/ml-stable-diffusion/blob/main/swift/StableDiffusion/pipeline/StableDiffusionPipeline.swift): 등록 스케줄러는 `PNDM`, `DPM-Solver++`, `Discrete Flow`이며 `LCM` case가 없다.
- [`Scheduler.swift`](https://github.com/apple/ml-stable-diffusion/blob/main/swift/StableDiffusion/pipeline/Scheduler.swift): 공통 scheduler protocol과 PNDM 구현은 있으나 `LCMScheduler` 구현은 없다. Apple 저장소의 [LCM scheduler issue #319](https://github.com/apple/ml-stable-diffusion/issues/319)는 공식 지원 코드가 아니다.
- 일반 img2img는 `StableDiffusionPipeline`의 `Encoder`, `startingImage`, `strength`, `addNoise` 경로로 존재한다. LCM scheduler가 연결되지 않은 상태에서는 LCM img2img PASS 근거가 아니다.

## Simulator CPU 경로와 미확인

- Apple CLI는 `MLModelConfiguration.computeUnits`에 `cpuOnly`를 제공한다. Apple 문서의 [`MLComputeUnits.cpuOnly`](https://developer.apple.com/documentation/coreml/mlcomputeunits/cpuonly)는 CPU 전용 실행을 정의한다. 따라서 검증 대상 경로는 `Core ML + Swift package + cpuOnly`다.
- Apple README의 런타임 최소 조건은 iOS/iPadOS 16.2이며, 메모리 개선 조건은 iOS/iPadOS 17.0이다: [official README](https://github.com/apple/ml-stable-diffusion#system-requirements).
- 현재 저장소에서 네이티브 Swift/Xcode 실행기와 LCM Core ML 가중치를 찾지 못했다. Simulator 프로세스의 실제 사진 추론은 실행하지 않았고, 속도·메모리·결과 품질도 미확인이다.

## 공개 변환 checkpoint 경로

- 공식 저자 `SimianLuo` 저장소에서 확인된 공개 형식은 Diffusers/ONNX/Safetensors이며, 공식 저자 명의 Core ML checkpoint는 확인하지 못했다.
- 제3자 공개 경로는 [`davidw0311/sd-coreml/dreamshaper7_lcm`](https://huggingface.co/davidw0311/sd-coreml/tree/main/dreamshaper7_lcm)이다. `Unet.mlmodelc` metadata의 version은 `SimianLuo/LCM_Dreamshaper_v7`이고, 공개 metadata 입력은 `sample`, `timestep`, `encoder_hidden_states`뿐이다.
- 위 artifact는 공개 경로 확인일 뿐, Apple 공식 변환·Simulator 로드·LCM 수학적 동작·img2img 품질의 증거가 아니다. 다운로드하지 않았다.

## 실행 상태

`LCM_Dreamshaper_v7`: **NOT_CHECKED** · Apple LCM direct compatibility: **BLOCKED** · Apple generic img2img: **SUPPORTED** · Simulator CPU real-photo inference: **NOT_RUN**.
