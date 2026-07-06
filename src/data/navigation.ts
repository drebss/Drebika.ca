export type RadialMediaKind = "image" | "video";

export type RadialSlide = {
  id: string;
  kind: RadialMediaKind;
  src: string;
  title?: string;
  subtitle?: string;
};

export type RadialItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  descriptionHtml?: string;
  tags: string[];
  count?: number;
  infoHref?: string;
  slides?: RadialSlide[];
  children?: RadialItem[];
};

type MediaItem = {
  kind: RadialMediaKind;
  src: string;
};

const slidesFromMedia = (id: string, media: MediaItem[]): RadialSlide[] =>
  media.map((item, i) => ({
    id: `${id}-${i + 1}`,
    kind: item.kind,
    src: item.src,
    title: `View ${i + 1}`,
    subtitle: `${i + 1} / ${media.length}`,
  }));

const project = (
  id: string,
  title: string,
  subtitle: string,
  description: string,
  tags: string[],
  media: MediaItem[],
  extra?: Partial<RadialItem>,
): RadialItem => {
  const slides = slidesFromMedia(id, media);
  return {
    id,
    title,
    subtitle,
    description,
    tags,
    count: slides.length,
    slides,
    infoHref: `/projects/${id}`,
    ...extra,
  };
};

const prototypes: RadialItem[] = [
  project(
    "tarocchi",
    "Tarocchi",
    "Prototype · AI, 2024",
    "WIP AI tarot reading tool that interprets card spreads using natural language prompts. Users input a question, select a spread, and receive a detailed, symbolic reading drawn from both traditional tarot meanings and advanced interpretive logic. Developed in React Native running on iPhone.",
    ["Art Direction", "Interactive Experience", "AI", "Software Development"],
    [
      { kind: "video", src: "/media/projects/tarocchi/01.mp4" },
      { kind: "image", src: "/media/projects/tarocchi/02.png" },
    ],
  ),
];

const commercialWork: RadialItem[] = [
  project(
    "paper",
    "Paper Education",
    "Art direction · Motion, 2024",
    "Proposed art design and animations for Paper Education.",
    ["Art Direction", "3D Design", "Motion Design"],
    [
      { kind: "video", src: "/media/projects/paper/01.mp4" },
      { kind: "image", src: "/media/projects/paper/02.jpg" },
      { kind: "image", src: "/media/projects/paper/03.jpg" },
      { kind: "video", src: "/media/projects/paper/04.mp4" },
    ],
    {
      descriptionHtml:
        'Proposed art design and animations for <a href="https://paper.co" target="_blank" rel="noopener noreferrer">Paper Education</a>.',
    },
  ),
  project(
    "the-pond",
    "The Pond",
    "AR · Momenta Biennale, 2023",
    "AR experience developed using Swift running on an iPad connected to an external display. Created as part of The Pond exhibition for Bianca Shonee Arroyo. Presented at Momenta Biennale 2023.",
    ["3D Design", "Interactive Experience", "Augmented Reality", "Software Development"],
    [
      { kind: "image", src: "/media/projects/the-pond/01.jpeg" },
      { kind: "video", src: "/media/projects/the-pond/02.mp4" },
      { kind: "image", src: "/media/projects/the-pond/03.jpeg" },
    ],
    {
      descriptionHtml:
        'AR experience developed using Swift running on an iPad connected to an external display. Created as part of <a href="https://momentabiennale.com/en/exhibit/visions-on-the-pond/" target="_blank" rel="noopener noreferrer">The Pond exhibition</a> for <a href="https://shonee.space/The-Pond-2023" target="_blank" rel="noopener noreferrer">Bianca Shonee Arroyo</a>. Presented at Momenta Biennale 2023.',
    },
  ),
  project(
    "boiler-room",
    "Boiler Room",
    "Motion design · Montreal",
    "Custom 3D logo animation for live projection at Boiler Room Montreal.",
    ["Motion Design", "3D"],
    [
      { kind: "video", src: "/media/projects/boiler-room/01.mp4" },
      { kind: "image", src: "/media/projects/boiler-room/02.png" },
      { kind: "image", src: "/media/projects/boiler-room/03.png" },
      { kind: "video", src: "/media/projects/boiler-room/04.mp4" },
    ],
    {
      descriptionHtml:
        'Custom 3D logo animation for live projection at <a href="https://boilerroom.tv/session/montreal-day-2" target="_blank" rel="noopener noreferrer">Boiler Room Montreal</a>.',
    },
  ),
  project(
    "air-melodies",
    "Air Melodies",
    "Realtime visuals · Unreal Engine",
    "Visualizer developed in Unreal Engine 5 for Air Melodies by Isla Den.",
    ["3D Design", "Realtime Visuals", "Unreal Engine"],
    [
      { kind: "video", src: "/media/projects/air-melodies/01.mp4" },
      { kind: "image", src: "/media/projects/air-melodies/02.jpg" },
      { kind: "video", src: "/media/projects/air-melodies/03.mp4" },
    ],
    {
      descriptionHtml:
        'Visualizer developed in Unreal Engine 5 for Air Melodies by <a href="https://isladen.world" target="_blank" rel="noopener noreferrer">Isla Den</a>.',
    },
  ),
];

