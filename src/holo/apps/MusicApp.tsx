import Carousel from "../Carousel";
import type { CarItem } from "../Carousel";
import { tracks } from "../tracks";
import { player } from "../store";
import { toggleTrack } from "../audio";
import { appView } from "../appStore";

export default function MusicApp() {
  const items: CarItem[] = tracks.map((t) => ({ kind: "track", title: t.title, artist: t.artist, art: t.art, color: t.color }));
  return (
    <Carousel
      items={items}
      canClose
      onClose={() => appView.set("home")}
      // point a track: play it; point the playing track again: pause/resume
      onSelect={(i) => { player.playingIndex = i; toggleTrack(tracks[i].src); }}
    />
  );
}
