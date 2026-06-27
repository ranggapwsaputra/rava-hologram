export type Track = {
  title: string;
  artist: string;
  art: string;
  color: string;
  src: string;
};

// prefix with the Vite base URL so assets resolve under a GitHub Pages sub-path too
const B = import.meta.env.BASE_URL;
const asset = (p: string) => (p ? B + p.replace(/^\/+/, "") : "");

const RAW: Track[] = [
  { title: "B.E.D.",            artist: "Jacquees",              src: "/tracks/t01.mp3", color: "#9fd8ff", art: "/covers/t01.jpg" },
  { title: "Essence (Edit)",    artist: "Wizkid × Tems",         src: "/tracks/t02.mp3", color: "#7fffd4", art: "/covers/t02.jpg" },
  { title: "Flashing Lights",   artist: "Kanye West",            src: "/tracks/t03.mp3", color: "#ffcf5a", art: "/covers/t03.jpg" },
  { title: "Just A Lil Bit",    artist: "50 Cent",               src: "/tracks/t04.mp3", color: "#b6ff3a", art: "/covers/t04.jpg" },
  { title: "Body Party (Edit)", artist: "Ciara",                 src: "/tracks/t05.mp3", color: "#ff7ad9", art: "/covers/t05.jpg" },
  { title: "Risk It All",       artist: "Bruno Mars",            src: "/tracks/t06.mp3", color: "#ff2d6b", art: "/covers/t06.jpg" },
  { title: "Mutt (CB Remix)",   artist: "Leon Thomas",           src: "/tracks/t07.mp3", color: "#cfd6dd", art: "/covers/t07.jpg" },
  { title: "Gimmie Like That",  artist: "NAI Mashup",            src: "/tracks/t08.mp3", color: "#9b6bff", art: "" },
  { title: "Needed Me (Jersey)",artist: "Rihanna · NAKEN",       src: "/tracks/t09.mp3", color: "#7fb0ff", art: "/covers/t09.jpg" },
  { title: "One In A Million",  artist: "Aaliyah · SENA",        src: "/tracks/t10.mp3", color: "#ffd36e", art: "/covers/t10.jpg" },
  { title: "SZA × Ne-Yo",       artist: "reikou Mashup",         src: "/tracks/t11.mp3", color: "#ff9ecb", art: "/covers/t11.jpg" },
  { title: "LOVE. (Blend)",     artist: "Ryan Favian",           src: "/tracks/t12.mp3", color: "#b6ff3a", art: "/covers/t12.jpg" },
];

export const tracks: Track[] = RAW.map((t) => ({ ...t, src: asset(t.src), art: asset(t.art) }));
