import { ImmichWorker } from 'src/enum';
import { StorageCore } from 'src/cores/storage.core';
import { ConfigRepository } from 'src/repositories/config.repository';
import { CronRepository } from 'src/repositories/cron.repository';
import { DiskHealthRepository } from 'src/repositories/disk-health.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { ProcessRepository } from 'src/repositories/process.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { DiskHealthService } from 'src/services/disk-health.service';
import { mockEnvData } from 'test/repositories/config.repository.mock';
import { automock, mockSpawn } from 'test/utils';
import { beforeEach, describe, expect, it } from 'vitest';

describe(DiskHealthService.name, () => {
  let sut: DiskHealthService;
  let logger: ReturnType<typeof automock<LoggingRepository>>;
  let config: ReturnType<typeof automock<ConfigRepository>>;
  let cron: ReturnType<typeof automock<CronRepository>>;
  let event: ReturnType<typeof automock<EventRepository>>;
  let process: ReturnType<typeof automock<ProcessRepository>>;
  let storage: ReturnType<typeof automock<StorageRepository>>;
  let systemMetadata: ReturnType<typeof automock<SystemMetadataRepository>>;
  let history: ReturnType<typeof automock<DiskHealthRepository>>;

  const dfOutput =
    'Filesystem     1024-blocks      Used Available Capacity Mounted on\n/dev/sda1         1000000    400000    600000      40% /data/library\n';
  const smartHealthy = JSON.stringify({
    smart_status: { passed: true },
    temperature: { current: 33 },
    power_on_time: { hours: 1200 },
    device: { protocol: 'ATA', type: 'sat' },
  });
  const smartCritical = JSON.stringify({
    smart_status: { passed: false },
    temperature: { current: 33 },
    device: { protocol: 'ATA', type: 'sat' },
  });

  beforeEach(() => {
    StorageCore.reset();
    StorageCore.setMediaLocation('/data');
    logger = automock(LoggingRepository, { args: [undefined as never, { getEnv: () => ({}) } as never], strict: false });
    config = automock(ConfigRepository, { strict: false });
    cron = automock(CronRepository, { args: [undefined as never, logger as never], strict: false });
    event = automock(EventRepository, { args: [undefined as never, undefined as never, logger as never], strict: false });
    process = automock(ProcessRepository, { strict: false });
    storage = automock(StorageRepository, { args: [logger], strict: false });
    systemMetadata = automock(SystemMetadataRepository, { strict: false });
    history = automock(DiskHealthRepository, { strict: false });

    config.getEnv.mockReturnValue(
      mockEnvData({
        storage: { ignoreMountCheckErrors: false },
        workers: [ImmichWorker.Api, ImmichWorker.Microservices],
      }),
    );
    config.getWorker.mockReturnValue(ImmichWorker.Api);
    storage.realpath.mockImplementation(async (path) => path);
    systemMetadata.get.mockResolvedValue({
      diskMonitoring: {
        enabled: true,
        checkIntervalMinutes: 15,
        retentionDays: 7,
        devices: [{ name: 'Archive HDD', devicePath: '/dev/sdb', mountPath: '/mnt/archive', notes: 'cold' }],
      },
    });

    sut = new DiskHealthService(logger, config, cron, event, process, storage, systemMetadata, history);
  });

  it('should return primary and configured devices with smart data and persist snapshots', async () => {
    process.spawn
      .mockReturnValueOnce(
        mockSpawn(
          0,
          'Filesystem     1024-blocks      Used Available Capacity Mounted on\n/dev/sda1         1000000    400000    600000      40% /data/library\n',
          '',
        ),
      )
      .mockReturnValueOnce(
        mockSpawn(
          0,
          JSON.stringify({
            smart_status: { passed: true },
            temperature: { current: 33 },
            power_on_time: { hours: 1200 },
            device: { protocol: 'ATA', type: 'sat' },
          }),
          '',
        ),
      )
      .mockReturnValueOnce(
        mockSpawn(
          0,
          JSON.stringify({
            smart_status: { passed: false },
            nvme_smart_health_information_log: { percentage_used: 12, temperature: 49 },
            power_on_time: { hours: 8000 },
            device: { protocol: 'NVMe', type: 'nvme' },
          }),
          '',
        ),
      );

    storage.checkDiskUsage
      .mockResolvedValueOnce({ available: 600_000, free: 600_000, total: 1_000_000 })
      .mockResolvedValueOnce({ available: 2_000_000, free: 2_000_000, total: 4_000_000 });

    const result = await sut.runDiskHealthCheck();

    expect(result.devices).toHaveLength(2);
    expect(result.devices[0]).toMatchObject({
      name: 'Immich Primary Storage',
      devicePath: '/dev/sda1',
      status: 'healthy',
      temperatureCelsius: 33,
      mountPath: '/data/library',
    });
    expect(result.devices[1]).toMatchObject({
      name: 'Archive HDD',
      devicePath: '/dev/sdb',
      status: 'critical',
      healthPercent: 88,
      temperatureCelsius: 49,
      mountPath: '/mnt/archive',
    });
    expect(history.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ devicePath: '/dev/sda1', status: 'healthy' }),
        expect.objectContaining({ devicePath: '/dev/sdb', status: 'critical' }),
      ]),
    );
  });

  it('should report unknown status and issue when smartctl fails', async () => {
    systemMetadata.get.mockResolvedValueOnce({
      diskMonitoring: {
        enabled: true,
        checkIntervalMinutes: 15,
        retentionDays: 7,
        devices: [],
      },
    });

    process.spawn
      .mockReturnValueOnce(
        mockSpawn(
          0,
          'Filesystem     1024-blocks      Used Available Capacity Mounted on\n/dev/sda1         1000000    400000    600000      40% /data/library\n',
          '',
        ),
      )
      .mockReturnValueOnce(mockSpawn(2, '', 'smartctl: command not found'));

    storage.checkDiskUsage.mockResolvedValueOnce({ available: 600_000, free: 600_000, total: 1_000_000 });

    const result = await sut.runDiskHealthCheck();

    expect(result.devices[0]).toMatchObject({
      devicePath: '/dev/sda1',
      status: 'unknown',
    });
    expect(result.devices[0].issues).toContain('smartctl: command not found');
  });

  describe('status change detection', () => {
    beforeEach(() => {
      systemMetadata.get.mockResolvedValue({
        diskMonitoring: { enabled: true, checkIntervalMinutes: 15, retentionDays: 7, devices: [] },
      });
      storage.checkDiskUsage.mockResolvedValue({ available: 600_000, free: 600_000, total: 1_000_000 });
    });

    it('should not emit DiskHealthAlert on the first check', async () => {
      process.spawn
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartHealthy, ''));

      await sut.runDiskHealthCheck();

      expect(event.emit).not.toHaveBeenCalledWith('DiskHealthAlert', expect.anything());
    });

    it('should emit DiskHealthAlert when a disk transitions from healthy to critical', async () => {
      process.spawn
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartHealthy, ''))
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartCritical, ''));

      await sut.runDiskHealthCheck();
      await sut.runDiskHealthCheck();

      expect(event.emit).toHaveBeenCalledWith('DiskHealthAlert', {
        devices: [expect.objectContaining({ devicePath: '/dev/sda1', status: 'critical', previousStatus: 'healthy' })],
      });
    });

    it('should emit DiskHealthAlert on recovery from critical to healthy', async () => {
      process.spawn
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartCritical, ''))
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartHealthy, ''));

      await sut.runDiskHealthCheck();
      await sut.runDiskHealthCheck();

      expect(event.emit).toHaveBeenCalledWith('DiskHealthAlert', {
        devices: [expect.objectContaining({ devicePath: '/dev/sda1', status: 'healthy', previousStatus: 'critical' })],
      });
    });

    it('should not emit DiskHealthAlert when status is unchanged between checks', async () => {
      process.spawn
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartHealthy, ''))
        .mockReturnValueOnce(mockSpawn(0, dfOutput, ''))
        .mockReturnValueOnce(mockSpawn(0, smartHealthy, ''));

      await sut.runDiskHealthCheck();
      await sut.runDiskHealthCheck();

      expect(event.emit).not.toHaveBeenCalledWith('DiskHealthAlert', expect.anything());
    });
  });
});
