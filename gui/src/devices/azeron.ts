import config from "@devices/azeron/config.toml";

const cfg = config as {
  vendor_id: number;
  product_id: number;
  friendly_name: string;
  button_count: number;
  raw_name_aliases: string[];
  capabilities: string[];
};

export const VENDOR_ID: number = cfg.vendor_id;
export const PRODUCT_ID: number = cfg.product_id;
export const FRIENDLY_NAME: string = cfg.friendly_name;
export const BUTTON_COUNT: number = cfg.button_count;
export const RAW_NAME_ALIASES: readonly string[] = cfg.raw_name_aliases;
export const CAPABILITIES: readonly string[] = cfg.capabilities;
