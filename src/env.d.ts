export interface MediaEntry {
  id: string;
  name: string;
  title: string;
  file: string;
  url: string;
  kind: 'midi' | 'audio';
  size: number;
}

declare module 'virtual:media-manifest' {
  const entries: MediaEntry[];
  export default entries;
}
