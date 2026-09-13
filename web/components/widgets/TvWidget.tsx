"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

const CHANNELS = [
  { id: "bloomberg", label: "Bloomberg TV", kind: "hls", url: "https://liveprodusphoenixeast.global.ssl.fastly.net/USPhx-HD/Channel-TX-USPhx-AWS-virginia-1/Source-USPhx-16k-1-s6lk2-BP-07-02-81ykIWnsMsg_live.m3u8" },
  { id: "yahoo", label: "Yahoo Finance", kind: "hls", url: "https://d1ewctnvcwvvvu.cloudfront.net/playlist.m3u8" },
  {
    id: "cnbc",
    label: "CNBC",
    kind: "youtube",
    videoId: "9NyxcX3rhQs",
    url: "https://www.youtube.com/watch?v=9NyxcX3rhQs",
  },
  { id: "cheddar", label: "Cheddar Business", kind: "hls", url: "https://gpuserver3.tier1streams.com/CHEDDAR_BUSINESS/index.m3u8" },
  { id: "ndtv", label: "NDTV Profit", kind: "hls", url: "https://ndtvprofit.akamaized.net/hls/live/2107404/ndtvprofit/master_1.m3u8" },
] as const;

const youtubeEmbedUrl = (videoId: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&playsinline=1`;

export default function TvWidget() {
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>(CHANNELS[0]);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (channel.kind === "youtube") {
      setError(null);
      return;
    }

    const video = videoRef.current;
    if (!video) return;
    setError(null);

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(channel.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setError(`Stream unavailable right now (${data.details}). Try another channel.`);
      });
      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      video.play().catch(() => {});
    } else {
      setError("Your browser doesn't support HLS playback.");
    }
  }, [channel]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 p-1 flex-wrap shrink-0">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            className={`term-btn ${channel.id === c.id ? "active" : ""}`}
            onClick={() => setChannel(c)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-h-0 bg-black">
        {channel.kind === "youtube" ? (
          <iframe
            key={channel.url}
            src={youtubeEmbedUrl(channel.videoId)}
            title={`${channel.label} live stream`}
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video ref={videoRef} className="w-full h-full" autoPlay muted controls playsInline />
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center dim bg-black">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
