export type RadialSlide = {
  id: string;
  title?: string;
  subtitle?: string;
  image: string;
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

type ActiveProject = {
  mainIdx: number;
  projectIdx: number;
};

const CONFIG = {
  stepDeg: 16,
  mainRadius: 0.76,
  branchRadius: 1.34,
  anchor: 0.76,
  stagePadX: 0,
  radiusMax: 260,
  radiusScale: 0.44,
  categoryGap: 0.42,
  fadePower: 0.28,
  centerWindow: 0.38,
  itemPitch: 56,
  syncLockMs: 480,
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

function buildItemButton(
  col: 0 | 1,
  item: RadialItem,
  withMeta: boolean,
): HTMLButtonElement {
  const info = item.infoHref
    ? `<a class="radial__info" href="${item.infoHref}">Info</a>`
    : "";
  const count = item.slides?.length ?? item.count ?? 0;
  const meta = withMeta && count ? `<span class="radial__meta">[${count}] ${info}</span>` : "";

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

export function mountRadialMenu(root: HTMLElement) {
  const dataEl = root.querySelector<HTMLScriptElement>("[data-radial-data]");
  const track = root.querySelector<HTMLElement>("[data-radial-track]");
  const stage = root.querySelector<HTMLElement>("[data-radial-stage]");
  const navScroll = root.querySelector<HTMLElement>("[data-nav-scroll]");
  const previewScroll = root.querySelector<HTMLElement>("[data-preview-scroll]");
  const projectSections = previewScroll
    ? [...previewScroll.querySelectorAll<HTMLElement>("[data-project-key]")]
    : [];

  if (!dataEl?.textContent || !track || !stage || !navScroll) return;

  const { tree } = JSON.parse(dataEl.textContent) as RadialPayload;
  const branchEntries = buildBranchIndex(tree, CONFIG.categoryGap);
  const snapEls = [
    ...navScroll.querySelectorAll<HTMLElement>(".radial-nav-snap[data-project-key]"),
  ];

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

  const snapByKey = new Map(
    snapEls.map((el) => [el.dataset.projectKey ?? "", el] as const),
  );
  const firstProjectInCategory = new Map<number, HTMLElement>();
  branchEntries.forEach((entry) => {
    if (!entry.categoryStart) return;
    const el = snapByKey.get(`${entry.mainIdx}:${entry.projectIdx}`);
    if (el) firstProjectInCategory.set(entry.mainIdx, el);
  });

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
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMobile = () => mobileQuery.matches;

  let layoutQueued = false;
  let previewSyncLock = false;
  let navSyncLock = false;
  let previewSyncTimer: ReturnType<typeof setTimeout> | undefined;
  let navSyncTimer: ReturnType<typeof setTimeout> | undefined;
  let previewScrollEndTimer: ReturnType<typeof setTimeout> | undefined;
  let lastProjectKey = "";
  let cachedMaxHeroBranchW = 0;

  const arcGeometry = (height: number) => {
    const baseR = Math.min(height * CONFIG.radiusScale, CONFIG.radiusMax);
    const cx = CONFIG.stagePadX - baseR * CONFIG.anchor;
    return { baseR, cx };
  };

  const readOrbitGap = () => {
    const raw = getComputedStyle(root).getPropertyValue("--orbit-gap").trim();
    const gap = parseFloat(raw);
    return Number.isFinite(gap) ? gap : 32;
  };

  const buttonOpacity = (btn: HTMLButtonElement) => {
    const inline = btn.style.opacity;
    if (inline) {
      const parsed = parseFloat(inline);
      if (Number.isFinite(parsed)) return parsed;
    }
    return parseFloat(getComputedStyle(btn).opacity) || 0;
  };

  const measureMaxHeroBranchWidth = () => {
    const saved = branchButtons.map((btn) => ({
      btn,
      hero: btn.classList.contains("is-hero"),
      transform: btn.style.transform,
      opacity: btn.style.opacity,
    }));

    let maxW = 0;
    branchButtons.forEach((btn) => {
      btn.classList.add("is-hero");
      btn.style.transform = "translate3d(0,0,0) translateY(-50%) rotate(0deg)";
      btn.style.opacity = "1";
      maxW = Math.max(maxW, btn.offsetWidth);
    });

    saved.forEach(({ btn, hero, transform, opacity }) => {
      btn.classList.toggle("is-hero", hero);
      btn.style.transform = transform;
      btn.style.opacity = opacity;
    });

    return maxW;
  };

  const getMaxHeroBranchWidth = () => {
    if (cachedMaxHeroBranchW <= 0) {
      cachedMaxHeroBranchW = measureMaxHeroBranchWidth();
    }
    return cachedMaxHeroBranchW;
  };

  const applyStageWidth = (stageRect: DOMRect, branchAnchorLeft: number) => {
    const gap = readOrbitGap();
    const maxHeroW = getMaxHeroBranchWidth();
    const anchorRel = branchAnchorLeft - stageRect.left;

    let maxRight = branchAnchorLeft + maxHeroW;
    branchButtons.forEach((btn) => {
      if (buttonOpacity(btn) <= 0.1) return;
      maxRight = Math.max(maxRight, btn.getBoundingClientRect().right);
    });

    const stageW = Math.ceil(Math.max(maxRight - stageRect.left, anchorRel + maxHeroW) + gap);
    if (stageW > 0) root.style.setProperty("--orbit-stage-w", `${stageW}px`);
  };

  const layoutItem = (
    colIndex: 0 | 1,
    itemIndex: number,
    scroll: number,
    cy: number,
    height: number,
  ) => {
    const delta = itemIndex + scroll;
    const { baseR, cx } = arcGeometry(height);
    const R = baseR * (colIndex === 0 ? CONFIG.mainRadius : CONFIG.branchRadius);
    const step = (CONFIG.stepDeg * Math.PI) / 180;
    const theta = delta * step;
    const absDelta = Math.abs(delta);
    const opacity = Math.max(0, 1 - absDelta * CONFIG.fadePower);
    return {
      x: cx + R * Math.cos(theta),
      y: cy + R * Math.sin(theta),
      rotation: (theta * 180) / Math.PI,
      opacity,
      delta,
      center: absDelta < CONFIG.centerWindow,
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
    const center = layout.center;
    const active = !!opts.active;
    const pointerEvents = hidden ? "none" : "auto";

    if (el.style.transform !== transform) el.style.transform = transform;
    if (el.style.opacity !== opacity) el.style.opacity = opacity;
    if (el.style.zIndex !== zIndex) el.style.zIndex = zIndex;
    if (el.style.pointerEvents !== pointerEvents) el.style.pointerEvents = pointerEvents;
    el.classList.toggle("is-center", center);
    el.classList.toggle("is-active", active);
    el.classList.toggle("is-hero", !!(opts.branch && center));
  };

  const snapCenters = () =>
    snapEls.map((el) => ({
      el,
      visual: Number(el.dataset.visualIndex),
      mainIdx: Number(el.dataset.projectKey?.split(":")[0] ?? 0),
      projectIdx: Number(el.dataset.projectKey?.split(":")[1] ?? 0),
      center: el.offsetTop + el.offsetHeight / 2,
    }));

  const branchVisualFromScroll = () => {
    const center = navScroll.scrollTop + navScroll.clientHeight / 2;
    const points = snapCenters();
    if (!points.length) return 0;
    if (center <= points[0].center) return points[0].visual;
    if (center >= points[points.length - 1].center) return points[points.length - 1].visual;

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (center < a.center || center > b.center) continue;
      const span = b.center - a.center;
      if (span <= 0) return a.visual;
      const t = (center - a.center) / span;
      return a.visual + t * (b.visual - a.visual);
    }

    return points[0].visual;
  };

  const nearestSnap = () => {
    const center = navScroll.scrollTop + navScroll.clientHeight / 2;
    let best: (ReturnType<typeof snapCenters>[number] & { dist: number }) | null = null;

    for (const point of snapCenters()) {
      const dist = Math.abs(point.center - center);
      if (!best || dist < best.dist) best = { ...point, dist };
    }

    return best;
  };

  const activeFromScroll = (): ActiveProject => {
    const hit = nearestSnap();
    return hit
      ? { mainIdx: hit.mainIdx, projectIdx: hit.projectIdx }
      : { mainIdx: 0, projectIdx: 0 };
  };

  const activeFromPreview = (): ActiveProject | null => {
    if (!previewScroll || !projectSections.length) return null;

    const rootRect = previewScroll.getBoundingClientRect();
    const focusY = rootRect.top + rootRect.height * 0.34;
    let best: { el: HTMLElement; dist: number } | null = null;

    for (const section of projectSections) {
      const rect = section.getBoundingClientRect();
      const anchor = rect.top + Math.min(rect.height * 0.12, 96);
      const dist = Math.abs(anchor - focusY);
      if (!best || dist < best.dist) best = { el: section, dist };
    }

    if (!best) return null;
    const [mainIdx, projectIdx] = (best.el.dataset.projectKey ?? "0:0").split(":").map(Number);
    return { mainIdx, projectIdx };
  };

  const branchVisualForActive = (active: ActiveProject) => {
    const entry = branchEntries.find(
      (item) => item.mainIdx === active.mainIdx && item.projectIdx === active.projectIdx,
    );
    return entry?.visualIndex ?? branchVisualFromScroll();
  };

  const scrollNavToProject = (
    mainIdx: number,
    projectIdx: number,
    smooth = !prefersReducedMotion,
  ) => {
    const el = snapByKey.get(`${mainIdx}:${projectIdx}`);
    if (!el) return;
    navSyncLock = true;
    clearTimeout(navSyncTimer);
    el.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "center" });
    navSyncTimer = setTimeout(() => {
      navSyncLock = false;
    }, smooth ? CONFIG.syncLockMs : 40);
  };

  const scrollPreviewToProject = (
    mainIdx: number,
    projectIdx: number,
    smooth = !prefersReducedMotion,
  ) => {
    const section = projectSections.find(
      (el) => el.dataset.projectKey === `${mainIdx}:${projectIdx}`,
    );
    if (!section || !previewScroll) return;
    previewSyncLock = true;
    clearTimeout(previewSyncTimer);
    section.scrollIntoView({ behavior: smooth ? "smooth" : "instant", block: "start" });
    previewSyncTimer = setTimeout(() => {
      previewSyncLock = false;
    }, smooth ? CONFIG.syncLockMs : 40);
  };

  const syncMobileNav = (active: ActiveProject) => {
    if (!mobileNav || !isMobile()) return;
    mobileCategories.forEach((btn) => {
      const idx = Number(btn.dataset.mainIdx);
      const isActive = idx === active.mainIdx;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    mobileGroups.forEach((group) => {
      group.hidden = Number(group.dataset.mainIdx) !== active.mainIdx;
    });
    mobileProjects.forEach((btn) => {
      const mainIdx = Number(btn.dataset.mainIdx);
      const projectIdx = Number(btn.dataset.projectIdx);
      btn.classList.toggle(
        "is-active",
        mainIdx === active.mainIdx && projectIdx === active.projectIdx,
      );
    });
  };

  const syncPreviewActive = (active: ActiveProject) => {
    const projectKey = `${active.mainIdx}:${active.projectIdx}`;
    projectSections.forEach((section) => {
      section.classList.toggle("is-active", section.dataset.projectKey === projectKey);
    });
    lastProjectKey = projectKey;
  };

  const updateScrollPadding = () => {
    const pad = Math.max(0, navScroll.clientHeight / 2 - CONFIG.itemPitch / 2);
    navScroll.style.setProperty("--nav-scroll-pad", `${pad}px`);
  };

  const updateLayout = (options?: { syncPreview?: boolean; previewLed?: boolean }) => {
    if (isMobile()) return;

    const usePreviewLed =
      !!options?.previewLed && !previewSyncLock && !navSyncLock;

    const active = usePreviewLed
      ? activeFromPreview() ?? activeFromScroll()
      : activeFromScroll();

    const branchVisual = usePreviewLed
      ? branchVisualForActive(active)
      : branchVisualFromScroll();

    const projectKey = `${active.mainIdx}:${active.projectIdx}`;
    const prevProjectKey = lastProjectKey;
    const height = track.clientHeight;
    const cy = height / 2;

    mainButtons.forEach((btn, i) => {
      const layout = layoutItem(0, i, -active.mainIdx, cy, height);
      paintItem(btn, layout, {
        dimmed: branchEntries.length > 0,
        active: i === active.mainIdx,
      });
    });

    branchButtons.forEach((btn) => {
      const visualIndex = Number(btn.dataset.visualIndex);
      const layout = layoutItem(1, visualIndex, -branchVisual, cy, height);
      const mainIdx = Number(btn.dataset.mainIdx);
      const projectIdx = Number(btn.dataset.projectIdx);
      paintItem(btn, layout, {
        branch: true,
        active: mainIdx === active.mainIdx && projectIdx === active.projectIdx,
      });
    });

    stage.classList.toggle("is-branched", branchEntries.length > 0);
    root.classList.toggle("is-branched", branchEntries.length > 0);

    syncPreviewActive(active);
    syncMobileNav(active);

    if (
      options?.syncPreview &&
      !previewSyncLock &&
      projectKey !== prevProjectKey
    ) {
      scrollPreviewToProject(active.mainIdx, active.projectIdx, !prefersReducedMotion);
    }

    if (!options?.previewLed) {
      const stageRect = stage.getBoundingClientRect();
      const centeredBranch = branchButtons.find(
        (btn) =>
          Number(btn.dataset.mainIdx) === active.mainIdx &&
          Number(btn.dataset.projectIdx) === active.projectIdx,
      );
      if (centeredBranch) {
        applyStageWidth(stageRect, centeredBranch.getBoundingClientRect().left);
      }
    }
  };

  const paintArcForBalance = (active: ActiveProject, height: number) => {
    const branchVisual = branchVisualFromScroll();
    const cy = height / 2;

    mainButtons.forEach((btn, i) => {
      const layout = layoutItem(0, i, -active.mainIdx, cy, height);
      paintItem(btn, layout, {
        dimmed: branchEntries.length > 0,
        active: i === active.mainIdx,
      });
    });

    branchButtons.forEach((btn) => {
      const visualIndex = Number(btn.dataset.visualIndex);
      const layout = layoutItem(1, visualIndex, -branchVisual, cy, height);
      const mainIdx = Number(btn.dataset.mainIdx);
      const projectIdx = Number(btn.dataset.projectIdx);
      paintItem(btn, layout, {
        branch: true,
        active: mainIdx === active.mainIdx && projectIdx === active.projectIdx,
      });
    });
  };

  const balanceOrbitLayout = () => {
    if (isMobile()) return;

    const gap = readOrbitGap();
    const height = track.clientHeight;
    if (height <= 0) return;

    const active = activeFromScroll();
    const centeredMain = mainButtons[active.mainIdx];
    const centeredBranch = branchButtons.find(
      (btn) =>
        Number(btn.dataset.mainIdx) === active.mainIdx &&
        Number(btn.dataset.projectIdx) === active.projectIdx,
    );
    if (!centeredMain || !centeredBranch) return;

    const stageRect = stage.getBoundingClientRect();
    const branchRadiusMax = 2.5;
    CONFIG.stagePadX = 0;

    paintArcForBalance(active, height);

    let mainRect = centeredMain.getBoundingClientRect();
    const mainLeftGap = mainRect.left - stageRect.left;
    if (mainLeftGap < gap) {
      CONFIG.stagePadX += gap - mainLeftGap;
      paintArcForBalance(active, height);
      mainRect = centeredMain.getBoundingClientRect();
    }

    for (let i = 0; i < 16; i++) {
      paintArcForBalance(active, height);

      const branchRect = centeredBranch.getBoundingClientRect();
      const visualGap = branchRect.left - mainRect.right;

      if (visualGap >= gap) {
        applyStageWidth(stageRect, branchRect.left);
        return;
      }

      const { baseR } = arcGeometry(height);
      CONFIG.branchRadius += Math.max((gap - visualGap) / baseR, 0.03);
      CONFIG.branchRadius = Math.min(
        Math.max(CONFIG.branchRadius, CONFIG.anchor + 0.08),
        branchRadiusMax,
      );
    }

    const branchRect = centeredBranch.getBoundingClientRect();
    applyStageWidth(stageRect, branchRect.left);
  };

  const scheduleLayout = (options?: { syncPreview?: boolean; previewLed?: boolean }) => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      updateLayout(options);
    });
  };

  const syncNavToPreview = () => {
    if (previewSyncLock || navSyncLock || !previewScroll) return;

    const previewActive = activeFromPreview();
    if (!previewActive) return;

    const navActive = activeFromScroll();
    if (
      previewActive.mainIdx === navActive.mainIdx &&
      previewActive.projectIdx === navActive.projectIdx
    ) {
      return;
    }

    scrollNavToProject(previewActive.mainIdx, previewActive.projectIdx, false);
  };

  const onNavScroll = () => {
    scheduleLayout({ syncPreview: true });
  };

  const onPreviewScroll = () => {
    if (previewSyncLock || navSyncLock || isMobile()) return;
    scheduleLayout({ previewLed: true });

    clearTimeout(previewScrollEndTimer);
    previewScrollEndTimer = setTimeout(syncNavToPreview, 80);
  };

  const goToCategory = (mainIdx: number) => {
    const el = firstProjectInCategory.get(mainIdx);
    if (!el) return;
    navSyncLock = true;
    clearTimeout(navSyncTimer);
    el.scrollIntoView({ behavior: prefersReducedMotion ? "instant" : "smooth", block: "center" });
    navSyncTimer = setTimeout(() => {
      navSyncLock = false;
      scheduleLayout({ syncPreview: true });
    }, prefersReducedMotion ? 40 : CONFIG.syncLockMs);
  };

  const goToProject = (id: string) => {
    const entry = branchEntries.find((item) => item.item.id === id);
    if (!entry) return;
    scrollNavToProject(entry.mainIdx, entry.projectIdx, !prefersReducedMotion);
    scrollPreviewToProject(entry.mainIdx, entry.projectIdx, !prefersReducedMotion);
  };

  track.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".radial__info")) return;
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".radial__item");
    if (!btn?.dataset.id) return;
    e.preventDefault();
    const col = Number(btn.dataset.col);
    if (col === 0) {
      const idx = tree.findIndex((item) => item.id === btn.dataset.id);
      if (idx >= 0) goToCategory(idx);
    } else {
      goToProject(btn.dataset.id);
    }
  });

  mobileCategories.forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.mainIdx);
      if (idx >= 0) goToCategory(idx);
    });
  });

  mobileProjects.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mainIdx = Number(btn.dataset.mainIdx);
      const projectIdx = Number(btn.dataset.projectIdx);
      scrollPreviewToProject(mainIdx, projectIdx, !prefersReducedMotion);
    });
  });

  navScroll.addEventListener("scroll", onNavScroll, { passive: true });

  stage.addEventListener(
    "wheel",
    (e) => {
      if (isMobile()) return;
      if (!(e.target as HTMLElement).closest(".radial__item")) return;
      navScroll.scrollTop += e.deltaY;
    },
    { passive: true, capture: true },
  );

  if ("onscrollend" in navScroll) {
    navScroll.addEventListener(
      "scrollend",
      () => {
        if (navSyncLock) return;
        const active = activeFromScroll();
        scrollPreviewToProject(active.mainIdx, active.projectIdx, !prefersReducedMotion);
      },
      { passive: true },
    );
  }

  if (previewScroll && projectSections.length) {
    const galleryFigures = [
      ...previewScroll.querySelectorAll<HTMLElement>(".radial-project__figure"),
    ];

    if (galleryFigures.length) {
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
        {
          root: previewScroll,
          rootMargin: "-10% 0px -10% 0px",
          threshold: [0, 0.3, 0.55],
        },
      );
      galleryFigures.forEach((figure) => galleryObserver.observe(figure));
    }

    previewScroll.addEventListener("scroll", onPreviewScroll, { passive: true });

    if ("onscrollend" in previewScroll) {
      previewScroll.addEventListener(
        "scrollend",
        () => {
          if (previewSyncLock || navSyncLock || isMobile()) return;
          syncNavToPreview();
        },
        { passive: true },
      );
    }
  }

  root.addEventListener("keydown", (e) => {
    if (isMobile()) return;
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();

    const hit = nearestSnap();
    if (!hit) return;
    const currentIdx = snapEls.indexOf(hit.el);
    const nextIdx = Math.min(
      Math.max(currentIdx + (e.key === "ArrowUp" ? -1 : 1), 0),
      snapEls.length - 1,
    );
    const next = snapEls[nextIdx];
    const [mainIdx, projectIdx] = (next.dataset.projectKey ?? "0:0").split(":").map(Number);
    scrollNavToProject(mainIdx, projectIdx, !prefersReducedMotion);
    scrollPreviewToProject(mainIdx, projectIdx, !prefersReducedMotion);
  });

  window.addEventListener("resize", () => {
    remeasureOrbit();
  });

  const remeasureOrbit = () => {
    updateScrollPadding();
    cachedMaxHeroBranchW = 0;
    for (let i = 0; i < 2; i++) {
      updateLayout();
      balanceOrbitLayout();
    }
  };

  const boot = activeFromScroll();
  lastProjectKey = `${boot.mainIdx}:${boot.projectIdx}`;
  projectSections.forEach((section) => {
    section.classList.toggle("is-active", section.dataset.projectKey === lastProjectKey);
  });
  remeasureOrbit();
  requestAnimationFrame(remeasureOrbit);
  document.fonts?.ready.then(remeasureOrbit).catch(() => {});
}

const root = document.querySelector<HTMLElement>("[data-radial-menu]");
if (root) mountRadialMenu(root);
