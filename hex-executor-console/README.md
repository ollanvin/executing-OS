# Hex Executor Console

Cursor IDE 오른쪽 **AI Chat 패널**과 유사한 레이아웃의 데모 UI (React + TypeScript + Tailwind). 실제 LLM 없이 말풍선·헤더·입력 플로우만 재현합니다.

## 실행

```bash
cd hex-executor-console
npm install
npm run dev
```

브라우저에서 표시된 로컬 URL을 엽니다 (기본 `http://localhost:5173`).

## 구조

- `src/components/layout/HexExecutorLayout.tsx` — 좌/우 2-pane (`1.4fr` / `1fr`)
- `src/components/chat/CursorLikeChatPanel.tsx` — 우측 채팅 (mock 응답)
- `src/components/header/HexLogo.tsx` — 우주선 아이콘 교체 예정 자리
- `src/components/header/HexChatHeader.tsx` — Agent/Auto 드롭다운, 히스토리/⋯ 버튼

## 빌드

```bash
npm run build
npm run preview
```
