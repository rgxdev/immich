import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { StorageCore } from 'src/cores/storage.core';
import { OnEvent } from 'src/decorators';
import {
  DiskHealthHistoryQueryDto,
  DiskHealthHistoryResponseDto,
  DiskHealthResponseDto,
  type DiskMonitorDeviceDto,
} from 'src/dtos/server.dto';
import { CronJob, ImmichWorker, StorageFolder } from 'src/enum';
import { ConfigRepository } from 'src/repositories/config.repository';
import { CronRepository } from 'src/repositories/cron.repository';
import { DiskHealthRepository } from 'src/repositories/disk-health.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { LoggingRepository } from 'src/repositories/logging.repository';
import { ProcessRepository } from 'src/repositories/process.repository';
import { StorageRepository } from 'src/repositories/storage.repository';
import { SystemMetadataRepository } from 'src/repositories/system-metadata.repository';
import { getConfig } from 'src/utils/config';
import { handlePromiseError } from 'src/utils/misc';

type DiskMonitoringDeviceConfig = {
  name: string;
  devicePath: string;
  mountPath: string | null;
  notes: string | null;
};

type MonitoredDevice = DiskMonitoringDeviceConfig & { isPrimary: boolean };

type SmartJson = Record<string, any>;

@Injectable()
export class DiskHealthService {
  private lastResult: DiskHealthResponseDto | null = null;

  constructor(
    private logger: LoggingRepository,
    private configRepository: ConfigRepository,
    private cronRepository: CronRepository,
    private eventRepository: EventRepository,
    private processRepository: ProcessRepository,
    private storageRepository: StorageRepository,
    private systemMetadataRepository: SystemMetadataRepository,
    private diskHealthRepository: DiskHealthRepository,
  ) {
    this.logger.setContext(DiskHealthService.name);
  }

  @OnEvent({ name: 'AppBootstrap', workers: [ImmichWorker.Microservices] })
  async onBootstrap() {
    if (this.configRepository.getWorker() !== ImmichWorker.Microservices) {
      return;
    }

    const config = await this.getSystemConfig();
    if (!config.diskMonitoring.enabled) {
      return;
    }

    await this.runDiskHealthCheck();
    this.cronRepository.create({
      name: CronJob.DiskHealthMonitoring,
      expression: `*/${config.diskMonitoring.checkIntervalMinutes} * * * *`,
      onTick: () => handlePromiseError(this.runDiskHealthCheck(), this.logger),
    });
  }

  @OnEvent({ name: 'ConfigUpdate', server: true, workers: [ImmichWorker.Microservices] })
  async onConfigUpdate() {
    if (this.configRepository.getWorker() !== ImmichWorker.Microservices) {
      return;
    }

    const config = await this.getSystemConfig();
    try {
      this.cronRepository.update({
        name: CronJob.DiskHealthMonitoring,
        expression: `*/${config.diskMonitoring.checkIntervalMinutes} * * * *`,
        start: config.diskMonitoring.enabled,
      });
    } catch {
      if (config.diskMonitoring.enabled) {
        this.cronRepository.create({
          name: CronJob.DiskHealthMonitoring,
          expression: `*/${config.diskMonitoring.checkIntervalMinutes} * * * *`,
          onTick: () => handlePromiseError(this.runDiskHealthCheck(), this.logger),
        });
      }
    }
  }

  async getDiskHealth(): Promise<DiskHealthResponseDto> {
    return this.lastResult ?? this.runDiskHealthCheck();
  }

