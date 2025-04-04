import { DatabaseMetadata, TableStructure } from './databaseService';

/**
 * 缓存服务，用于存储数据库元数据和表结构信息
 */
export class MetadataCache {
  private static instance: MetadataCache;
  private metadataCache: Map<string, DatabaseMetadata> = new Map();
  private tableStructureCache: Map<string, TableStructure> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): MetadataCache {
    if (!MetadataCache.instance) {
      MetadataCache.instance = new MetadataCache();
    }
    return MetadataCache.instance;
  }

  /**
   * 获取数据库元数据
   * @param connectionId 连接ID
   * @returns 数据库元数据或undefined（如果不存在）
   */
  public getMetadata(connectionId: string): DatabaseMetadata | undefined {
    return this.metadataCache.get(connectionId);
  }

  /**
   * 设置数据库元数据
   * @param connectionId 连接ID
   * @param metadata 数据库元数据
   */
  public setMetadata(connectionId: string, metadata: DatabaseMetadata): void {
    this.metadataCache.set(connectionId, metadata);
  }

  /**
   * 获取表结构
   * @param key 缓存键（格式：connectionId:database:table）
   * @returns 表结构或undefined（如果不存在）
   */
  public getTableStructure(key: string): TableStructure | undefined {
    return this.tableStructureCache.get(key);
  }

  /**
   * 设置表结构
   * @param key 缓存键（格式：connectionId:database:table）
   * @param structure 表结构
   */
  public setTableStructure(key: string, structure: TableStructure): void {
    this.tableStructureCache.set(key, structure);
  }

  /**
   * 清除特定连接的缓存
   * @param connectionId 连接ID
   */
  public clearConnectionCache(connectionId: string): void {
    // 清除元数据缓存
    this.metadataCache.delete(connectionId);
    
    // 清除表结构缓存（以connectionId开头的所有键）
    const prefix = `${connectionId}:`;
    for (const key of this.tableStructureCache.keys()) {
      if (key.startsWith(prefix)) {
        this.tableStructureCache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  public clearAllCache(): void {
    this.metadataCache.clear();
    this.tableStructureCache.clear();
  }
}
