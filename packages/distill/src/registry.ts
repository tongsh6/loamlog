import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DistillerFactory, DistillerPlugin, DistillerRegistry } from "@loamlog/core";

function isDistillerPlugin(value: unknown): value is DistillerPlugin {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    Array.isArray(candidate.supported_types) &&
    typeof candidate.run === "function"
  );
}

function resolveImportSpecifier(specifier: string): string {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("..")) {
    return pathToFileURL(path.resolve(specifier)).href;
  }

  return specifier;
}

export function createDistillerRegistry(): DistillerRegistry {
  const store = new Map<string, DistillerPlugin>();

  return {
    async load(specifier: string, config?: Record<string, unknown>): Promise<DistillerPlugin> {
      const loaded = (await import(resolveImportSpecifier(specifier))) as { default?: unknown };
      const target = loaded.default;

      let plugin: DistillerPlugin;
      if (typeof target === "function") {
        const produced = await (target as DistillerFactory)(config);
        if (!isDistillerPlugin(produced)) {
          throw new Error(`invalid distiller export from ${specifier}: factory did not return DistillerPlugin`);
        }
        plugin = produced;
      } else if (isDistillerPlugin(target)) {
        plugin = target;
      } else {
        throw new Error(`invalid distiller export from ${specifier}: expected default DistillerFactory or DistillerPlugin`);
      }

      this.register(plugin);
      return plugin;
    },

    register(plugin: DistillerPlugin): void {
      if (store.has(plugin.id)) {
        throw new Error(`distiller already registered: ${plugin.id}`);
      }
      store.set(plugin.id, plugin);
    },

    get(id: string): DistillerPlugin | undefined {
      return store.get(id);
    },

    list(): DistillerPlugin[] {
      return Array.from(store.values());
    },
  };
}
