import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { GenerateSql } from 'src/decorators';
import { DB } from 'src/schema';
import { DiskHealthHistoryTable } from 'src/schema/tables/disk-health-history.table';

@Injectable()
export class DiskHealthRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  createMany(items: Array<Insertable<DiskHealthHistoryTable>>) {
    if (items.length === 0) {
      return Promise.resolve([]);
    }

    return this.db.insertInto('disk_health_history').values(items).returningAll().execute();
  }

  @GenerateSql()
  getHistory(from: Date, to: Date, devicePath?: string) {
    let query = this.db
      .selectFrom('disk_health_history')
      .selectAll()
      .where('createdAt', '>=', from)
      .where('createdAt', '<=', to)
      .orderBy('devicePath')
      .orderBy('createdAt', 'asc');

    if (devicePath) {
      query = query.where('devicePath', '=', devicePath);
    }

    return query.execute();
  }

  cleanup(before: Date) {
    return this.db.deleteFrom('disk_health_history').where('createdAt', '<', before).execute();
  }
}
