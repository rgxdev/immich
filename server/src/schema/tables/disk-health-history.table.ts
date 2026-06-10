import { Column, CreateDateColumn, Generated, Index, PrimaryGeneratedColumn, Table, Timestamp } from '@immich/sql-tools';
import { ColumnType } from 'kysely';

@Table('disk_health_history')
@Index({ columns: ['devicePath', 'createdAt'] })
export class DiskHealthHistoryTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @Column()
  name!: string;

  @Column()
  devicePath!: string;

  @Column({ nullable: true })
  mountPath!: string | null;

  @Column({ type: 'boolean', default: false })
  isPrimary!: Generated<boolean>;

  @Column({ nullable: true })
  deviceType!: string | null;

  @Column({ nullable: true })
  protocol!: string | null;

  @Column()
  status!: string;

  @Column({ nullable: true })
  healthPercent!: number | null;

  @Column({ nullable: true })
  temperatureCelsius!: number | null;

  @Column({ nullable: true })
  powerOnHours!: number | null;

  @Column({ type: 'bigint', nullable: true })
  availableBytes!: ColumnType<number> | null;

  @Column({ type: 'bigint', nullable: true })
  usedBytes!: ColumnType<number> | null;

  @Column({ type: 'bigint', nullable: true })
  totalBytes!: ColumnType<number> | null;

  @Column({ type: 'jsonb', nullable: true })
  issues!: string[] | null;

  @Column({ type: 'timestamp with time zone' })
  lastCheckedAt!: Timestamp;
}
