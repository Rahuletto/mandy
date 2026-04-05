import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { curveLinear } from "@vx/curve";
import {
  AxisBottom,
  AxisLeft,
  Bar,
  GlyphCircle,
  GridColumns,
  GridRows,
  Group,
  LinePath,
  ParentSize,
  scaleBand,
  scaleLinear,
} from "@vx/vx";
import {
  TbArrowDown,
  TbArrowUp,
  TbChevronDown,
  TbChevronRight,
  TbCircleCheck,
  TbCircleX,
  TbEye,
  TbEyeOff,
  TbFilter,
  TbSearch,
  TbTrash,
} from "react-icons/tb";
import type { MQTTMessage } from "../../types/project";
import { CodeViewer } from "../CodeMirror";
import { AutocompleteInput, TabView } from "../ui";

interface MQTTMessageListProps {
  messages: MQTTMessage[];
  status: "connected" | "connecting" | "disconnected";
  onClear: () => void;
}

type MessageFilter = "all" | "sent" | "received";

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/** Stable HSL color from the MQTT topic string only (case-sensitive). */
function mqttColorFromTitle(title: string, variant: 0 | 1 = 0): string {
  const input = title || "";
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  }
  const h = hash >>> 0;
  const hue = variant === 0 ? h % 360 : (h % 360 + 137) % 360;
  const lightness = variant === 0 ? 58 : 52;
  return `hsl(${hue}, 70%, ${lightness}%)`;
}

function getTopicBadgeStyle(topic: string): CSSProperties {
  return {
    backgroundColor: mqttColorFromTitle(topic, 0),
    color: "var(--color-background, #0a0a0a)",
  };
}

function matchesFilter(message: MQTTMessage, filter: MessageFilter): boolean {
  if (filter === "all") return true;
  if (filter === "sent") return message.direction === "send";
  return message.direction === "receive";
}

function getMessageIcon(message: MQTTMessage) {
  if (message.direction === "system" && message.data.startsWith("Connected")) {
    return <TbCircleCheck size={14} className="text-green" />;
  }
  if (message.direction === "system" && message.data.startsWith("Disconnected")) {
    return <TbCircleX size={14} className="text-red" />;
  }
  if (message.direction === "send") {
    return <TbArrowUp size={14} className="text-accent" />;
  }
  return <TbArrowDown size={14} className="text-emerald-400" />;
}

function extractNumericFields(
  value: unknown,
  prefix = "",
  acc: Array<{ path: string; value: number }> = [],
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    acc.push({ path: prefix, value });
    return acc;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return acc;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    extractNumericFields(nested, nextPath, acc);
  }

  return acc;
}

type ChartType = "line" | "bar";
type SeriesPoint = { id: string; timestamp: number; value: number };
/** `key` is the JSON field path (stable id for legend toggles). */
type SeriesConfig = { key: string; label: string; color: string; points: SeriesPoint[] };

const CHART_ANIM_MS = 340;

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function interpolateSeriesConfig(from: SeriesConfig[], to: SeriesConfig[], t: number): SeriesConfig[] {
  return to.map((entry) => {
    const fromEntry = from.find((e) => e.key === entry.key);
    const points = entry.points.map((pt, i) => {
      const prevPt = fromEntry?.points[i];
      const fp = fromEntry?.points;
      const fallback =
        fp && fp.length > 0 ? fp[fp.length - 1] : undefined;
      const fromVal = prevPt?.value ?? fallback?.value ?? pt.value;
      const v = fromVal + (pt.value - fromVal) * t;
      return { ...pt, value: v };
    });
    return { ...entry, points };
  });
}

