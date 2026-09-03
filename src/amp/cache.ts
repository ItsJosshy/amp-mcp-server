export class TtlCache<T> {
  private readonly entries = new Map<string, { expires: number; value: Promise<T> }>();
  constructor(private readonly ttlMs: number) {}
  get(key: string, loader: () => Promise<T>, refresh = false): Promise<T> {
    const found = this.entries.get(key);
    if (!refresh && found && found.expires > Date.now()) return found.value;
    const value = loader().catch((error) => { this.entries.delete(key); throw error; });
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }
  delete(key?: string): void { if (key === undefined) this.entries.clear(); else this.entries.delete(key); }
}
