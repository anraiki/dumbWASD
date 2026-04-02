/// <reference types="vite/client" />

declare module "*.css";
declare module "*.svg";
declare module "*.svg?no-inline" {
  const src: string;
  export default src;
}
declare module "*.svg?raw" {
  const src: string;
  export default src;
}
declare module "*.toml" {
  const value: Record<string, unknown>;
  export default value;
}