const art: RadialItem[] = [
  project(
    "no-more-evil",
    "No More Evil",
    "VR installation · World Creation Studios",
    "Virtual reality installation developed in Unreal Engine as part of an artist residency at World Creation Studios.",
    ["Art Direction", "3D Design", "Interactive Experience", "Virtual Reality"],
    [
      { kind: "image", src: "/media/projects/no-more-evil/01.jpg" },
      { kind: "video", src: "/media/projects/no-more-evil/02.mp4" },
      { kind: "image", src: "/media/projects/no-more-evil/03.jpg" },
      { kind: "image", src: "/media/projects/no-more-evil/04.jpg" },
    ],
    {
      descriptionHtml:
        'Virtual reality installation developed in Unreal Engine as part of an artist residency at <a href="https://worldcreation.studio/projects/no-more-evil/" target="_blank" rel="noopener noreferrer">World Creation Studios</a>.',
    },
  ),
];

export const dialTree: RadialItem[] = [
  {
    id: "prototypes",
    title: "Prototypes",
    subtitle: "Experiments & tools",
    description: "",
    tags: [],
    count: prototypes.length,
    children: prototypes,
  },
  {
    id: "commercial",
    title: "Commercial Work",
    subtitle: "Client projects",
    description: "",
    tags: [],
    count: commercialWork.length,
    children: commercialWork,
  },
  {
    id: "art",
    title: "Art",
    subtitle: "Installations & works",
    description: "",
    tags: [],
    count: art.length,
    children: art,
  },
];

export type DialProject = RadialItem & {
  categoryId: string;
  categoryTitle: string;
  mainIdx: number;
  projectIdx: number;
};

export const dialProjects: DialProject[] = dialTree.flatMap((category, mainIdx) =>
  (category.children ?? []).map((item, projectIdx) => ({
    ...item,
    categoryId: category.id,
    categoryTitle: category.title,
    mainIdx,
    projectIdx,
  })),
);

export const dialPayload = { tree: dialTree };

export type BranchScrollItem = {
  id: string;
  mainIdx: number;
  projectIdx: number;
  visualIndex: number;
  categoryStart: boolean;
};

export const CATEGORY_GAP = 0.42;

export function buildBranchScrollItems(
  tree: RadialItem[],
  gap = CATEGORY_GAP,
): BranchScrollItem[] {
  const items: BranchScrollItem[] = [];
  let visualIndex = 0;

  tree.forEach((category, mainIdx) => {
    if (mainIdx > 0) visualIndex += gap;
    (category.children ?? []).forEach((project, projectIdx) => {
      items.push({
        id: project.id,
        mainIdx,
        projectIdx,
        visualIndex,
        categoryStart: projectIdx === 0,
      });
      visualIndex += 1;
    });
  });

  return items;
}

export const branchScrollItems = buildBranchScrollItems(dialTree);
