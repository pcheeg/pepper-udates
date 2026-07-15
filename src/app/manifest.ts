import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pupdates — Pepper's family scrapbook",
    short_name: "Pupdates",
    description: "A private home for Pepper's family photos and memories.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#fbf8f3",
    orientation: "portrait-primary",
    icons: [
      { src: "/pepper-updates-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pepper-updates-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
