/// <reference types="vite/client" />

declare module "*.css";
declare module "*.svg";
declare module "*.svg?no-inline" {
  const src: string;
  export default src;
}
