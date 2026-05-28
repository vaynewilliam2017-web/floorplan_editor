import type { CSSProperties } from 'react';
import type { FloorplanModel, Viewport } from '../lib/types';

interface Props {
  model: FloorplanModel;
  viewport: Viewport;
}

const RULER_SIZE = 32;
const LEFT_RULER_WIDTH = 44;
const TARGET_MAJOR_PX = 112;
const MINOR_DIVISIONS = 5;

export function CanvasRulers({ model, viewport }: Props) {
  const unit = model.source.worldUnit === 'mm' ? 'mm' : 'px';
  const majorStep = niceStep(TARGET_MAJOR_PX / Math.max(viewport.scale, 0.0001));
  const minorStep = majorStep / MINOR_DIVISIONS;

  return (
    <div className="canvas-rulers" aria-hidden="true">
      <div className="ruler-corner">{unit}</div>
      <AxisRuler orientation="x" viewport={viewport} majorStep={majorStep} minorStep={minorStep} />
      <AxisRuler orientation="y" viewport={viewport} majorStep={majorStep} minorStep={minorStep} />
    </div>
  );
}

function AxisRuler({
  orientation,
  viewport,
  majorStep,
  minorStep,
}: {
  orientation: 'x' | 'y';
  viewport: Viewport;
  majorStep: number;
  minorStep: number;
}) {
  const axisStartScreen = orientation === 'x' ? LEFT_RULER_WIDTH : RULER_SIZE;
  const axisOffset = orientation === 'x' ? viewport.x : viewport.y;
  const scale = viewport.scale;
  const screenLimit = orientation === 'x' ? window.innerWidth : window.innerHeight;
  const worldStart = (axisStartScreen - axisOffset) / scale;
  const worldEnd = (screenLimit - axisOffset) / scale;
  const firstMinor = Math.floor(worldStart / minorStep) * minorStep;
  const ticks: Array<{ key: string; screen: number; value: number; major: boolean }> = [];

  for (let value = firstMinor; value <= worldEnd + minorStep; value += minorStep) {
    const screen = value * scale + axisOffset;
    const major = nearlyMultiple(value, majorStep);
    if (screen >= axisStartScreen - 8 && screen <= screenLimit + 8) {
      ticks.push({ key: `${orientation}-${value.toFixed(4)}`, screen, value, major });
    }
  }

  return (
    <div className={`axis-ruler ${orientation === 'x' ? 'axis-ruler-x' : 'axis-ruler-y'}`}>
      {ticks.map((tick) => (
        <div
          key={tick.key}
          className={`ruler-tick ${tick.major ? 'major' : 'minor'}`}
          style={tickStyle(orientation, tick.screen)}
        >
          {tick.major && <span>{formatTick(tick.value)}</span>}
        </div>
      ))}
    </div>
  );
}

function tickStyle(orientation: 'x' | 'y', screen: number) {
  return orientation === 'x'
    ? ({ left: screen - LEFT_RULER_WIDTH } as CSSProperties)
    : ({ top: screen - RULER_SIZE } as CSSProperties);
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 100;
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

function nearlyMultiple(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 0.0001;
}

function formatTick(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.01) return String(rounded);
  return value.toFixed(1);
}
