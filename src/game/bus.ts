type Handler = (data: any) => void;
const map = new Map<string, Set<Handler>>();

export const bus = {
  on(ev: string, fn: Handler) {
    let s = map.get(ev);
    if (!s) map.set(ev, (s = new Set()));
    s.add(fn);
    return () => s!.delete(fn);
  },
  emit(ev: string, data?: any) {
    map.get(ev)?.forEach((fn) => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[bus:${ev}]`, e);
      }
    });
  },
};