  async getDiskHealthHistory(dto: DiskHealthHistoryQueryDto = {}): Promise<DiskHealthHistoryResponseDto> {
    const config = await this.getSystemConfig();
    const to = new Date();
    const from = DateTime.fromJSDate(to).minus({ days: config.diskMonitoring.retentionDays }).toJSDate();
    const rows = await this.diskHealthRepository.getHistory(from, to, dto.devicePath);
    const items = new Map<
      string,
      {
        name: string;
        devicePath: string;
        mountPath: string | null;
        isPrimary: boolean;
        points: DiskHealthHistoryResponseDto['items'][number]['points'];
      }
    >();

    for (const row of rows) {
      const item = items.get(row.devicePath) ?? {
        name: row.name,
        devicePath: row.devicePath,
        mountPath: row.mountPath,
        isPrimary: row.isPrimary,
        points: [],
      };

      item.points.push({
        createdAt: row.createdAt as Date,
        status: row.status as DiskMonitorDeviceDto['status'],
        temperatureCelsius: row.temperatureCelsius,
        availableBytes: row.availableBytes,
        usedBytes: row.usedBytes,
        totalBytes: row.totalBytes,
        healthPercent: row.healthPercent,
      });

      items.set(row.devicePath, item);
    }

    return { from, to, items: [...items.values()] };
  }

  async runDiskHealthCheck(): Promise<DiskHealthResponseDto> {
    const config = await this.getSystemConfig();
    const devices = await this.getMonitoredDevices(config.diskMonitoring.devices);
    const checkedAt = new Date();
    const result = await Promise.all(devices.map((device) => this.probeDevice(device, checkedAt)));

    await this.diskHealthRepository.createMany(
      result.map((device) => ({
        name: device.name,
        devicePath: device.devicePath,
        mountPath: device.mountPath,
        isPrimary: device.isPrimary,
        deviceType: device.deviceType,
        protocol: device.protocol,
        status: device.status,
        healthPercent: device.healthPercent,
        temperatureCelsius: device.temperatureCelsius,
        powerOnHours: device.powerOnHours,
        availableBytes: device.availableBytes,
        usedBytes: device.usedBytes,
        totalBytes: device.totalBytes,
        issues: device.issues,
        lastCheckedAt: device.lastCheckedAt,
      })),
    );

    await this.diskHealthRepository.cleanup(
      DateTime.now().minus({ days: config.diskMonitoring.retentionDays }).toJSDate(),
    );

    if (this.lastResult) {
      const changedDevices = result.flatMap((device) => {
        const previous = this.lastResult!.devices.find((d) => d.devicePath === device.devicePath);
        if (previous && previous.status !== device.status) {
          return [{ name: device.name, devicePath: device.devicePath, status: device.status, previousStatus: previous.status }];
        }
        return [];
      });

      if (changedDevices.length > 0) {
        await this.eventRepository.emit('DiskHealthAlert', { devices: changedDevices });
      }
    }

    this.lastResult = {
      checkedAt,
      summary: {
        total: result.length,
        healthy: result.filter((device) => device.status === 'healthy').length,
        warning: result.filter((device) => device.status === 'warning').length,
        critical: result.filter((device) => device.status === 'critical').length,
        unknown: result.filter((device) => device.status === 'unknown' || device.status === 'degraded').length,
      },
      devices: result,
    };

    return this.lastResult;
  }

  private async getSystemConfig() {
    return getConfig(
      {
        configRepo: this.configRepository,
        metadataRepo: this.systemMetadataRepository,
        logger: this.logger,
      },
      { withCache: false },
    );
  }

  private async getMonitoredDevices(configured: DiskMonitoringDeviceConfig[]): Promise<MonitoredDevice[]> {
    const primary = await this.getPrimaryDevice();
    const items: MonitoredDevice[] = primary ? [primary] : [];

    for (const device of configured) {
      if (!items.some((item) => item.devicePath === device.devicePath)) {
        items.push({ ...device, isPrimary: false });
      }
    }

    return items;
  }

  private async getPrimaryDevice(): Promise<MonitoredDevice | null> {
    const libraryPath = await this.storageRepository.realpath(StorageCore.getBaseFolder(StorageFolder.Library));
    const mount = await this.resolveMount(libraryPath);
    if (!mount) {
      return null;
    }

    return {
      name: 'Immich Primary Storage',
      devicePath: mount.devicePath,
      mountPath: mount.mountPath,
      notes: null,
      isPrimary: true,
    };
  }

