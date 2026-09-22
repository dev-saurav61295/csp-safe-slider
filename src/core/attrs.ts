/**
 * Ownership-aware DOM mutation tracker used by `destroy()` to put back
 * exactly what a slider instance changed on the root, track, and slide
 * elements it manages.
 *
 * The first write to a given attribute/class on an element records the
 * value that was there immediately before — not the value at construction
 * time, but at the moment this instance first touches it, so a value the
 * consumer had authored ahead of init is preserved verbatim. Every
 * subsequent write updates the tracked "last value this instance set" but
 * never touches the recorded original.
 *
 * On `restore()`, a property is only reverted if its live value still
 * equals the last value this instance wrote to it. If a consumer changed it
 * in the meantime (e.g. overwrote a library-generated `aria-label` with
 * their own), that edit is left alone rather than being silently clobbered
 * back to the pre-init state.
 */
export class DomOwnership {
  private attrOriginal = new WeakMap<Element, Map<string, string | null>>();
  private attrLastSet = new WeakMap<Element, Map<string, string | null>>();
  private classOriginal = new WeakMap<Element, Map<string, boolean>>();
  private classLastSet = new WeakMap<Element, Map<string, boolean>>();

  setAttr(el: Element, name: string, value: string): void {
    this.captureAttrOriginal(el, name);
    el.setAttribute(name, value);
    this.recordAttrLastSet(el, name, value);
  }

  removeAttr(el: Element, name: string): void {
    this.captureAttrOriginal(el, name);
    el.removeAttribute(name);
    this.recordAttrLastSet(el, name, null);
  }

  setClass(el: Element, className: string, on: boolean): void {
    this.captureClassOriginal(el, className);
    el.classList.toggle(className, on);
    this.recordClassLastSet(el, className, on);
  }

  private captureAttrOriginal(el: Element, name: string): void {
    let m = this.attrOriginal.get(el);
    if (!m) {
      m = new Map();
      this.attrOriginal.set(el, m);
    }
    if (!m.has(name)) m.set(name, el.getAttribute(name));
  }

  private recordAttrLastSet(el: Element, name: string, value: string | null): void {
    let m = this.attrLastSet.get(el);
    if (!m) {
      m = new Map();
      this.attrLastSet.set(el, m);
    }
    m.set(name, value);
  }

  private captureClassOriginal(el: Element, className: string): void {
    let m = this.classOriginal.get(el);
    if (!m) {
      m = new Map();
      this.classOriginal.set(el, m);
    }
    if (!m.has(className)) m.set(className, el.classList.contains(className));
  }

  private recordClassLastSet(el: Element, className: string, on: boolean): void {
    let m = this.classLastSet.get(el);
    if (!m) {
      m = new Map();
      this.classLastSet.set(el, m);
    }
    m.set(className, on);
  }

  /**
   * Restores every attribute/class this tracker touched on `el`, then
   * forgets `el` entirely (so a later re-init of the same element starts
   * with a clean slate rather than inheriting stale "original" values).
   */
  restore(el: Element): void {
    const attrOriginal = this.attrOriginal.get(el);
    if (attrOriginal) {
      const attrLast = this.attrLastSet.get(el);
      for (const [name, original] of attrOriginal) {
        const last = attrLast?.get(name) ?? null;
        if (el.getAttribute(name) !== last) continue; // consumer took ownership since
        if (original === null) el.removeAttribute(name);
        else el.setAttribute(name, original);
      }
    }
    this.attrOriginal.delete(el);
    this.attrLastSet.delete(el);

    const classOriginal = this.classOriginal.get(el);
    if (classOriginal) {
      const classLast = this.classLastSet.get(el);
      for (const [className, original] of classOriginal) {
        const last = classLast?.get(className) ?? false;
        if (el.classList.contains(className) !== last) continue;
        el.classList.toggle(className, original);
      }
    }
    this.classOriginal.delete(el);
    this.classLastSet.delete(el);
  }
}
