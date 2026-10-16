// 품절 현황 및 입고 예정 대시보드용 데이터 소스 (구글 시트 > 파일 > 공유 > 웹에 게시 > CSV)
const PUBKEY =
  "2PACX-1vR8PE4oemx-y8QuLz_zbt-GO7jwYgWw00z_312B8JJ1vgiGmXtNrXZgc4Avg5mY3ZrRTXAwLFtcUaPl";

const csv = (gid) =>
  `https://docs.google.com/spreadsheets/d/e/${PUBKEY}/pub?gid=${gid}&single=true&output=csv`;

export const OOS_SOURCES = {
  general: csv("214772207"), // 품절 시트 (일반/로켓) -> 화면의 '일반 채널'
  coupang: csv("548909377"), // 품절 시트 (쿠팡 로켓그로스) -> 화면의 '로켓그로스'
  channel: csv("1016731382"), // 완제품 재고 관리 시트 ('일반/로켓 여부' 열, 마스크 구분용)
};

export const REFRESH_MS = 5 * 60 * 1000; // 5분마다 자동 새로고침
