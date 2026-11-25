import { memo, useState, type KeyboardEvent } from 'react';
import type { HourlyAirPoint } from '../types/air';

interface InversionChartProps {
  points: HourlyAirPoint[];
  ventilationStartHour: number;
  ventilationEndHour: number;
  city: string;
}

export const InversionChart = memo(function InversionChart({
  points,
  ventilationStartHour,
  ventilationEndHour,
  city,
}: InversionChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    const idx = points.findIndex((p) => p.hour === ventilationStartHour);
    return idx >= 0 ? idx : Math.floor(points.length / 2);
  });

  const width = 520;
  const height = 216;
  const padLeft = 38;
  const padRight = 14;
  const padTop = 24;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxPm = Math.max(80, ...points.map((p) => p.pm25)) * 1.12;
  const whoY = padTop + plotH - (15 / maxPm) * plotH;

  const coords = points.map((pt, idx) => {
    const x = padLeft + (idx / Math.max(1, points.length - 1)) * plotW;
    const y = padTop + plotH - (pt.pm25 / maxPm) * plotH;
    return { ...pt, x, y, idx };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    coords.length > 0
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`
      : '';

  const ventStartCoord = coords.find((c) => c.hour >= ventilationStartHour);
  const ventEndCoord = coords.find((c) => c.hour >= ventilationEndHour) ?? coords[coords.length - 1];

  const activePoint = coords[Math.min(selectedIndex, Math.max(0, coords.length - 1))];
  const yTicks = [0, Math.round(maxPm * 0.35), Math.round(maxPm * 0.7), Math.round(maxPm)];

  const handlePointKeyDown = (idx: number, e: KeyboardEvent<SVGCircleElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedIndex(idx);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSelectedIndex(Math.min(coords.length - 1, idx + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSelectedIndex(Math.max(0, idx - 1));
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          24-Hour Winter Thermal Inversion Curve
        </h2>
        <p className="text-sm text-slate-600">
          Estimated hourly outdoor PM2.5 (µg/m³) in {city}. Select or use arrow keys on any hour to inspect conditions.
        </p>
      </div>

      {activePoint && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 py-2.5 px-3.5 rounded-lg bg-[#F8FAFC] border border-slate-100"
        >
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
            {activePoint.label} · {activePoint.pm25} µg/m³
          </span>
          <span className="text-xs text-slate-600">
            {activePoint.inversionActive
              ? 'Inversion lid trapping surface emissions'
              : 'Midday mixing lifts smog layer'}
          </span>
        </div>
      )}

      <div className="w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none block"
          role="img"
          aria-label={`24-hour winter PM2.5 curve for ${city}`}
        >
          <defs>
            <linearGradient id="inversionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0F172A" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#0F172A" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {yTicks.map((tick) => {
            const y = padTop + plotH - (tick / maxPm) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 7}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[10px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Best midday ventilation window highlight */}
          {ventStartCoord && ventEndCoord && (
            <g>
              <rect
                x={ventStartCoord.x}
                y={padTop}
                width={Math.max(24, ventEndCoord.x - ventStartCoord.x)}
                height={plotH}
                fill="#0F766E"
                fillOpacity="0.10"
              />
              <text
                x={ventStartCoord.x + Math.max(24, ventEndCoord.x - ventStartCoord.x) / 2}
                y={padTop - 7}
                textAnchor="middle"
                className="fill-[#0F766E] font-medium text-[10px]"
              >
                Best airing window
              </text>
            </g>
          )}

          {/* WHO 24h guideline line (15 µg/m³) */}
          {whoY > padTop && whoY < padTop + plotH && (
            <g>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={whoY}
                y2={whoY}
                stroke="#15803D"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={width - padRight - 2}
                y={whoY - 5}
                textAnchor="end"
                className="fill-[#15803D] font-mono text-[9.5px]"
              >
                WHO 24h (15 µg/m³)
              </text>
            </g>
          )}

          {/* Area & Line */}
          <path d={areaPath} fill="url(#inversionFill)" />
          <path
            d={linePath}
            fill="none"
            stroke="#0F172A"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Interactive keyboard-accessible nodes */}
          {coords.map((pt) => {
            const isSelected = activePoint?.idx === pt.idx;
            const isVent = pt.hour >= ventilationStartHour && pt.hour <= ventilationEndHour;
            return (
              <g key={pt.hour}>
                {isSelected && (
                  <line
                    x1={pt.x}
                    x2={pt.x}
                    y1={padTop}
                    y2={padTop + plotH}
                    stroke="#0F766E"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isSelected ? 5.5 : 3.5}
                  fill={isVent ? '#0F766E' : '#0F172A'}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${pt.label}: ${pt.pm25} micrograms per cubic meter PM2.5, ${
                    pt.inversionActive ? 'inversion trapping active' : 'midday mixing window'
                  }`}
                  className="cursor-pointer focus:outline-none"
                  onClick={() => setSelectedIndex(pt.idx)}
                  onMouseEnter={() => setSelectedIndex(pt.idx)}
                  onFocus={() => setSelectedIndex(pt.idx)}
                  onKeyDown={(e) => handlePointKeyDown(pt.idx, e)}
                />
                <text
                  x={pt.x}
                  y={height - 9}
                  textAnchor="middle"
                  className={`font-mono text-[10px] ${
                    isSelected ? 'fill-slate-900 font-semibold' : 'fill-slate-500'
                  }`}
                >
                  {pt.label.slice(0, 2)}h
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="space-y-1 text-xs text-slate-500 pt-3 border-t border-slate-100">
        <div>Peak trapping: 18:00 – 09:00</div>
        <div>Shaded pine band: Optimal 10-min cross-ventilation window</div>
        <div>Dashed green line: WHO 24-hour PM2.5 guideline (15 µg/m³)</div>
      </div>
    </div>
  );
});
