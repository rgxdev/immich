<script lang="ts">
  import { locale } from '$lib/stores/preferences.store';
  import type { DiskHealthHistoryResponseDto, DiskHealthResponseDto } from '@immich/sdk';
  import {
    Code,
    FormatBytes,
    Icon,
    Table,
    TableBody,
    TableCell,
    TableHeader,
    TableHeading,
    TableRow,
    Text,
  } from '@immich/ui';
  import {
    mdiAlertCircle,
    mdiAlertOutline,
    mdiCheckCircleOutline,
    mdiHarddisk,
    mdiThermometer,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  type Props = {
    diskHealthPromise: Promise<DiskHealthResponseDto>;
    diskHistoryPromise: Promise<DiskHealthHistoryResponseDto>;
  };

  const { diskHealthPromise, diskHistoryPromise }: Props = $props();

  const statusClass: Record<string, string> = {
    healthy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    degraded: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    unknown: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };

  const getStatusLabel = (status: DiskHealthResponseDto['devices'][number]['status']) => {
    switch (status) {
      case 'healthy':
        return $t('admin.disk_health_status_healthy');
      case 'warning':
        return $t('warning');
      case 'critical':
        return $t('admin.disk_health_status_critical');
      case 'degraded':
        return $t('admin.disk_health_status_degraded');
      case 'unknown':
        return $t('unknown');
    }
  };

  const buildSparkline = (values: Array<number | null>) => {
    const filtered = values.filter((value): value is number => value !== null);
    if (filtered.length < 2) {
      return '';
    }

    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const range = Math.max(max - min, 1);
    const points = values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100;
        const y = value === null ? 100 : 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');

    return points;
  };

  const getCapacityPercent = (usedBytes: number | null, totalBytes: number | null) => {
    if (usedBytes === null || totalBytes === null || totalBytes === 0) return null;
    return Math.round((usedBytes / totalBytes) * 100);
  };

  const getCapacityBarClass = (percent: number) => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 75) return 'bg-amber-500';
    return 'bg-immich-primary dark:bg-immich-dark-primary';
  };
</script>

