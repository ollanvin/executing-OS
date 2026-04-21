/** 스모크: 비허용 billing import 탐지용(고의) — 경로에 `/fixtures/` 없음(AST 제외 회피). `stripe` 패키지 미설치, 모듈 문자열만 검사. */
// @ts-expect-error 스모크용 가짜 결제 SDK 모듈명
import Stripe from "stripe";

export const x = 1;