  private async resolveMount(path: string): Promise<{ devicePath: string; mountPath: string } | null> {
    const result = await this.exec('df', ['-P', path]);
    if (result.code !== 0) {
      return null;
    }

    const line = result.stdout.trim().split('\n').at(-1);
    if (!line) {
      return null;
    }

    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) {
      return null;
    }

    return {
      devicePath: parts[0],
      mountPath: parts.at(-1)!,
    };
  }

  private async probeDevice(device: MonitoredDevice, checkedAt: Date): Promise<DiskMonitorDeviceDto> {
    const usage = await this.getUsage(device.mountPath);
    const smart = await this.exec('smartctl', ['--json', '-a', device.devicePath]);
    const issues: string[] = [];
    let payload: SmartJson | null = null;

    if (smart.stdout) {
      try {
        payload = JSON.parse(smart.stdout) as SmartJson;
      } catch (error) {
        issues.push(`Unable to parse smartctl output: ${error}`);
      }
    }

    if (smart.code !== 0 && smart.stderr.trim()) {
      issues.push(smart.stderr.trim());
    }

    for (const message of payload?.smartctl?.messages ?? []) {
      if (message?.string) {
        issues.push(message.string);
      }
    }

    const temperatureCelsius =
      payload?.temperature?.current ?? payload?.nvme_smart_health_information_log?.temperature ?? null;
    const powerOnHours = payload?.power_on_time?.hours ?? null;
    const healthPercent =
      payload?.nvme_smart_health_information_log?.percentage_used !== undefined
        ? Math.max(0, 100 - Number(payload.nvme_smart_health_information_log.percentage_used))
        : null;

    let status: DiskMonitorDeviceDto['status'] = 'unknown';
    if (payload?.smart_status?.passed === true) {
      status = 'healthy';
    } else if (payload?.smart_status?.passed === false) {
      status = 'critical';
    } else if (payload) {
      status = smart.code === 0 ? 'unknown' : 'degraded';
    }

    if (status === 'healthy' && temperatureCelsius !== null && temperatureCelsius >= 55) {
      status = temperatureCelsius >= 65 ? 'critical' : 'warning';
      issues.push(`High temperature: ${temperatureCelsius}C`);
    }

    if (status === 'healthy' && healthPercent !== null && healthPercent < 50) {
      status = healthPercent < 25 ? 'critical' : 'warning';
      issues.push(`Reduced remaining health: ${healthPercent}%`);
    }

    if (issues.length === 0 && status === 'unknown') {
      issues.push('No SMART health information available');
    }

    return {
      name: device.name,
      devicePath: device.devicePath,
      mountPath: device.mountPath,
      isPrimary: device.isPrimary,
      deviceType: payload?.device?.type ?? null,
      protocol: payload?.device?.protocol ?? null,
      status,
      healthPercent,
      temperatureCelsius,
      powerOnHours,
      availableBytes: usage?.available ?? null,
      usedBytes: usage ? usage.total - usage.free : null,
      totalBytes: usage?.total ?? null,
      lastCheckedAt: checkedAt,
      issues,
    };
  }

  private async getUsage(mountPath: string | null) {
    if (!mountPath) {
      return null;
    }

    try {
      return await this.storageRepository.checkDiskUsage(mountPath);
    } catch (error) {
      this.logger.warn(`Unable to read disk usage for ${mountPath}: ${error}`);
      return null;
    }
  }

  private async exec(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    const process = this.processRepository.spawn(command, args);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    process.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    process.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));

    const codePromise = new Promise<number>((resolve) => {
      process.on('error', () => resolve(1));
      process.on('exit', (value) => resolve(value ?? 1));
    });
    const stdoutPromise = new Promise<void>((resolve) => process.stdout.on('end', () => resolve()));
    const stderrPromise = new Promise<void>((resolve) => process.stderr.on('end', () => resolve()));

    const [code] = await Promise.all([codePromise, stdoutPromise, stderrPromise]);

    return {
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    };
  }
}