<div class="mt-8 flex flex-col gap-5">
  <div>
    <Text class="mb-2" fontWeight="medium">{$t('admin.disk_health_monitoring')}</Text>
    {#await diskHealthPromise}
      <div class="grid gap-4 md:grid-cols-4">
        {#each Array(4) as _}
          <div class="h-28 animate-pulse rounded-3xl bg-subtle dark:bg-immich-dark-gray"></div>
        {/each}
      </div>
    {:then health}
      <div class="grid gap-4 md:grid-cols-4">
        <div class="flex h-28 flex-col justify-between rounded-3xl bg-subtle p-5 text-primary dark:bg-immich-dark-gray">
          <div class="flex items-center gap-2">
            <Icon icon={mdiHarddisk} size="20" />
            <span class="text-sm font-medium">{$t('admin.disk_health_monitored_disks')}</span>
          </div>
          <div class="font-mono text-3xl font-semibold">{health.summary.total}</div>
        </div>

        <div
          class="flex h-28 flex-col justify-between rounded-3xl p-5 {health.summary.healthy > 0
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-subtle text-gray-500 dark:bg-immich-dark-gray'}"
        >
          <div class="flex items-center gap-2">
            <Icon icon={mdiCheckCircleOutline} size="20" />
            <span class="text-sm font-medium">{$t('admin.disk_health_status_healthy')}</span>
          </div>
          <div class="font-mono text-3xl font-semibold">{health.summary.healthy}</div>
        </div>

        <div
          class="flex h-28 flex-col justify-between rounded-3xl p-5 {health.summary.warning > 0
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
            : 'bg-subtle text-gray-500 dark:bg-immich-dark-gray'}"
        >
          <div class="flex items-center gap-2">
            <Icon icon={mdiAlertOutline} size="20" />
            <span class="text-sm font-medium">{$t('warning')}</span>
          </div>
          <div class="font-mono text-3xl font-semibold">{health.summary.warning}</div>
        </div>

        <div
          class="flex h-28 flex-col justify-between rounded-3xl p-5 {health.summary.critical + health.summary.unknown > 0
            ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
            : 'bg-subtle text-gray-500 dark:bg-immich-dark-gray'}"
        >
          <div class="flex items-center gap-2">
            <Icon icon={mdiAlertCircle} size="20" />
            <span class="text-sm font-medium">{$t('admin.disk_health_status_critical_unknown')}</span>
          </div>
          <div class="font-mono text-3xl font-semibold">{health.summary.critical + health.summary.unknown}</div>
        </div>
      </div>
    {/await}
  </div>

  <div>
    <Text class="mb-2" fontWeight="medium">{$t('admin.disk_health_disk_details')}</Text>
    {#await Promise.all([diskHealthPromise, diskHistoryPromise])}
      <div class="h-40 animate-pulse rounded-3xl bg-subtle p-5 dark:bg-immich-dark-gray"></div>
    {:then [health, history]}
      <Table striped size="small">
        <TableHeader>
          <TableHeading>{$t('admin.disk_health_disk')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_status')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_temperature')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_capacity')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_health')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_trend')}</TableHeading>
          <TableHeading>{$t('admin.disk_health_issues')}</TableHeading>
        </TableHeader>
        <TableBody>
          {#each health.devices as device (device.devicePath)}
            {@const historyItem = history.items.find((item) => item.devicePath === device.devicePath)}
            {@const trend = buildSparkline(historyItem?.points.map((point) => point.temperatureCelsius) ?? [])}
            {@const capacityPercent = getCapacityPercent(device.usedBytes ?? null, device.totalBytes)}
            <TableRow>
              <TableCell>
                <div class="flex min-w-0 flex-col gap-0.5">
                  <div class="flex items-center gap-1.5">
                    <Icon icon={mdiHarddisk} size="14" class="shrink-0 text-gray-400" />
                    <span class="font-medium"
                      >{device.isPrimary ? $t('admin.disk_health_primary_disk') : device.name}</span
                    >
                  </div>
                  <Code class="max-w-48 truncate text-xs">{device.devicePath}</Code>
                  {#if device.mountPath}
                    <span class="text-xs text-gray-500">{device.mountPath}</span>
                  {/if}
                </div>
              </TableCell>
              <TableCell>
                <span class={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[device.status]}`}>
                  {getStatusLabel(device.status)}
                </span>
              </TableCell>
              <TableCell>
                {#if device.temperatureCelsius !== null}
                  <div class="flex items-center gap-1">
                    <Icon
                      icon={mdiThermometer}
                      size="14"
                      class={device.temperatureCelsius >= 55
                        ? 'text-red-500'
                        : device.temperatureCelsius >= 45
                          ? 'text-amber-500'
                          : 'text-gray-400'}
                    />
                    <span>{device.temperatureCelsius} °C</span>
                  </div>
                {:else}
                  <span class="text-gray-400">{$t('not_available')}</span>
                {/if}
              </TableCell>
              <TableCell>
                {#if device.totalBytes !== null}
                  <div class="flex min-w-28 flex-col gap-1">
                    <div class="text-xs">
                      <FormatBytes bytes={device.usedBytes ?? 0} precision={0} /> / <FormatBytes
                        bytes={device.totalBytes}
                        precision={0}
                      />
                    </div>
                    {#if capacityPercent !== null}
                      <div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          class="h-full rounded-full transition-all {getCapacityBarClass(capacityPercent)}"
                          style="width: {capacityPercent}%"
                        ></div>
                      </div>
                      <span class="text-xs text-gray-500">{capacityPercent}%</span>
                    {/if}
                  </div>
                {:else}
                  <span class="text-gray-400">{$t('not_available')}</span>
                {/if}
              </TableCell>
              <TableCell>
                {#if device.healthPercent !== null}
                  <div class="flex flex-col gap-1">
                    <span
                      class={device.healthPercent >= 80
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : device.healthPercent >= 50
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'}
                    >
                      {device.healthPercent.toLocaleString($locale)}%
                    </span>
                  </div>
                {:else}
                  <span class="text-gray-400">{$t('not_available')}</span>
                {/if}
              </TableCell>
              <TableCell>
                {#if trend}
                  <svg viewBox="0 0 100 100" class="h-8 w-20 overflow-visible text-immich-primary dark:text-immich-dark-primary">
                    <polyline fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points={trend}></polyline>
                  </svg>
                {:else}
                  <span class="text-xs text-gray-400 italic">{$t('admin.disk_health_not_enough_history')}</span>
                {/if}
              </TableCell>
              <TableCell>
                {#if device.issues.length > 0}
                  <div class="max-w-72 space-y-1">
                    {#each device.issues as issue}
                      <div class="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        {issue}
                      </div>
                    {/each}
                  </div>
                {:else}
                  <span class="text-xs text-gray-400">{$t('none')}</span>
                {/if}
              </TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </Table>
    {/await}
  </div>
</div>
