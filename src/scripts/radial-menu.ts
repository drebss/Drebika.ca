export type RadialSlide = {
  id: string;
  kind?: "image" | "video";
  src?: string;
  title?: string;
  subtitle?: string;
};

export type RadialItem = {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  tags?: string[];
  count?: number;
  infoHref?: string;
  slides?: RadialSlide[];
  children?: RadialItem[];
};

type RadialPayload = { tree: RadialItem[] };

type BranchEntry = {
  mainIdx: number;
  projectIdx: number;
  item: RadialItem;
  visualIndex: number;
  categoryStart: boolean;
};

type ActiveProject = { mainIdx: number; projectIdx: number };

type SectionDatum = {
  el: HTMLElement;
  mainIdx: number;
  projectIdx: number;
  key: string;
  id: string;
  visualIndex: number;
};

type CategoryRange = { vStart: number; vEnd: number };
type Geometry = { cx: number; baseR: number; mainRadius: number; branchRadius: number; cy: number };
type Driver = "fan" | "preview";

const CONFIG = {
  stepDeg: 16,
  mainRadiusMin: 0.36,
  mainRadiusMax: 0.58,
  branchRingMin: 0.42,
  radiusMax: 260,
  radiusScale: 0.44,
  categoryGap: 0.42,
  fadePower: 0.28,
  centerWindow: 0.38,
  // How far (fraction of a viewport) the fan stays locked on the active project
  // before handing off to the next while reading the preview.
  handoffFraction: 0.62,
  // Fan scrubbing feel.
  fanWheel: 0.0052, // wheel delta (px) -> project units
  fanDrag: 0.011, // pointer drag (px) -> project units
  fanEase: 0.2, // per-frame approach toward the target (smoothing)
  fanSettleMs: 120, // idle before snapping to the nearest project
};

function buildBranchIndex(tree: RadialItem[], gap: number): BranchEntry[] {
  const entries: BranchEntry[] = [];
  let visualIndex = 0;

  tree.forEach((category, mainIdx) => {
    if (mainIdx > 0) visualIndex += gap;
    (category.children ?? []).forEach((item, projectIdx) => {
      entries.push({
        mainIdx,
        projectIdx,
        item,
        visualIndex,
        categoryStart: projectIdx === 0,
      });
      visualIndex += 1;
    });
  });

  return entries;
}

function buildItemButton(col: 0 | 1, item: RadialItem, withMeta: boolean): HTMLButtonElement {
  const count = item.slides?.length ?? item.count ?? 0;
  const meta = withMeta && count ? `<span class="radial__meta">[${count}]</span>` : "";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "radial__item";
  btn.dataset.col = String(col);
  btn.dataset.id = item.id;
  btn.innerHTML = `
    <span class="radial__title">${item.title}</span>
    <span class="radial__subtitle">${item.subtitle}</span>
    ${meta}
  `;
  return btn;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Interpolate a value across a monotonic pair of keyframe arrays.
function lerpAcross(x: number, xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const span = xs[i + 1] - xs[i] || 1;
      const t = (x - xs[i]) / span;
      return ys[i] + t * (ys[i + 1] - ys[i]);
    }
  }
  return ys[n - 1];
}

