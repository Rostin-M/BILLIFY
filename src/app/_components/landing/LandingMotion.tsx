"use client";

import { useEffect } from "react";

const num = new Intl.NumberFormat("es-CO");

/** Cuenta de 0 al valor final del elemento (el HTML ya trae el valor final, por si no hay JS). */
function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target) || target === 0) return;
  const prefix = el.dataset.prefix ?? "";
  const start = performance.now();
  const duration = 1400;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 4);
    el.textContent = prefix + num.format(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Movimiento de la landing, todo en un solo lugar y sin dependencias:
 * - [data-reveal]: marca [data-shown] al entrar en pantalla (el CSS anima).
 * - [data-count]: cuenta hasta el número al aparecer.
 * - .spotlight: el brillo sigue al puntero (--mx/--my).
 * - [data-tilt]: parallax del escenario del hero (--tx/--ty, de -1 a 1).
 * Quien pide menos movimiento solo recibe [data-shown], sin conteos ni parallax.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing");
    if (!root) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.dataset.shown = "";
          observer.unobserve(el);
          if (!still)
            el.querySelectorAll<HTMLElement>("[data-count]").forEach(countUp);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    root
      .querySelectorAll("[data-reveal]")
      .forEach((el) => observer.observe(el));

    const cleanups: (() => void)[] = [() => observer.disconnect()];

    if (!still && finePointer) {
      const onSpot = (e: PointerEvent) => {
        const card = (e.target as Element).closest<HTMLElement>(".spotlight");
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      };
      root.addEventListener("pointermove", onSpot);
      cleanups.push(() => root.removeEventListener("pointermove", onSpot));

      root.querySelectorAll<HTMLElement>("[data-tilt]").forEach((area) => {
        const stage = area.querySelector<HTMLElement>(".hero-stage");
        if (!stage) return;
        const onMove = (e: PointerEvent) => {
          const r = area.getBoundingClientRect();
          stage.style.setProperty(
            "--tx",
            (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3),
          );
          stage.style.setProperty(
            "--ty",
            (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3),
          );
        };
        const onLeave = () => {
          stage.style.setProperty("--tx", "0");
          stage.style.setProperty("--ty", "0");
        };
        area.addEventListener("pointermove", onMove);
        area.addEventListener("pointerleave", onLeave);
        cleanups.push(() => {
          area.removeEventListener("pointermove", onMove);
          area.removeEventListener("pointerleave", onLeave);
        });
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