function useAnimatedSeries(series: SeriesConfig[]): SeriesConfig[] {
  const safeSeries = series ?? [];
  const [display, setDisplay] = useState<SeriesConfig[]>(safeSeries);
  const displayRef = useRef<SeriesConfig[]>(safeSeries);
  const rafRef = useRef(0);

  useEffect(() => {
    const target = series ?? [];
    const from = displayRef.current;
    let start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const u = Math.min(1, elapsed / CHART_ANIM_MS);
      if (u >= 1) {
        displayRef.current = target;
        setDisplay(target);
        return;
      }
      const next = interpolateSeriesConfig(from, target, easeOutCubic(u));
      displayRef.current = next;
      setDisplay(next);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [series]);

  return display ?? safeSeries;
}

const CHART_GRID_STROKE = "rgba(255,255,255,0.07)";
const CHART_GRID_COL_STROKE = "rgba(255,255,255,0.055)";
const CHART_ZERO_STROKE = "rgba(255,255,255,0.2)";

const CHART_MARGIN = {
  top: 20,
  right: 20,
  bottom: 34,
  left: 48,
} as const;

function formatChartTick(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
}

function getYDomain(series: SeriesConfig[]) {
  const values = series.flatMap((entry) => entry.points.map((point) => point.value));
  if (values.length === 0) {
    return [0, 1] as const;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    return [min - padding, max + padding] as const;
  }

  const padding = (max - min) * 0.12;
  return [min - padding, max + padding] as const;
}

interface ChartTooltip {
  x: number;
  y: number;
  timestamp: number;
  entries: Array<{ label: string; value: number; color: string }>;
}

function ChartTooltipOverlay({ tooltip }: { tooltip: ChartTooltip | null }) {
  if (!tooltip || tooltip.entries.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: tooltip.x, top: tooltip.y - 10 }}
    >
      <div className="rounded-lg border border-white/10 bg-card px-2.5 py-1.5 shadow-xl shadow-black/40">
        <p className="mb-1.5 border-b border-white/8 pb-1 font-mono text-[10px] text-white/45">
          {formatChartTick(tooltip.timestamp)}
        </p>
        <div className="space-y-1">
          {tooltip.entries.map((entry) => (
            <div key={entry.label} className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-white/70">{entry.label}</span>
              <span className="font-mono text-xs font-semibold text-white tabular-nums">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MqttLineChartSvg({
  width,
  height,
  series,
  displaySeries,
  onHover,
  containerRef,
}: {
  width: number;
  height: number;
  series: SeriesConfig[];
  /** Interpolated series for smooth path/circle motion */
  displaySeries?: SeriesConfig[];
  onHover?: (tooltip: ChartTooltip | null) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const plotDisplay = displaySeries ?? series;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const maxPoints = Math.max(0, ...series.map((entry) => entry.points.length));
  const [minValue, maxValue] = getYDomain(series);

  if (width <= 0 || height <= 0) {
    return null;
  }

  const innerWidth = Math.max(width - CHART_MARGIN.left - CHART_MARGIN.right, 1);
  const innerHeight = Math.max(height - CHART_MARGIN.top - CHART_MARGIN.bottom, 1);

  const xMax = Math.max(maxPoints - 1, 1);
  const xScale = scaleLinear<number>({
    domain: [0, xMax],
    range: [0, innerWidth],
  });
  const yScale = scaleLinear<number>({
    domain: [minValue, maxValue],
    range: [innerHeight, 0],
    nice: true,
  });
  const zeroY = yScale(0) ?? innerHeight;
  const showZeroLine =
    Number.isFinite(zeroY) && zeroY >= 0 && zeroY <= innerHeight && minValue < 0 && maxValue > 0;

  const pushTooltipAtIndex = (index: number, clientX: number, clientY: number) => {
    if (!containerRef?.current || index < 0 || index >= maxPoints) {
      onHover?.(null);
      return;
    }
    const entries: ChartTooltip["entries"] = [];
    let timestamp = 0;
    for (const entry of series) {
      const pt = entry.points[index];
      if (pt) {
        entries.push({ label: entry.label, value: pt.value, color: entry.color });
        if (!timestamp) timestamp = pt.timestamp;
      }
    }
    if (entries.length === 0) {
      onHover?.(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    onHover?.({
      x: clientX - rect.left,
      y: clientY - rect.top,
      timestamp,
      entries,
    });
  };

  const handleOverlayMove = (e: React.MouseEvent<SVGRectElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - bounds.left;
    const raw = xScale.invert(localX);
    const index = Math.max(0, Math.min(maxPoints - 1, Math.round(raw)));
    setHoverIndex(index);
    pushTooltipAtIndex(index, e.clientX, e.clientY);
  };

  const handleOverlayLeave = () => {
    setHoverIndex(null);
    onHover?.(null);
  };

  return (
    <svg width={width} height={height} onMouseLeave={handleOverlayLeave}>
      <Group left={CHART_MARGIN.left} top={CHART_MARGIN.top}>
        <GridRows
          scale={yScale}
          width={innerWidth}
          numTicks={4}
          stroke={CHART_GRID_STROKE}
          strokeDasharray="4,4"
        />
        <GridColumns
          scale={xScale}
          height={innerHeight}
          numTicks={Math.min(8, Math.max(2, maxPoints))}
          tickValues={
            maxPoints <= 16 && maxPoints > 1
              ? Array.from({ length: maxPoints }, (_, i) => i)
              : undefined
          }
          stroke={CHART_GRID_COL_STROKE}
          strokeDasharray="3,5"
        />
        {showZeroLine && (
          <line
            x1={0}
            x2={innerWidth}
            y1={zeroY}
            y2={zeroY}
            stroke={CHART_ZERO_STROKE}
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        {plotDisplay.map((entry) =>
          entry.points.length > 0 ? (
            <g key={entry.key}>
              <LinePath
                data={entry.points.map((point, i) => ({ ...point, index: i }))}
                x={(point) => xScale(point.index) ?? 0}
                y={(point) => yScale(point.value) ?? 0}
                stroke={entry.color}
                strokeWidth={2.5}
                curve={curveLinear}
                fill="none"
                strokeLinejoin="miter"
                strokeLinecap="square"
              />
              {entry.points.map((point, i) => (
                <GlyphCircle
                  key={point.id}
                  left={xScale(i) ?? 0}
                  top={yScale(point.value) ?? 0}
                  size={34}
                  fill={entry.color}
                  stroke="rgba(10,10,10,0.95)"
                  strokeWidth={1.5}
                  className="pointer-events-none"
                />
              ))}
            </g>
          ) : null,
        )}
        {hoverIndex !== null && maxPoints > 0 && (
          <line
            x1={xScale(hoverIndex) ?? 0}
            x2={xScale(hoverIndex) ?? 0}
            y1={0}
            y2={innerHeight}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        <AxisLeft
          scale={yScale}
          numTicks={4}
          stroke="rgba(255,255,255,0.14)"
          tickStroke="rgba(255,255,255,0.14)"
          tickLabelProps={() => ({
            fill: "rgba(255,255,255,0.45)",
            fontSize: 10,
            fontFamily: "monospace",
            textAnchor: "end",
            dx: "-0.4em",
            dy: "0.25em",
          })}
        />
        <AxisBottom
          top={innerHeight}
          scale={xScale}
          numTicks={Math.min(5, maxPoints)}
          stroke="rgba(255,255,255,0.14)"
          tickStroke="rgba(255,255,255,0.14)"
          tickFormat={(value) => `#${Math.round(Number(value)) + 1}`}
          tickLabelProps={() => ({
            fill: "rgba(255,255,255,0.45)",
            fontSize: 10,
            fontFamily: "monospace",
            textAnchor: "middle",
            dy: "0.9em",
          })}
        />
        <rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={handleOverlayMove}
          onMouseEnter={handleOverlayMove}
        />
      </Group>
    </svg>
  );
}

function MqttLineChart({
  series,
  displaySeries,
  onHover,
  containerRef,
}: {
  series: SeriesConfig[];
  displaySeries?: SeriesConfig[];
  onHover?: (tooltip: ChartTooltip | null) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <ParentSize className="h-full w-full">
      {({ width, height }) => (
        <MqttLineChartSvg
          width={width}
          height={height}
          series={series}
          displaySeries={displaySeries ?? series}
          onHover={onHover}
          containerRef={containerRef}
        />
      )}
    </ParentSize>
  );
}

function MqttBarChartSvg({
  width,
  height,
  series,
  displaySeries,
  onHover,
  containerRef,
}: {
  width: number;
  height: number;
  series: SeriesConfig[];
  displaySeries?: SeriesConfig[];
  onHover?: (tooltip: ChartTooltip | null) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const plotDisplay = displaySeries ?? series;
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const maxPoints = Math.max(0, ...series.map((entry) => entry.points.length));
  const rows = Array.from({ length: maxPoints }, (_, index) => ({
    index,
    label: `${index + 1}`,
  }));
  const [domainLo, domainHi] = getYDomain(series);
  const minValue = Math.min(domainLo, 0);
  const maxValue = Math.max(domainHi, 0, 1);

  if (width <= 0 || height <= 0) {
    return null;
  }

  const innerWidth = Math.max(width - CHART_MARGIN.left - CHART_MARGIN.right, 1);
  const innerHeight = Math.max(height - CHART_MARGIN.top - CHART_MARGIN.bottom, 1);
  const xScale = scaleBand<string>({
    domain: rows.map((row) => row.label),
    range: [0, innerWidth],
    padding: 0.24,
  });
  const seriesScale = scaleBand<string>({
    domain: series.map((entry) => entry.key),
    range: [0, xScale.bandwidth()],
    padding: 0.18,
  });
  const yScale = scaleLinear<number>({
    domain: [minValue, maxValue],
    range: [innerHeight, 0],
    nice: true,
  });
  const zeroY = yScale(0) ?? innerHeight;
  const showZeroLine =
    Number.isFinite(zeroY) &&
    zeroY >= 0 &&
    zeroY <= innerHeight &&
    minValue < 0 &&
    maxValue > 0;

  const pushBarTooltip = (rowIdx: number, clientX: number, clientY: number) => {
    if (!containerRef?.current || rowIdx < 0 || rowIdx >= rows.length) {
      onHover?.(null);
      return;
    }
    const row = rows[rowIdx];
    const entries: ChartTooltip["entries"] = [];
    let timestamp = 0;
    for (const entry of series) {
      const point = entry.points[row.index];
      if (point) {
        entries.push({ label: entry.label, value: point.value, color: entry.color });
        if (!timestamp) timestamp = point.timestamp;
      }
    }
    if (entries.length === 0) {
      onHover?.(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    onHover?.({
      x: clientX - rect.left,
      y: clientY - rect.top,
      timestamp,
      entries,
    });
  };

  const handleOverlayMove = (e: React.MouseEvent<SVGRectElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - bounds.left;
    let found: number | null = null;
    for (let i = 0; i < rows.length; i += 1) {
      const gx = xScale(rows[i].label);
      if (gx === undefined) continue;
      if (localX >= gx && localX <= gx + xScale.bandwidth()) {
        found = i;
        break;
      }
    }
    setHoverRow(found);
    if (found !== null) {
      pushBarTooltip(found, e.clientX, e.clientY);
    } else {
      onHover?.(null);
    }
  };

  const handleOverlayLeave = () => {
    setHoverRow(null);
    onHover?.(null);
  };

  const crosshairX =
    hoverRow !== null
      ? (() => {
          const gx = xScale(rows[hoverRow].label);
          if (gx === undefined) return null;
          return gx + xScale.bandwidth() / 2;
        })()
      : null;

  const barTransition = `${CHART_ANIM_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`;

  return (
    <svg width={width} height={height} onMouseLeave={handleOverlayLeave}>
      <Group left={CHART_MARGIN.left} top={CHART_MARGIN.top}>
        <GridRows
          scale={yScale}
          width={innerWidth}
          numTicks={4}
          stroke={CHART_GRID_STROKE}
          strokeDasharray="4,4"
        />
        {rows.map((row) => {
          const groupX = xScale(row.label);
          if (groupX === undefined) {
            return null;
          }
          return (
            <line
              key={`v-${row.label}`}
              x1={groupX}
              x2={groupX}
              y1={0}
              y2={innerHeight}
              stroke={CHART_GRID_COL_STROKE}
              strokeDasharray="3,5"
              pointerEvents="none"
            />
          );
        })}
        {showZeroLine && (
          <line
            x1={0}
            x2={innerWidth}
            y1={zeroY}
            y2={zeroY}
            stroke={CHART_ZERO_STROKE}
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        {rows.map((row) => {
          const groupX = xScale(row.label);
          if (groupX === undefined) {
            return null;
          }

          return (
            <g key={row.label}>
              {series.map((entry) => {
                const point = entry.points[row.index];
                if (!point) {
                  return null;
                }
                const disp = plotDisplay.find((e) => e.key === entry.key)?.points[row.index];
                const v = disp?.value ?? point.value;
                const barX = groupX + (seriesScale(entry.key) ?? 0);
                const barY = yScale(Math.max(v, 0)) ?? zeroY;
                const barBottom = yScale(Math.min(v, 0)) ?? zeroY;
                return (
                  <Bar
                    key={`${row.label}-${entry.key}`}
                    x={barX}
                    y={Math.min(barY, barBottom)}
                    width={Math.max(seriesScale.bandwidth(), 2)}
                    height={Math.max(Math.abs(barBottom - barY), 2)}
                    fill={entry.color}
                    rx={0}
                    className="pointer-events-none"
                    style={{
                      transition: `x ${barTransition}, y ${barTransition}, height ${barTransition}`,
                    }}
                  />
                );
              })}
            </g>
          );
        })}
        {crosshairX !== null && (
          <line
            x1={crosshairX}
            x2={crosshairX}
            y1={0}
            y2={innerHeight}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        <AxisLeft
          scale={yScale}
          numTicks={4}
          stroke="rgba(255,255,255,0.14)"
          tickStroke="rgba(255,255,255,0.14)"
          tickLabelProps={() => ({
            fill: "rgba(255,255,255,0.45)",
            fontSize: 10,
            fontFamily: "monospace",
            textAnchor: "end",
            dx: "-0.4em",
            dy: "0.25em",
          })}
        />
        <AxisBottom
          top={innerHeight}
          scale={xScale}
          numTicks={Math.min(6, rows.length)}
          stroke="rgba(255,255,255,0.14)"
          tickStroke="rgba(255,255,255,0.14)"
          tickLabelProps={() => ({
            fill: "rgba(255,255,255,0.45)",
            fontSize: 10,
            fontFamily: "monospace",
            textAnchor: "middle",
            dy: "0.9em",
          })}
        />
        <rect
          x={0}
          y={0}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={handleOverlayMove}
          onMouseEnter={handleOverlayMove}
        />
      </Group>
    </svg>
  );
}

function MqttBarChart({
  series,
  displaySeries,
  onHover,
  containerRef,
}: {
  series: SeriesConfig[];
  displaySeries?: SeriesConfig[];
  onHover?: (tooltip: ChartTooltip | null) => void;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <ParentSize className="h-full w-full">
      {({ width, height }) => (
        <MqttBarChartSvg
          width={width}
          height={height}
          series={series}
          displaySeries={displaySeries ?? series}
          onHover={onHover}
          containerRef={containerRef}
        />
      )}
    </ParentSize>
  );
}

function TopicChart({
  topic,
  messages,
}: {
  topic: string;
  messages: MQTTMessage[];
}) {
  const [chartType, setChartType] = useState<ChartType>("line");
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);
  const [seriesVisible, setSeriesVisible] = useState<Record<string, boolean>>({});
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const fieldSuggestions = useMemo(() => {
    const fields = new Set<string>();
    for (const message of messages) {
      try {
        const parsed = JSON.parse(message.data);
        for (const entry of extractNumericFields(parsed)) {
          if (entry.path) fields.add(entry.path);
        }
      } catch {
        continue;
      }
    }
    return Array.from(fields).sort((a, b) => a.localeCompare(b));
  }, [messages]);

  const chartSeries = useMemo<SeriesConfig[]>(() => {
    const collect = (fieldPath: string) => {
      if (!fieldPath) return [];
      const points: SeriesPoint[] = [];
      for (const message of messages) {
        try {
          const parsed = JSON.parse(message.data);
          const match = extractNumericFields(parsed).find((entry) => entry.path === fieldPath);
          if (match) {
            points.push({ id: message.id, timestamp: message.timestamp, value: match.value });
          }
        } catch {
          continue;
        }
      }
      return points;
    };

    return fieldSuggestions
      .map((fieldPath, i) => ({
        key: fieldPath,
        label: fieldPath,
        color: mqttColorFromTitle(`${topic}\0${fieldPath}`, (i % 2) as 0 | 1),
        points: collect(fieldPath),
      }))
      .filter((entry) => entry.points.length > 0);
  }, [messages, fieldSuggestions, topic]);

  useEffect(() => {
    setSeriesVisible((prev) => {
      const next = { ...prev };
      for (const entry of chartSeries) {
        if (next[entry.key] === undefined) next[entry.key] = true;
      }
      for (const k of Object.keys(next)) {
        if (!chartSeries.some((e) => e.key === k)) delete next[k];
      }
      return next;
    });
  }, [chartSeries]);

  const animatedSeries = useAnimatedSeries(chartSeries);

  const filteredChartSeries = useMemo(
    () => chartSeries.filter((entry) => seriesVisible[entry.key]),
    [chartSeries, seriesVisible],
  );
  const filteredAnimated = useMemo(
    () => animatedSeries.filter((entry) => seriesVisible[entry.key]),
    [animatedSeries, seriesVisible],
  );

  const hasData = chartSeries.some((entry) => entry.points.length > 0);

  return (
    <div className="rounded-xl border border-white/6 bg-background/30 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
            style={getTopicBadgeStyle(topic)}
          >
            {topic}
          </span>
          <span className="text-[10px] text-white/30">{messages.length} msgs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChartType("line")}
            title="Line chart"
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors cursor-pointer ${
              chartType === "line" ? "bg-accent/15 text-accent" : "text-white/35 hover:text-white/60"
            }`}
            aria-label="Line chart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 20 7 12 12 16 17 6 21 10" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setChartType("bar")}
            title="Bar chart"
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors cursor-pointer ${
              chartType === "bar" ? "bg-accent/15 text-accent" : "text-white/35 hover:text-white/60"
            }`}
            aria-label="Bar chart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="6" width="4" height="15" rx="1" />
              <rect x="17" y="2" width="4" height="19" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center px-4 py-8 text-xs text-white/30">
          No numeric JSON fields to chart yet.
        </div>
      ) : filteredChartSeries.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center px-4 py-8 text-center text-xs text-white/40">
          All series are hidden. Turn one on in the legend below.
        </div>
      ) : (
        <div ref={chartContainerRef} className="relative h-56 px-2 py-2">
          {chartType === "line" ? (
            <MqttLineChart
              series={filteredChartSeries}
              displaySeries={filteredAnimated}
              onHover={setTooltip}
              containerRef={chartContainerRef}
            />
          ) : (
            <MqttBarChart
              series={filteredChartSeries}
              displaySeries={filteredAnimated}
              onHover={setTooltip}
              containerRef={chartContainerRef}
            />
          )}
          <ChartTooltipOverlay tooltip={tooltip} />
        </div>
      )}

      {chartSeries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 px-3 py-2 text-[11px] text-white/45">
          {chartSeries.map((entry) => {
            const on = seriesVisible[entry.key];
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() =>
                  setSeriesVisible((prev) => ({
                    ...prev,
                    [entry.key]: !prev[entry.key],
                  }))
                }
                className={`inline-flex max-w-[min(100%,240px)] items-center gap-1.5 rounded-md border px-2 py-1 transition-colors cursor-pointer ${
                  on
                    ? "border-white/10 bg-white/[0.04] text-white/80 hover:bg-white/[0.07]"
                    : "border-white/6 bg-transparent text-white/35 hover:bg-white/[0.03]"
                }`}
                title={on ? "Hide from chart" : "Show on chart"}
              >
                {on ? (
                  <TbEye size={14} className="shrink-0 text-white/55" aria-hidden />
                ) : (
                  <TbEyeOff size={14} className="shrink-0 opacity-50" aria-hidden />
                )}
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                <span
                  className={`min-w-0 truncate font-mono ${on ? "text-white/80" : "line-through text-white/35"}`}
                >
                  {entry.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MqttVisualization({
  messages,
  topicSuggestions,
}: {
  messages: MQTTMessage[];
  topicSuggestions: string[];
}) {
  const topicGroups = useMemo(() => {
    const groups = new Map<string, MQTTMessage[]>();
    for (const message of messages) {
      if (message.direction !== "receive") continue;
      const existing = groups.get(message.topic);
      if (existing) existing.push(message);
      else groups.set(message.topic, [message]);
    }
    return groups;
  }, [messages]);

  const topics = useMemo(
    () => (topicSuggestions.length > 0 ? topicSuggestions : Array.from(topicGroups.keys()).sort()),
    [topicSuggestions, topicGroups],
  );

  if (topics.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/35">
        No MQTT traffic yet. Subscribe to a topic or publish a message to start the stream.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4 space-y-4">
      {topics.map((topic) => {
        const topicMessages = topicGroups.get(topic) || [];
        if (topicMessages.length === 0) return null;
        return (
          <TopicChart
            key={topic}
            topic={topic}
            messages={topicMessages}
          />
        );
      })}
      {topics.every((topic) => !(topicGroups.get(topic)?.length)) && (
        <div className="flex items-center justify-center px-6 py-8 text-sm text-white/35">
          Waiting for messages on subscribed topics...
        </div>
      )}
    </div>
  );
}

export function MQTTMessageList({
  messages,
  status,
  onClear,
}: MQTTMessageListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");
  const [paneTab, setPaneTab] = useState<"messages" | "visualize">("messages");
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [followOutput, setFollowOutput] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cycleFilter = () => {
    setFilter((prev) =>
      prev === "all" ? "sent" : prev === "sent" ? "received" : "all",
    );
  };

  const topicSuggestions = useMemo(
    () =>
      Array.from(new Set(messages.map((message) => message.topic).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [messages],
  );

  const filteredMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return messages.filter((message) => {
      if (!matchesFilter(message, filter)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        message.topic.toLowerCase().includes(query) ||
        message.data.toLowerCase().includes(query)
      );
    });
  }, [filter, messages, searchQuery]);

  useEffect(() => {
    if (!followOutput || !scrollerRef.current) return;
    scrollerRef.current.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [filteredMessages, followOutput]);

  const handleScroll = () => {
    const element = scrollerRef.current;
    if (!element) return;
    const nextIsAtBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 24;
    setIsAtBottom((prev) => (prev === nextIsAtBottom ? prev : nextIsAtBottom));
    if (!nextIsAtBottom && followOutput) {
      setFollowOutput(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-inset">
      <div className="flex items-center gap-4 p-2 px-4 border-b border-white/5 shrink-0">
        <TabView
          tabs={[
            { id: "messages", label: "Messages" },
            { id: "visualize", label: "Charts", title: "Topic graphs (numeric JSON)" },
          ]}
          activeTab={paneTab}
          onTabChange={(tabId) => setPaneTab(tabId as "messages" | "visualize")}
        />
        <div className="flex-1" />
        <div
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1.5 ${
            status === "connected"
              ? "bg-green/15 text-green"
              : status === "connecting"
                ? "bg-yellow/15 text-yellow"
                : "bg-white/5 text-white/40"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              status === "connected"
                ? "bg-green"
                : status === "connecting"
                  ? "bg-yellow animate-pulse"
                  : "bg-white/20"
            }`}
          />
          {status === "connected"
            ? "Connected"
            : status === "connecting"
              ? "Connecting..."
              : "Disconnected"}
        </div>
      </div>

      {paneTab === "messages" && (
        <div className="border-b border-white/5 px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-lg bg-inputbox px-3">
              <TbSearch size={14} className="shrink-0 text-white/35" />
              <AutocompleteInput
                value={searchQuery}
                onChange={setSearchQuery}
                suggestions={topicSuggestions}
                placeholder="Search topics or payloads"
                className="min-w-0 flex-1"
                inputClassName="w-full px-2 py-2 text-xs font-mono text-white outline-none placeholder:text-white/20"
                renderSuggestion={(suggestion) => (
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="truncate rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                      style={getTopicBadgeStyle(suggestion)}
                    >
                      {suggestion}
                    </span>
                    <span className="truncate text-[11px] text-white/35">topic</span>
                  </div>
                )}
              />
            </div>
            <button
              type="button"
              onClick={cycleFilter}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white/70 transition-colors rounded-md hover:bg-white/5 cursor-pointer"
            >
              <TbFilter size={13} />
              {filter === "all"
                ? "All Messages"
                : filter === "sent"
                  ? "Sent"
                  : "Received"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Clear MQTT messages"
            >
              <TbTrash size={16} />
            </button>
          </div>
        </div>
      )}

      {paneTab === "visualize" ? (
        <MqttVisualization messages={messages} topicSuggestions={topicSuggestions} />
      ) : (
      <div ref={scrollerRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/35">
            No MQTT traffic yet. Subscribe to a topic or publish a message to start the stream.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredMessages.map((message) => {
              const isExpanded = expandedMessages.has(message.id);
              return (
                <div key={message.id} className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedMessages((prev) => {
                        const next = new Set(prev);
                        if (next.has(message.id)) next.delete(message.id);
                        else next.add(message.id);
                        return next;
                      })
                    }
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="shrink-0">{getMessageIcon(message)}</span>
                    {message.direction !== "system" && (
                      <span
                        className="max-w-[180px] shrink-0 truncate rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                        style={getTopicBadgeStyle(message.topic)}
                      >
                        {message.topic}
                      </span>
                    )}
                    {message.retain && (
                      <span className="shrink-0 rounded-full bg-yellow/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-yellow">
                        RETAIN
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/80">
                      {message.data}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-white/30">
                      {formatTimestamp(message.timestamp)}
                    </span>
                    {isExpanded ? (
                      <TbChevronDown size={14} className="shrink-0 text-white/25" />
                    ) : (
                      <TbChevronRight size={14} className="shrink-0 text-white/25" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-2 pb-2 pt-1">
                      {(() => {
                        try {
                          const parsed = JSON.parse(message.data);
                          return (
                            <div className="overflow-hidden rounded-xl border border-white/6 bg-white/[0.02] text-[11px]">
                              <CodeViewer
                                code={JSON.stringify(parsed, null, 2)}
                                language="json"
                              />
                            </div>
                          );
                        } catch {
                          return (
                            <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
                              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-white/70">
                                {message.data}
                              </pre>
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isAtBottom && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setFollowOutput(true);
                scrollerRef.current?.scrollTo({
                  top: scrollerRef.current.scrollHeight,
                  behavior: "smooth",
                });
              }}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-card/95 text-white shadow-lg shadow-black/30 transition-colors hover:border-white/20 hover:text-accent"
              aria-label="Jump to latest MQTT message"
            >
              <TbArrowDown size={18} />
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
