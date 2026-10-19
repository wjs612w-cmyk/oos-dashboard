import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { RefreshCw, Search } from "lucide-react";
import { OOS_SOURCES, REFRESH_MS } from "../config/oosSources";

/* ───────── 상수 ───────── */
const SHEET_LABEL = { general: "일반 채널", coupang: "로켓그로스" };
const STATUS = ["품절", "품절 경고", "품절 임박"];
const STATUS_KEY = { 품절: 0, 품절경고: 1, 품절임박: 2 };
const STYLE = [
  { badge: "bg-red-100 text-red-700 ring-red-200", dot: "bg-red-500", card: "border-red-200 bg-red-50 text-red-700" },
  { badge: "bg-orange-100 text-orange-700 ring-orange-200", dot: "bg-orange-500", card: "border-orange-200 bg-orange-50 text-orange-700" },
  { badge: "bg-yellow-100 text-yellow-800 ring-yellow-200", dot: "bg-yellow-400", card: "border-yellow-200 bg-yellow-50 text-yellow-800" },
];
const CATS = ["마스크", "캡슐세제", "섬유유연제", "액상세제", "생활용품"];
const HIDE_ETA = /^(DROP|단종|드롭)/i; // 입고예정일이 단종/드롭이면 목록에서 제외

/* ───────── 파싱 유틸 ───────── */
const norm = (s) => String(s ?? "").replace(/\s+/g, "");
const toDays = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const x = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? Math.round(x) : null;
};
const toNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const ALIAS = {
  tier: ["주력구분"], code: ["품번"], name: ["상품명"], cat: ["카테고리"],
  stock: ["일반통합재고", "쿠팡재고"], base: ["소진기준량"], status: ["재고상태", "품절상태"],
  days: ["예상소진일"], depDate: ["소진일자"], eta: ["입고예정일"], qty: ["입고예정수량"], memo: ["특이사항"], channel: ["일반/로켓여부"],
};
const buildIndex = (header) => {
  const h = header.map(norm);
  const idx = {};
  Object.entries(ALIAS).forEach(([k, names]) => {
    const i = h.findIndex((x) => names.includes(x));
    if (i >= 0) idx[k] = i;
  });
  return idx;
};

async function fetchRows(url) {
  const res = await fetch(`${url}&_=${Date.now()}`);
  if (!res.ok) throw new Error(`시트를 불러오지 못했습니다 (${res.status})`);
  return Papa.parse(await res.text(), { skipEmptyLines: "greedy" }).data;
}

// 한 시트 탭 안에 '주력/비주력' 섹션이 여러 개 있어도 '카테고리' 헤더 행마다 컬럼 위치를 새로 잡는다
function parseOos(rows, sheet, channelMap) {
  const out = [];
  let idx = null;
  rows.forEach((r) => {
    if (norm(r[0]) === "카테고리") { idx = buildIndex(r); return; }
    if (!idx || idx.code == null || norm(r[0]).startsWith("■")) return;
    const code = norm(r[idx.code]);
    const name = String(r[idx.name] ?? "").trim();
    const st = STATUS_KEY[norm(r[idx.status])];
    if (!code || !name || st === undefined) return;
    const eta = String(r[idx.eta] ?? "").trim();
    if (HIDE_ETA.test(eta)) return;
    const cat = String(r[idx.cat] ?? "").trim();
    out.push({
      key: `${sheet}-${code}`, sheet, st, code, name, cat,
      minor: norm(r[idx.tier]) === "비주력",
      ch: cat === "마스크" ? channelMap.get(code) || "" : "",
      stock: toNum(r[idx.stock]), base: toNum(r[idx.base]),
      eta, qty: toNum(r[idx.qty]),
      days: toDays(r[idx.days]), depDate: String(r[idx.depDate] ?? "").trim(), memo: String(r[idx.memo] ?? "").trim(),
    });
  });
  return out;
}

function parseChannelMap(rows) {
  const map = new Map();
  let idx = null;
  rows.forEach((r) => {
    if (norm(r[0]) === "카테고리") { idx = buildIndex(r); return; }
    if (!idx || idx.code == null || idx.channel == null) return;
    const code = norm(r[idx.code]);
    const v = norm(r[idx.channel]);
    if (code && (v === "일반" || v === "로켓")) map.set(code, v);
  });
  return map;
}

