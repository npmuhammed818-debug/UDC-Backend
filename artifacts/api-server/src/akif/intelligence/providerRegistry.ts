import type {
  AkifResearchProvider,
  AkifResearchQuery,
  AkifResearchResult,
} from "./types";

export class AkifProviderRegistry {
  private readonly providers = new Map<string, AkifResearchProvider>();

  register(provider: AkifResearchProvider) {
    if (this.providers.has(provider.id)) {
      throw new Error(`AKIF provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  get(providerId: string) {
    return this.providers.get(providerId);
  }

  list() {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
    }));
  }

  async search(
    providerId: string,
    query: AkifResearchQuery,
  ): Promise<AkifResearchResult> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown AKIF provider: ${providerId}`);
    }
    return provider.searchCompanies(query);
  }
}

export const akifProviderRegistry = new AkifProviderRegistry();