export function mountRadialMenu(root: HTMLElement) {
  const dataEl = root.querySelector<HTMLScriptElement>("[data-radial-data]");
  const track = root.querySelector<HTMLElement>("[data-radial-track]");
  const stage = root.querySelector<HTMLElement>("[data-radial-stage]");
  const previewScroll = root.querySelector<HTMLElement>("[data-preview-scroll]");
  const nameEl = root.querySelector<HTMLElement>(".radial-name");

  if (!dataEl?.textContent || !track || !stage || !previewScroll) return;

  const { tree } = JSON.parse(dataEl.textContent) as RadialPayload;
  const branchEntries = buildBranchIndex(tree, CONFIG.categoryGap);

  // --- Build the fan (main = categories, branch = projects) -------------------
  track.innerHTML = `
    <div class="radial-layer radial-layer--main" data-layer="main"></div>
    <div class="radial-layer radial-layer--branch" data-layer="branch"></div>
  `;
  const mainLayer = track.querySelector<HTMLElement>("[data-layer='main']")!;
  const branchLayer = track.querySelector<HTMLElement>("[data-layer='branch']")!;

  const mainButtons = tree.map((item) => {
    const btn = buildItemButton(0, item, false);
    mainLayer.appendChild(btn);
    return btn;
  });

  const branchButtons = branchEntries.map((entry) => {
    const btn = buildItemButton(1, entry.item, true);
    btn.dataset.mainIdx = String(entry.mainIdx);
    btn.dataset.projectIdx = String(entry.projectIdx);
    btn.dataset.visualIndex = String(entry.visualIndex);
    if (entry.categoryStart) btn.classList.add("is-category-start");
    branchLayer.appendChild(btn);
    return btn;
  });

  const categoryRanges: CategoryRange[] = [];
  branchEntries.forEach((entry) => {
    const existing = categoryRanges[entry.mainIdx];
    if (!existing) {
      categoryRanges[entry.mainIdx] = { vStart: entry.visualIndex, vEnd: entry.visualIndex };
    } else {
      existing.vStart = Math.min(existing.vStart, entry.visualIndex);
      existing.vEnd = Math.max(existing.vEnd, entry.visualIndex);
    }
  });

  // --- Preview feed (the visible project column, single native scroll) --------
  const projectSections = [...previewScroll.querySelectorAll<HTMLElement>("[data-project-key]")];
  const sectionData: SectionDatum[] = projectSections.map((el) => {
    const [mainIdx, projectIdx] = (el.dataset.projectKey ?? "0:0").split(":").map(Number);
    const entry = branchEntries.find(
      (item) => item.mainIdx === mainIdx && item.projectIdx === projectIdx,
    );
    return {
      el,
      mainIdx,
      projectIdx,
      key: `${mainIdx}:${projectIdx}`,
      id: el.dataset.projectId ?? entry?.item.id ?? "",
      visualIndex: entry?.visualIndex ?? 0,
    };
  });
  const sectionVis = sectionData.map((d) => d.visualIndex);
  let sectionTops = sectionData.map(() => 0);
  const minVis = sectionVis.length ? sectionVis[0] : 0;
  const maxVis = sectionVis.length ? sectionVis[sectionVis.length - 1] : 0;

  const firstSectionInCategory = new Map<number, SectionDatum>();
  sectionData.forEach((d) => {
    if (!firstSectionInCategory.has(d.mainIdx)) firstSectionInCategory.set(d.mainIdx, d);
  });

  // --- Mobile nav -------------------------------------------------------------
  const mobileNav = root.querySelector<HTMLElement>("[data-mobile-nav]");
  const mobileCategories = mobileNav
    ? [...mobileNav.querySelectorAll<HTMLButtonElement>("[data-mobile-category]")]
    : [];
  const mobileGroups = mobileNav
    ? [...mobileNav.querySelectorAll<HTMLElement>("[data-mobile-group]")]
    : [];
  const mobileProjects = mobileNav
    ? [...mobileNav.querySelectorAll<HTMLButtonElement>("[data-mobile-project]")]
    : [];

  const mobileQuery = window.matchMedia("(max-width: 900px)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isMobile = () => mobileQuery.matches;
  const prefersReducedMotion = () => reducedMotionQuery.matches;

  stage.classList.toggle("is-branched", branchEntries.length > 0);
  root.classList.toggle("is-branched", branchEntries.length > 0);

  // --- State ------------------------------------------------------------------
  let geom: Geometry = {
    cx: 0,
    baseR: 0,
    mainRadius: CONFIG.mainRadiusMax,
    branchRadius: CONFIG.mainRadiusMax + CONFIG.branchRingMin,
    cy: 0,
  };
  let previewClientH = 0;
  let sectionOffsets: number[] = [];
  let cachedMaxHeroW = 0;
  let driver: Driver = "fan";
  let fanPos = minVis; // rendered fan position (visual-index space)
  let fanTarget = minVis; // eased-toward goal
  let fanRaf = 0;
  let fanSettleTimer: ReturnType<typeof setTimeout> | undefined;
  let previewPaintQueued = false;
  let programmatic = false;
  let suppressClick = false;
  let lastProjectKey = "";
  let lastProjectId = "";
  let urlSyncLock = false;

  const readCssLength = (prop: string, fallback: number) => {
    const raw = getComputedStyle(root).getPropertyValue(prop).trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  // --- Geometry (deterministic; computed once per resize) ---------------------
  const measureMaxMainWidth = () =>
    mainButtons.reduce((max, btn) => Math.max(max, btn.offsetWidth), 1);

  const measureMaxHeroWidth = () => {
    let max = 1;
    branchButtons.forEach((btn) => {
      const savedTransform = btn.style.transform;
      const savedOpacity = btn.style.opacity;
      const wasHero = btn.classList.contains("is-hero");
      btn.classList.add("is-hero");
      btn.style.transform = "translate3d(0,0,0) translateY(-50%) rotate(0deg)";
      btn.style.opacity = "1";
      max = Math.max(max, btn.offsetWidth);
      btn.classList.toggle("is-hero", wasHero);
      btn.style.transform = savedTransform;
      btn.style.opacity = savedOpacity;
    });
    return max;
  };

  const getMaxHeroWidth = () => {
    if (cachedMaxHeroW <= 0) cachedMaxHeroW = measureMaxHeroWidth();
    return cachedMaxHeroW;
  };

  const computeGeometry = () => {
    const height = track.clientHeight;
    if (height <= 0) return;

    const gap = readCssLength("--orbit-gap", 32);
    const nameArcGap = readCssLength("--orbit-name-gap", gap * 0.7);
    const baseR = Math.min(height * CONFIG.radiusScale, CONFIG.radiusMax);
    const cy = height / 2;
    // Pivot on the name; inner arc sits one balanced gutter past the name edge.
    const nameW = nameEl?.offsetWidth ?? 0;
    const cx = gap + nameW / 2;
    const maxMainW = measureMaxMainWidth();
    const mainRadius = Math.min(
      CONFIG.mainRadiusMax,
      Math.max(CONFIG.mainRadiusMin, (nameArcGap + nameW / 2) / baseR),
    );
    const neededBranchRadius = mainRadius + (maxMainW + nameArcGap) / baseR;
    const branchRadius = Math.max(mainRadius + CONFIG.branchRingMin, neededBranchRadius);

    geom = { cx, baseR, mainRadius, branchRadius, cy };

    if (nameEl) {
      nameEl.style.left = `${cx}px`;
      nameEl.style.top = `${cy}px`;
    }

    const heroX = cx + baseR * branchRadius;
    const stageW = Math.ceil(heroX + getMaxHeroWidth() + gap);
    if (stageW > 0) root.style.setProperty("--orbit-stage-w", `${stageW}px`);
  };

  const computeMetrics = () => {
    previewClientH = previewScroll.clientHeight;
    if (isMobile()) {
      sectionOffsets = sectionData.map((d) => d.el.offsetTop);
      return;
    }
    const baseTop = previewScroll.getBoundingClientRect().top;
    const scrollTop = previewScroll.scrollTop;
    sectionTops = sectionData.map((d) => d.el.getBoundingClientRect().top - baseTop + scrollTop);
  };

  const activeFromScrollTop = (scrollTop: number): SectionDatum => {
    if (sectionOffsets.length === 0) {
      return sectionData[0] ?? { mainIdx: 0, projectIdx: 0, key: "0:0", id: "", visualIndex: 0, el: track };
    }
    const focus = scrollTop + previewClientH * 0.28;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sectionOffsets.length; i++) {
      const dist = Math.abs(sectionOffsets[i] - focus);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return sectionData[best];
  };

  // --- Position mapping (pure math; no layout reads in the hot path) ----------
  const progressFromPreview = () => {
    const scrollTop = previewScroll.scrollTop;
    const n = sectionTops.length;
    if (n === 0) return 0;
    if (scrollTop <= sectionTops[0]) return sectionVis[0];
    if (scrollTop >= sectionTops[n - 1]) return sectionVis[n - 1];

    for (let i = 0; i < n - 1; i++) {
      if (scrollTop < sectionTops[i] || scrollTop >= sectionTops[i + 1]) continue;
      const seg = sectionTops[i + 1] - sectionTops[i] || 1;
      const handoff = Math.min(previewClientH * CONFIG.handoffFraction, seg);
      const rampStart = sectionTops[i + 1] - handoff;
      if (scrollTop <= rampStart) return sectionVis[i];
      const t = (scrollTop - rampStart) / (handoff || 1);
      return sectionVis[i] + t * (sectionVis[i + 1] - sectionVis[i]);
    }
    return sectionVis[n - 1];
  };

  const previewTopForVisual = (v: number) => lerpAcross(v, sectionVis, sectionTops);

  const mainPosFromBranchVisual = (branchVisual: number) => {
    const last = categoryRanges.length - 1;
    if (last < 0) return 0;
    if (branchVisual <= categoryRanges[0].vEnd) return 0;
    for (let c = 0; c < last; c++) {
      if (branchVisual <= categoryRanges[c].vEnd) return c;
      if (branchVisual < categoryRanges[c + 1].vStart) {
        const span = categoryRanges[c + 1].vStart - categoryRanges[c].vEnd || 1;
        return c + (branchVisual - categoryRanges[c].vEnd) / span;
      }
    }
    return last;
  };

  const activeFromBranchVisual = (branchVisual: number): SectionDatum => {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sectionVis.length; i++) {
      const dist = Math.abs(sectionVis[i] - branchVisual);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return (
      sectionData[best] ?? { mainIdx: 0, projectIdx: 0, key: "0:0", id: "", visualIndex: 0, el: track }
    );
  };

  // --- Painting ---------------------------------------------------------------
  const layoutItem = (colIndex: 0 | 1, itemIndex: number, scroll: number) => {
    const delta = itemIndex + scroll;
    const R = geom.baseR * (colIndex === 0 ? geom.mainRadius : geom.branchRadius);
    const branchStep = (CONFIG.stepDeg * Math.PI) / 180;
    // Inner ring is tighter — widen its step so arc length and tilt match the branch.
    const step =
      colIndex === 0 ? branchStep * (geom.branchRadius / geom.mainRadius) : branchStep;
    const theta = delta * step;
    const absDelta = Math.abs(delta);
    const centerWindow =
      colIndex === 0
        ? CONFIG.centerWindow * (geom.mainRadius / geom.branchRadius)
        : CONFIG.centerWindow;
    return {
      x: geom.cx + R * Math.cos(theta),
      y: geom.cy + R * Math.sin(theta),
      rotation: (theta * 180) / Math.PI,
      opacity: Math.max(0, 1 - absDelta * CONFIG.fadePower),
      delta,
      center: absDelta < centerWindow,
    };
  };

  const paintItem = (
    el: HTMLButtonElement,
    layout: ReturnType<typeof layoutItem>,
    opts: { dimmed?: boolean; active?: boolean; branch?: boolean },
  ) => {
    let alpha = layout.opacity;
    if (opts.dimmed) alpha *= 0.38;
    if (opts.branch) alpha *= 0.92;
    const hidden = alpha <= 0.02;
    const opacity = hidden ? "0" : String(alpha);
    const transform = `translate3d(${layout.x}px, ${layout.y}px, 0) translateY(-50%) rotate(${layout.rotation}deg)`;
    const zIndex = String(Math.round(30 - Math.abs(layout.delta) * 4));
    const pointerEvents = hidden ? "none" : "auto";

    if (el.style.transform !== transform) el.style.transform = transform;
    if (el.style.opacity !== opacity) el.style.opacity = opacity;
    if (el.style.zIndex !== zIndex) el.style.zIndex = zIndex;
    if (el.style.pointerEvents !== pointerEvents) el.style.pointerEvents = pointerEvents;
    el.classList.toggle("is-center", layout.center);
    el.classList.toggle("is-active", !!opts.active);
    el.classList.toggle("is-hero", !!(opts.branch && layout.center));
  };

  const syncPreviewActive = (active: SectionDatum) => {
    projectSections.forEach((section) => {
      section.classList.toggle("is-active", section.dataset.projectKey === active.key);
    });
  };

  const syncMobileVideos = (active: SectionDatum) => {
    if (!isMobile()) return;
    projectSections.forEach((section) => {
      const video = section.querySelector<HTMLVideoElement>("[data-autoplay-video]");
      if (!video) return;
      if (section.dataset.projectKey === active.key) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  };

  const syncMobileNav = (active: ActiveProject) => {
    if (!mobileNav) return;
    mobileCategories.forEach((btn) => {
      const isActive = Number(btn.dataset.mainIdx) === active.mainIdx;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    mobileGroups.forEach((group) => {
      group.hidden = Number(group.dataset.mainIdx) !== active.mainIdx;
    });
    mobileProjects.forEach((btn) => {
      btn.classList.toggle(
        "is-active",
        Number(btn.dataset.mainIdx) === active.mainIdx &&
          Number(btn.dataset.projectIdx) === active.projectIdx,
      );
    });
  };

  const isValidProjectId = (id: string) => sectionData.some((d) => d.id === id);

  const syncProjectUrl = (active: SectionDatum) => {
    if (!active.id || active.id === lastProjectId || !isValidProjectId(active.id)) return;
    lastProjectId = active.id;
    if (window.location.hash === `#${active.id}`) return;
    urlSyncLock = true;
    history.replaceState(null, "", `#${active.id}`);
    queueMicrotask(() => {
      urlSyncLock = false;
    });
  };

  const commitActive = (active: SectionDatum) => {
    if (active.key === lastProjectKey) return;
    lastProjectKey = active.key;
    syncPreviewActive(active);
    syncMobileNav(active);
    syncMobileVideos(active);
    syncProjectUrl(active);
  };

  // commit=false while scrubbing the fan: move the labels only, leave the heavy
  // preview highlight/content untouched until the scrub settles.
  const paintFan = (branchVisual: number, commit: boolean) => {
    const mainPos = mainPosFromBranchVisual(branchVisual);
    const active = activeFromBranchVisual(branchVisual);

    mainButtons.forEach((btn, i) => {
      paintItem(btn, layoutItem(0, i, -mainPos), {
        dimmed: branchEntries.length > 0,
        active: i === active.mainIdx,
      });
    });

    branchButtons.forEach((btn) => {
      const visualIndex = Number(btn.dataset.visualIndex);
      paintItem(btn, layoutItem(1, visualIndex, -branchVisual), {
        branch: true,
        active:
          Number(btn.dataset.mainIdx) === active.mainIdx &&
          Number(btn.dataset.projectIdx) === active.projectIdx,
      });
    });

    if (commit) commitActive(active);
  };

  // --- Fan easing (the smooth scrub) ------------------------------------------
  const clampVisual = (v: number) => clamp(v, minVis, maxVis);

  const fanEaseLoop = () => {
    if (driver !== "fan") {
      fanRaf = 0;
      return;
    }
    const diff = fanTarget - fanPos;
    if (Math.abs(diff) < 0.0015) {
      fanPos = fanTarget;
      paintFan(fanPos, true); // at rest → commit the active project
      fanRaf = 0;
      return;
    }
    fanPos += diff * CONFIG.fanEase;
    paintFan(fanPos, false);
    fanRaf = requestAnimationFrame(fanEaseLoop);
  };

  const kickFan = () => {
    if (!fanRaf) fanRaf = requestAnimationFrame(fanEaseLoop);
  };

  const mirrorPreview = (v: number) => {
    programmatic = true;
    previewScroll.scrollTop = previewTopForVisual(v);
    requestAnimationFrame(() => {
      programmatic = false;
    });
  };

  // After the scrub idles, snap to the nearest project and bring the (heavy)
  // preview across in a single jump.
  const scheduleFanSettle = () => {
    clearTimeout(fanSettleTimer);
    fanSettleTimer = setTimeout(() => {
      if (driver !== "fan") return;
      const active = activeFromBranchVisual(fanTarget);
      fanTarget = active.visualIndex;
      mirrorPreview(active.visualIndex);
      kickFan();
    }, CONFIG.fanSettleMs);
  };

  // --- Preview reading drives the fan live ------------------------------------
  let mobileScrollRaf = 0;
  const scheduleMobileActive = () => {
    if (mobileScrollRaf) return;
    mobileScrollRaf = requestAnimationFrame(() => {
      mobileScrollRaf = 0;
      commitActive(activeFromScrollTop(previewScroll.scrollTop));
    });
  };

  const schedulePreviewPaint = () => {
    if (previewPaintQueued) return;
    previewPaintQueued = true;
    requestAnimationFrame(() => {
      previewPaintQueued = false;
      if (isMobile()) {
        commitActive(activeFromScrollTop(previewScroll.scrollTop));
        return;
      }
      const v = progressFromPreview();
      fanPos = v;
      fanTarget = v;
      paintFan(v, true);
    });
  };

  previewScroll.addEventListener(
    "scroll",
    () => {
      if (programmatic) return;
      if (isMobile()) {
        scheduleMobileActive();
        return;
      }
      if (driver !== "preview") return;
      schedulePreviewPaint();
    },
    { passive: true },
  );

  // --- Fan input: wheel + pointer drag ----------------------------------------
  const beginFanInput = () => {
    driver = "fan";
    clearTimeout(fanSettleTimer);
  };

  stage.addEventListener(
    "wheel",
    (e) => {
      if (isMobile()) return;
      e.preventDefault();
      beginFanInput();
      fanTarget = clampVisual(fanTarget + e.deltaY * CONFIG.fanWheel);
      kickFan();
      scheduleFanSettle();
    },
    { passive: false },
  );

  let dragActive = false;
  let dragStartY = 0;
  let dragStartTarget = 0;
  let dragMoved = false;

  stage.addEventListener("pointerdown", (e) => {
    if (isMobile()) return;
    beginFanInput();
    dragActive = true;
    dragMoved = false;
    dragStartY = e.clientY;
    dragStartTarget = fanTarget;
  });

  window.addEventListener("pointermove", (e) => {
    if (!dragActive) return;
    const dy = e.clientY - dragStartY;
    if (!dragMoved && Math.abs(dy) < 4) return;
    dragMoved = true;
    // Drag up to advance, mirroring a natural scrub of the column.
    fanTarget = clampVisual(dragStartTarget - dy * CONFIG.fanDrag);
    fanPos = fanTarget; // 1:1 while dragging so it tracks the finger/cursor
    paintFan(fanPos, false);
  });

  window.addEventListener("pointerup", () => {
    if (!dragActive) return;
    dragActive = false;
    if (dragMoved) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 60);
      scheduleFanSettle();
    }
  });

  previewScroll.addEventListener("pointerdown", () => {
    if (!isMobile()) driver = "preview";
  });
  previewScroll.addEventListener(
    "wheel",
    () => {
      if (!isMobile()) driver = "preview";
    },
    { passive: true },
  );
  previewScroll.addEventListener(
    "touchstart",
    () => {
      if (!isMobile()) driver = "preview";
    },
    { passive: true },
  );

  // --- Programmatic navigation (clicks / keyboard / hash) ---------------------
  const goToProject = (target: SectionDatum, instant = prefersReducedMotion()) => {
    if (isMobile()) {
      programmatic = true;
      previewScroll.scrollTo({
        top: target.el.offsetTop,
        behavior: instant ? "auto" : "smooth",
      });
      commitActive(target);
      requestAnimationFrame(() => {
        programmatic = false;
      });
      return;
    }
    driver = "fan";
    clearTimeout(fanSettleTimer);
    fanTarget = target.visualIndex;
    mirrorPreview(target.visualIndex);
    if (instant) {
      cancelAnimationFrame(fanRaf);
      fanRaf = 0;
      fanPos = fanTarget;
      paintFan(fanPos, true);
    } else {
      kickFan();
    }
  };

  const goToProjectId = (id: string, instant?: boolean) => {
    const target = sectionData.find((d) => d.id === id);
    if (target) goToProject(target, instant);
  };

  const goToCategory = (mainIdx: number) => {
    const target = firstSectionInCategory.get(mainIdx);
    if (target) goToProject(target, isMobile() || prefersReducedMotion());
  };

  track.addEventListener("click", (e) => {
    if (suppressClick) return;
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".radial__item");
    if (!btn?.dataset.id) return;
    e.preventDefault();
    if (Number(btn.dataset.col) === 0) {
      const idx = tree.findIndex((item) => item.id === btn.dataset.id);
      if (idx >= 0) goToCategory(idx);
    } else {
      goToProjectId(btn.dataset.id);
    }
  });

  mobileCategories.forEach((btn) => {
    btn.addEventListener("click", () => goToCategory(Number(btn.dataset.mainIdx)));
  });
  mobileProjects.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.projectId;
      if (id) goToProjectId(id, isMobile() || prefersReducedMotion());
    });
  });

  root.addEventListener("keydown", (e) => {
    if (isMobile()) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const current = sectionData.indexOf(activeFromBranchVisual(fanTarget));
    const next = clamp(current + (e.key === "ArrowUp" ? -1 : 1), 0, sectionData.length - 1);
    goToProject(sectionData[next]);
  });

  window.addEventListener("hashchange", () => {
    if (urlSyncLock) return;
    const id = window.location.hash.slice(1);
    if (id && isValidProjectId(id) && id !== lastProjectId) goToProjectId(id, true);
  });

  // --- Gallery reveal + video autoplay (desktop only; mobile uses syncMobileVideos) ---
  const galleryFigures = [...previewScroll.querySelectorAll<HTMLElement>(".radial-project__figure")];
  if (galleryFigures.length && !isMobile()) {
    const galleryObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const figure = entry.target as HTMLElement;
          figure.classList.toggle("is-inview", entry.isIntersecting);
          const video = figure.querySelector<HTMLVideoElement>("[data-autoplay-video]");
          if (!video) return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { root: previewScroll, rootMargin: "-10% 0px -10% 0px", threshold: [0, 0.3, 0.55] },
    );
    galleryFigures.forEach((figure) => galleryObserver.observe(figure));
  }

  // --- Keep metrics fresh as media loads / layout shifts ----------------------
  let remeasureQueued = false;
  const scheduleRemeasure = () => {
    if (remeasureQueued) return;
    remeasureQueued = true;
    requestAnimationFrame(() => {
      remeasureQueued = false;
      computeMetrics();
      if (isMobile()) {
        if (!programmatic) commitActive(activeFromScrollTop(previewScroll.scrollTop));
      } else if (driver === "preview") {
        schedulePreviewPaint();
      }
    });
  };

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(scheduleRemeasure);
    if (isMobile()) {
      ro.observe(previewScroll);
    } else {
      projectSections.forEach((section) => ro.observe(section));
    }
  }

  const relayout = () => {
    if (isMobile()) {
      computeMetrics();
      commitActive(activeFromScrollTop(previewScroll.scrollTop));
      return;
    }
    cachedMaxHeroW = 0;
    computeGeometry();
    computeMetrics();
    paintFan(driver === "preview" ? progressFromPreview() : fanPos, true);
  };

  window.addEventListener("resize", relayout);
  mobileQuery.addEventListener?.("change", relayout);
  document.fonts?.ready.then(relayout).catch(() => {});

  // --- Boot -------------------------------------------------------------------
  if (isMobile()) {
    computeMetrics();
  } else {
    computeGeometry();
    computeMetrics();
  }

  const initialId = window.location.hash.slice(1);
  const initialTarget =
    initialId && isValidProjectId(initialId)
      ? sectionData.find((d) => d.id === initialId)
      : undefined;
  if (initialTarget) {
    goToProject(initialTarget, true);
  } else if (isMobile()) {
    commitActive(sectionData[0] ?? activeFromScrollTop(0));
  } else {
    fanPos = fanTarget = minVis;
    paintFan(fanPos, true);
  }
}

const root = document.querySelector<HTMLElement>("[data-radial-menu]");
if (root) mountRadialMenu(root);
