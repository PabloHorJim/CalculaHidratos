import React, { useMemo, useState } from 'react';
import { Reading } from '../../glucose/sources';

export interface ChartEvent { time: number; kind: 'meal' | 'dose'; label: string }

interface Props {
    readings: Reading[];
    events: ChartEvent[];
    targetBg: number;
    hypoThreshold: number;
    now: number;
    hours?: number;
}

const W = 340, H = 190, LEFT = 30, RIGHT = 8, TOP = 8, PLOT_BOTTOM = 132, LANE_MEAL = 152, LANE_DOSE = 172;
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Sensor glucose over the last hours, with meals and insulin doses on two lanes below
 * the plot (one y axis only). Touch or hover to read a value; the same data is available
 * as a table for screen readers.
 */
export function GlucoseChart({ readings, events, targetBg, hypoThreshold, now, hours = 6 }: Props) {
    const [hover, setHover] = useState<number | null>(null);
    const start = now - hours * 3600 * 1000;
    const points = useMemo(() => readings.filter(r => r.time >= start && r.time <= now + 60000), [readings, start, now]);
    const shown = useMemo(() => events.filter(e => e.time >= start && e.time <= now), [events, start, now]);

    if (points.length < 2) return null;

    const max = Math.max(200, Math.ceil(Math.max(...points.map(p => p.mgdl)) / 50) * 50);
    const min = 40;
    const x = (t: number) => LEFT + ((t - start) / (now - start)) * (W - LEFT - RIGHT);
    const y = (v: number) => TOP + (1 - (Math.min(max, Math.max(min, v)) - min) / (max - min)) * (PLOT_BOTTOM - TOP);

    // Break the line where the sensor stopped reporting for more than 20 minutes
    let path = '';
    points.forEach((p, i) => {
        const gap = i === 0 || p.time - points[i - 1].time > 20 * 60 * 1000;
        path += `${gap ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.mgdl).toFixed(1)} `;
    });

    const ticks = [hypoThreshold, targetBg, 180, max].filter((v, i, all) => v <= max && all.indexOf(v) === i);
    const hourTicks: number[] = [];
    const first = new Date(start); first.setMinutes(0, 0, 0);
    for (let t = first.getTime() + 3600000; t < now; t += 3600000) hourTicks.push(t);

    const nearest = hover === null ? null : points.reduce((best, p) => (Math.abs(p.time - hover) < Math.abs(best.time - hover) ? p : best));
    const last = points[points.length - 1];

    const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        const px = ((event.clientX - box.left) / box.width) * W;
        setHover(start + ((px - LEFT) / (W - LEFT - RIGHT)) * (now - start));
    };

    const ink = 'fill-gray-600 dark:fill-gray-300';
    const lineColor = 'stroke-[#0891b2] dark:stroke-[#0ea5c4]';
    const mealColor = 'fill-[#c2410c] dark:fill-[#ea580c]';
    const doseColor = 'fill-[#6d28d9] dark:fill-[#8b5cf6]';

    return (
        <figure className="bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700">
            <figcaption className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-1 flex justify-between">
                <span>Glucosa del sensor · últimas {hours} h (mg/dL)</span>
                <span className="font-normal text-gray-600 dark:text-gray-300">
                    {nearest ? `${clock(nearest.time)} · ${nearest.mgdl}` : `ahora ${last.mgdl}`}
                </span>
            </figcaption>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y select-none" role="img"
                aria-label={`Gráfica de glucosa de las últimas ${hours} horas. Último valor ${last.mgdl} mg/dL a las ${clock(last.time)}.`}
                onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
                {/* target range band */}
                <rect x={LEFT} y={y(180)} width={W - LEFT - RIGHT} height={y(hypoThreshold) - y(180)} className="fill-gray-100 dark:fill-gray-700/60" />
                {ticks.map(v => (
                    <g key={v}>
                        <line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} className="stroke-gray-200 dark:stroke-gray-600" strokeWidth={1}
                            strokeDasharray={v === targetBg ? '3 3' : undefined} />
                        <text x={LEFT - 4} y={y(v) + 3} textAnchor="end" fontSize={9} className={ink}>{v}</text>
                    </g>
                ))}
                {hourTicks.map(t => (
                    <text key={t} x={x(t)} y={PLOT_BOTTOM + 11} textAnchor="middle" fontSize={9} className={ink}>{new Date(t).getHours()}h</text>
                ))}
                <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className={lineColor} />
                <circle cx={x(last.time)} cy={y(last.mgdl)} r={4} className={`${lineColor} fill-white dark:fill-gray-800`} strokeWidth={2} />

                {/* event lanes: shape and label carry the meaning, not only the color */}
                <text x={LEFT - 4} y={LANE_MEAL + 3} textAnchor="end" fontSize={8} className={ink}>HC</text>
                <text x={LEFT - 4} y={LANE_DOSE + 3} textAnchor="end" fontSize={8} className={ink}>Ins.</text>
                {shown.map((e, i) => e.kind === 'meal' ? (
                    <g key={i}>
                        <path d={`M${x(e.time) - 5},${LANE_MEAL + 4} L${x(e.time) + 5},${LANE_MEAL + 4} L${x(e.time)},${LANE_MEAL - 5} Z`} className={mealColor} />
                        <text x={x(e.time) + 7} y={LANE_MEAL + 3} fontSize={8} className={ink}>{e.label}</text>
                    </g>
                ) : (
                    <g key={i}>
                        <rect x={x(e.time) - 4} y={LANE_DOSE - 4} width={8} height={8} rx={1.5} className={doseColor} />
                        <text x={x(e.time) + 7} y={LANE_DOSE + 3} fontSize={8} className={ink}>{e.label}</text>
                    </g>
                ))}

                {nearest && (
                    <g pointerEvents="none">
                        <line x1={x(nearest.time)} x2={x(nearest.time)} y1={TOP} y2={LANE_DOSE + 6} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={1} />
                        <circle cx={x(nearest.time)} cy={y(nearest.mgdl)} r={5} className={`${lineColor} fill-white dark:fill-gray-800`} strokeWidth={2} />
                    </g>
                )}
            </svg>
            <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-300 mt-1">
                <span className="flex items-center gap-1"><svg width="10" height="10"><path d="M0,9 L10,9 L5,0 Z" className={mealColor} /></svg> Comida (g HC)</span>
                <span className="flex items-center gap-1"><svg width="10" height="10"><rect x="1" y="1" width="8" height="8" rx="1.5" className={doseColor} /></svg> Insulina (U)</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600" /> {hypoThreshold}–180</span>
            </div>
            <details className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                <summary className="cursor-pointer py-1">Ver como tabla</summary>
                <table className="w-full mt-1">
                    <thead><tr className="text-left"><th>Hora</th><th>mg/dL</th></tr></thead>
                    <tbody>
                        {points.filter((_, i) => i % 3 === (points.length - 1) % 3).reverse().map(p => (
                            <tr key={p.time}><td>{clock(p.time)}</td><td>{p.mgdl}</td></tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </figure>
    );
}
