/**
 * 에뮬레이터 우선 개발 원칙에 맞춘 표준 프로파일(리얼런 리포트 environment.* 용 스텁).
 * 실물 단말 경로는 제외한다.
 */
export const STANDARD_MPC_EMULATOR = {
  platform: "android" as const,
  deviceModel: "sdk_gphone64_arm64",
  osVersion: "34",
  locale: "ko-KR",
  timezone: "Asia/Seoul",
  currency: "KRW",
  storeRegion: "KR",
};

export const STANDARD_MPC_APP = {
  name: "MyPhoneCheck",
  packageId: "com.ollanvin.myphonecheck",
  versionName: "1.0.0-smoke",
  versionCode: "1",
  store: "testLocal" as const,
  channel: "internal" as const,
};
