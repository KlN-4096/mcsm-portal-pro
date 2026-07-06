import type { Component, Ref } from "vue";

export interface KoishiClientExtensionContext {
  page(options: {
    id: string;
    path: string;
    name: string;
    icon?: string;
    component: Component;
  }): void;
}

export function defineExtension(
  callback: (ctx: KoishiClientExtensionContext) => void,
): unknown;

export interface Events {
  "mcsm-portal-pro/preview-data"(): unknown;
}

export function send<T extends keyof Events>(
  event: T,
  ...args: Parameters<Events[T]>
): Promise<Awaited<ReturnType<Events[T]>>>;

export function useConfig<T extends { locale?: string } = { locale?: string }>(): Ref<T>;

export function useRpc<T = unknown>(): Ref<T | undefined>;
