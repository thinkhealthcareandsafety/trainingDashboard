import type { AppIcon } from "@/lib/apps";

/** One line icon per dashboard page (20×20, stroked): the sidebar and the apps page draw the same ones. */
export const APP_ICONS: Record<AppIcon, React.ReactNode> = {
  overview: <path d="M3.5 4.5h5v5h-5zM11.5 4.5h5v5h-5zM3.5 12.5h5v3h-5zM11.5 12.5h5v3h-5z" />,
  quotations: <path d="M6 3.5h6l3 3v10H6zM12 3.5v3h3M8.5 10h4M8.5 13h4" />,
  trainings: <><path d="M10 3.5 3 7l7 3.5L17 7z" /><path d="M6 8.7v3.8c1 1.2 2.4 1.8 4 1.8s3-.6 4-1.8V8.7M17 7v4" /></>,
  items: <path d="M3.5 6.5 10 3.5l6.5 3v7L10 16.5l-6.5-3zM3.5 6.5 10 9.5l6.5-3M10 9.5v7" />,
  templates: <path d="M3.5 5.5h13v9h-13zM3.5 6l6.5 5 6.5-5" />,
  followups: <path d="M4 5.5h12M4 10h12M4 14.5h7" />,
  calendar: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></>,
  sprints: <><rect x="3" y="3.5" width="14" height="13" rx="2" /><path d="M7.7 3.5v13M12.3 3.5v13M4.8 6.5h1.4M9.3 6.5h1.4M9.3 9h1.4M13.8 6.5h1.4" /></>,
  reports: <path d="M4 16V9M8.5 16V5M13 16v-4.5M16.5 16V7.5" />,
  converter: <path d="M5 2.5h7l3 3v12H5zM12 2.5v3h3M7.5 12l2 2 3.5-4" />,
  sheet: <path d="M3 4.5h8v11H3zM3 8h8M3 11.5h8M6.5 4.5v11M13 10h4M15 8l2 2-2 2" />,
  leads: <><circle cx="8" cy="7" r="3" /><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15.5 5v5M13 7.5h5" /></>,
};
