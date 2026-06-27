import Carousel from "./Carousel";
import type { CarItem } from "./Carousel";
import { appView } from "./appStore";
import type { View } from "./appStore";
import { Music, Bot, Image, Headphones, Piano, Newspaper } from "lucide-react";
import { blip } from "./boot";

export const APPS: { view: View; label: string; color: string; Icon: any; soon?: boolean }[] = [
  { view: "music",     label: "Music",          color: "#5fe6ff", Icon: Music },
  { view: "robot",     label: "RAVA",          color: "#7ddfff", Icon: Bot },
  { view: "gesturefx", label: "Gesture FX",     color: "#5fe6ff", Icon: Headphones },
  { view: "chordlab",  label: "Chord Lab",      color: "#ff7be5", Icon: Piano },
  { view: "meme",      label: "Meme of the Day", color: "#ffcf5a", Icon: Image },
  { view: "news",      label: "News Feed",        color: "#f97316", Icon: Newspaper },
];

export default function Home() {
  const items: CarItem[] = APPS.map((a) => ({ kind: "app", label: a.label, color: a.color, Icon: a.Icon, soon: a.soon }));
  return <Carousel items={items} onSelect={(i) => { if (APPS[i].soon) { blip(420); return; } blip(900); appView.set(APPS[i].view); }} />;
}