/* ───────── 날짜 ───────── */
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseEta = (s) => {
  const m = /(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const fmtDate = (d) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
const n = (v) => v.toLocaleString("ko-KR");

/* ───────── 작은 컴포넌트 ───────── */
function Pills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.v ? "bg-slate-800 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Dday({ eta, qty }) {
  const d = parseEta(eta);
  const q = qty ? <span className="text-xs text-slate-500">예정 {n(qty)}</span> : null;
  if (!d) {
    const text = !eta ? "일정 미정" : eta === "없음" ? "입고 없음" : eta;
    const cls = !eta ? "text-slate-400" : eta === "없음" ? "bg-slate-200 text-slate-600" : "bg-violet-50 text-violet-700";
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>
        {q}
      </div>
    );
  }
  const diff = Math.round((d - startOfToday()) / 86400000);
  let label, cls;
  if (diff < 0) { label = `입고지연 (D+${-diff})`; cls = "bg-red-600 text-white"; }
  else if (diff === 0) { label = "D-Day"; cls = "bg-red-100 text-red-700"; }
  else if (diff <= 3) { label = `D-${diff}`; cls = "bg-emerald-100 text-emerald-700"; }
  else if (diff <= 7) { label = `D-${diff}`; cls = "bg-sky-100 text-sky-700"; }
  else { label = `D-${diff}`; cls = "bg-slate-100 text-slate-600"; }
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
      <span className="text-xs text-slate-500">{fmtDate(d)}</span>
      {q}
    </div>
  );
}

function Depletion({ days, date }) {
  if (days == null) return null;
  const dt = parseEta(date);
  return (
    <div className="mt-1 text-xs text-slate-500">
      예상소진 <b className={days <= 0 ? "text-red-600" : "text-slate-800"}>{days}일</b>
      {dt && ` (${dt.getMonth() + 1}.${dt.getDate()})`}
    </div>
  );
}

