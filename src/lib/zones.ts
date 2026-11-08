// Faint horizontal bands on the chart (opening range, premarket range), drawn as a lightweight-charts series primitive.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, Time } from 'lightweight-charts';

export interface Zone { lo: number; hi: number; color: string; label: string }

export class ZonePrimitive implements ISeriesPrimitive<Time> {
  private zones: Zone[] = [];
  private series: ISeriesApi<'Candlestick'> | null = null;
  private req: (() => void) | null = null;
  attached(p: SeriesAttachedParameter<Time>) { this.series = p.series as ISeriesApi<'Candlestick'>; this.req = p.requestUpdate; }
  detached() { this.series = null; this.req = null; }
  set(z: Zone[]) { this.zones = z; this.req?.(); }
  updateAllViews() {}
  paneViews(): readonly IPrimitivePaneView[] {
    const self = this;
    const renderer: IPrimitivePaneRenderer = {
      draw(target) {
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
          const s = self.series;
          if (!s) return;
          ctx.font = '10px IBM Plex Mono, monospace';
          for (const z of self.zones) {
            const y1 = s.priceToCoordinate(z.hi), y2 = s.priceToCoordinate(z.lo);
            if (y1 == null || y2 == null) continue;
            const top = Math.min(y1, y2), h = Math.max(2, Math.abs(y2 - y1));
            ctx.globalAlpha = 0.09; ctx.fillStyle = z.color; ctx.fillRect(0, top, mediaSize.width, h);
            ctx.globalAlpha = 0.55; ctx.fillText(z.label, 6, top + 11);
            ctx.globalAlpha = 1;
          }
        });
      },
    };
    return [{ zOrder: () => 'bottom', renderer: () => renderer }];
  }
}
