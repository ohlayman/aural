declare module 'ffmpeg-static' {
  const ffmpegPath: string;
  export default ffmpegPath;
}

declare module 'ffprobe-static' {
  const ffprobe: { path: string };
  export default ffprobe;
}