/* ───────── 메인 ───────── */
export default function OosScheduleDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const [status, setStatus] = useState("전체");
  const [sheet, setSheet] = useState("전체");
  const [cat, setCat] = useState("전체");
  const [ch, setCh] = useState("전체");
  const [group, setGroup] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, c, chRows] = await Promise.all([
        fetchRows(OOS_SOURCES.general),
        fetchRows(OOS_SOURCES.coupang),
        fetchRows(OOS_SOURCES.channel).catch(() => []), // 구분 시트 실패해도 나머지는 표시
      ]);
      const channelMap = parseChannelMap(chRows);
      setData([...parseOos(g, "general", channelMap), ...parseOos(c, "coupang", channelMap)]);
      setUpdatedAt(new Date());
      setError("");
    } catch (e) {
      setError(e.message || "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const c = [0, 0, 0];
    data.forEach((d) => { c[d.st] += 1; });
    return c;
  }, [data]);

  const catCounts = useMemo(() => {
    const c = {};
    data.forEach((d) => { c[d.cat] = (c[d.cat] || 0) + 1; });
    return c;
  }, [data]);

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const etaKey = (r) => { const d = parseEta(r.eta); return d ? d.getTime() : 9e15; };
    const catOrder = (c) => { const i = CATS.indexOf(c); return i < 0 ? 99 : i; };
    return data
      .filter((d) =>
        (status === "전체" || STATUS[d.st] === status) &&
        (sheet === "전체" || d.sheet === sheet) &&
        (cat === "전체" || d.cat === cat) &&
        (ch === "전체" || d.ch === ch) &&
        (!k || d.name.toLowerCase().includes(k) || d.code.includes(k)))
      .sort((a, b) => (group ? catOrder(a.cat) - catOrder(b.cat) : 0) || a.st - b.st || etaKey(a) - etaKey(b));
  }, [data, status, sheet, cat, ch, group, q]);

  const kpis = [
    { key: "전체", label: "전체 품절 관련", value: data.length, cls: "border-slate-200 bg-white text-slate-700" },
    ...STATUS.map((s, i) => ({ key: s, label: s, value: counts[i], cls: STYLE[i].card })),
  ];
  const catOptions = [{ v: "전체", l: `전체 ${data.length}` }, ...CATS.map((c) => ({ v: c, l: `${c} ${catCounts[c] || 0}` }))];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">품절 현황 및 입고 예정 대시보드</h1>
          <p className="mt-1 text-sm text-slate-500">생산기획팀 품절 시트 통합 · 타 부서 공유용</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span>{updatedAt ? `${updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 업데이트` : "불러오는 중"}</span>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> 새로고침
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — 시트가 '웹에 게시'(CSV) 상태인지 확인하고 새로고침해 주세요.
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.key}
            onClick={() => setStatus(k.key)}
            className={`rounded-2xl border p-4 text-left shadow-sm transition hover:shadow-md ${k.cls} ${status === k.key ? "ring-2 ring-slate-800" : ""}`}
          >
            <div className="text-sm font-medium opacity-80">{k.label}</div>
            <div className="mt-2 text-3xl font-bold">
              {k.value}
              <span className="ml-1 text-base font-medium opacity-70">건</span>
            </div>
          </button>
        ))}
      </section>

      <section className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-4">
            <div className="mb-1.5 text-xs font-semibold text-slate-500">상태</div>
            <Pills value={status} onChange={setStatus} options={["전체", ...STATUS].map((v) => ({ v, l: v }))} />
          </div>
          <div className="lg:col-span-4">
            <div className="mb-1.5 text-xs font-semibold text-slate-500">출처 시트</div>
            <Pills
              value={sheet}
              onChange={setSheet}
              options={[{ v: "전체", l: "전체" }, { v: "general", l: "일반 채널" }, { v: "coupang", l: "로켓그로스" }]}
            />
          </div>
          <div className="lg:col-span-4">
            <div className="mb-1.5 text-xs font-semibold text-slate-500">검색</div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="품목명 또는 품목코드"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">카테고리</div>
            <Pills value={cat} onChange={setCat} options={catOptions} />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">마스크 구분</div>
            <Pills value={ch} onChange={setCh} options={["전체", "일반", "로켓"].map((v) => ({ v, l: v }))} />
          </div>
          <button
            onClick={() => setGroup(!group)}
            className={`self-start rounded-lg px-3 py-1.5 text-sm font-medium ring-1 lg:self-auto ${
              group ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200"
            }`}
          >
            카테고리별 묶어보기 {group ? "ON" : "OFF"}
          </button>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">품절 현황</h2>
          <span className="text-sm text-slate-500">{rows.length}건 · 상태 심각도 → 입고 예정일 순</span>
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                {["출처 시트", "카테고리", "품목코드", "품목명", "상태 / 예상소진", "현재고 / 소진기준량", "입고 예정일", "담당자 / 비고"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((d, i) => {
                const g = group && (i === 0 || rows[i - 1].cat !== d.cat) ? rows.filter((x) => x.cat === d.cat) : null;
                const pct = d.base > 0 ? Math.max(0, Math.min(100, Math.round((d.stock / d.base) * 100))) : 0;
                return (
                  <Fragment key={d.key}>
                    {g && (
                      <tr className="bg-slate-100">
                        <td colSpan={8} className="px-4 py-2 text-sm font-bold text-slate-700">
                          {d.cat || "기타"}
                          <span className="ml-2 text-xs font-medium text-slate-500">
                            {g.length}건 · 품절 {g.filter((x) => x.st === 0).length} / 경고 {g.filter((x) => x.st === 1).length} / 임박 {g.filter((x) => x.st === 2).length}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${d.sheet === "general" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"}`}>
                          {SHEET_LABEL[d.sheet]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {d.cat}
                        {d.ch && (
                          <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${d.ch === "로켓" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                            {d.ch}
                          </span>
                        )}
                        {d.minor && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">비주력</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.code}</td>
                      <td className="min-w-[240px] px-4 py-3 font-medium text-slate-900">{d.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STYLE[d.st].badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STYLE[d.st].dot}`} />
                          {STATUS[d.st]}
                        </span>
                        <Depletion days={d.days} date={d.depDate} />
                      </td>
                      <td className="w-44 px-4 py-3">
                        <div className="text-xs">
                          <b className={d.stock <= 0 ? "text-red-600" : "text-slate-800"}>{n(d.stock)}</b>
                          <span className="text-slate-400"> / {n(d.base)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                          <div className={`h-1.5 rounded-full ${STYLE[d.st].dot}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3"><Dday eta={d.eta} qty={d.qty} /></td>
                      <td className="min-w-[200px] px-4 py-3 text-xs text-slate-600">{d.memo || <span className="text-slate-300">-</span>}</td>
                    </tr>
                  </Fragment>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-400">조건에 맞는 항목이 없습니다.</td></tr>
              )}
              {loading && data.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-400">시트 데이터를 불러오는 중입니다…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-3 text-xs text-slate-400">
        ※ 현재고 = 시트의 일반 통합 재고(쿠팡 시트는 쿠팡 재고), 소진기준량 = 시트의 '소진 기준량'. 5분마다 자동 갱신됩니다.
      </p>
    </div>
  );
}
